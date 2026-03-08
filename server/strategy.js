/**
 * MambafX Forex Scalping Strategy Engine
 * Implements price action-based entry/exit logic with market structure analysis
 */

export class MambafXStrategy {
  constructor(config = {}) {
    this.config = {
      minConfirmations: 3,
      riskRewardRatio: 7,
      positionSizePercent: 10,
      stopLossPips: 30,
      profitTarget1Ratio: 3,
      profitTarget2Ratio: 5,
      trailingStopPips: 20,
      consolidationThreshold: 50, // pips
      volumeThreshold: 1.2, // 20% above average
      ...config,
    };
    
    this.confirmations = [];
    this.tradeSetup = null;
  }

  /**
   * Analyze 4H chart for directional bias
   */
  analyzeBias(candles4H) {
    if (candles4H.length < 50) return null;

    const recent = candles4H.slice(-50);
    const ma50 = this.calculateMA(recent, 50);
    const currentPrice = recent[recent.length - 1].close;

    // Determine trend direction
    let bias = null;
    if (currentPrice > ma50) {
      bias = 'BULLISH';
    } else if (currentPrice < ma50) {
      bias = 'BEARISH';
    }

    // Check for higher highs (bullish) or lower lows (bearish)
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    const recentHighs = highs.slice(-10);
    const recentLows = lows.slice(-10);

    const isHigherHighs = recentHighs[recentHighs.length - 1] > Math.max(...recentHighs.slice(0, -1));
    const isLowerLows = recentLows[recentLows.length - 1] < Math.min(...recentLows.slice(0, -1));

    if (isHigherHighs && bias === 'BULLISH') {
      return { bias: 'BULLISH', strength: 'STRONG', ma50 };
    } else if (isLowerLows && bias === 'BEARISH') {
      return { bias: 'BEARISH', strength: 'STRONG', ma50 };
    } else if (bias) {
      return { bias, strength: 'WEAK', ma50 };
    }

    return null;
  }

  /**
   * Detect support and resistance levels
   */
  detectSupportResistance(candles, lookback = 20) {
    const recent = candles.slice(-lookback);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const currentPrice = recent[recent.length - 1].close;

    // Find local support and resistance
    const support = [];
    const resistance = [];

    for (let i = 1; i < recent.length - 1; i++) {
      // Local low (support)
      if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i + 1].low) {
        support.push(recent[i].low);
      }
      // Local high (resistance)
      if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i + 1].high) {
        resistance.push(recent[i].high);
      }
    }

    return {
      support: support.length > 0 ? Math.max(...support) : minLow,
      resistance: resistance.length > 0 ? Math.min(...resistance) : maxHigh,
      currentPrice,
    };
  }

  /**
   * Detect market consolidation (skip trades)
   */
  detectConsolidation(candles, lookback = 20) {
    const recent = candles.slice(-lookback);
    const { support, resistance } = this.detectSupportResistance(candles, lookback);

    const range = resistance - support;
    const consolidationThreshold = this.config.consolidationThreshold;

    // If range is too small, market is consolidating
    if (range < consolidationThreshold) {
      return {
        isConsolidating: true,
        range,
        threshold: consolidationThreshold,
        reason: 'Range too small',
      };
    }

    // Check if price is moving sideways (no trend)
    const closes = recent.map(c => c.close);
    const ma20 = this.calculateMA(closes, 20);
    const distanceFromMA = Math.abs(closes[closes.length - 1] - ma20) / ma20;

    if (distanceFromMA < 0.002) { // Less than 0.2% from MA
      return {
        isConsolidating: true,
        range,
        distanceFromMA,
        reason: 'Price too close to MA (sideways)',
      };
    }

    return { isConsolidating: false, range, distanceFromMA };
  }

  /**
   * Detect breakout from support/resistance
   */
  detectBreakout(candles, support, resistance) {
    const current = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    let breakoutType = null;
    let breakoutLevel = null;
    let breakoutStrength = 0;

    // Bullish breakout (above resistance)
    if (previous.close <= resistance && current.close > resistance) {
      const breakoutDistance = current.close - resistance;
      breakoutStrength = breakoutDistance / resistance; // Percentage
      breakoutType = 'BULLISH';
      breakoutLevel = resistance;
    }

    // Bearish breakout (below support)
    if (previous.close >= support && current.close < support) {
      const breakoutDistance = support - current.close;
      breakoutStrength = breakoutDistance / support; // Percentage
      breakoutType = 'BEARISH';
      breakoutLevel = support;
    }

    return { breakoutType, breakoutLevel, breakoutStrength };
  }

  /**
   * Analyze market structure (higher highs/lows for trend confirmation)
   */
  analyzeMarketStructure(candles, lookback = 10) {
    const recent = candles.slice(-lookback);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    // Check for higher highs and higher lows (bullish)
    let isHigherHighs = true;
    let isHigherLows = true;
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] <= highs[i - 1]) isHigherHighs = false;
      if (lows[i] <= lows[i - 1]) isHigherLows = false;
    }

    // Check for lower highs and lower lows (bearish)
    let isLowerHighs = true;
    let isLowerLows = true;
    for (let i = 1; i < highs.length; i++) {
      if (highs[i] >= highs[i - 1]) isLowerHighs = false;
      if (lows[i] >= lows[i - 1]) isLowerLows = false;
    }

    let structure = null;
    if (isHigherHighs && isHigherLows) {
      structure = 'BULLISH_STRUCTURE';
    } else if (isLowerHighs && isLowerLows) {
      structure = 'BEARISH_STRUCTURE';
    } else {
      structure = 'NO_STRUCTURE';
    }

    return {
      structure,
      isHigherHighs,
      isHigherLows,
      isLowerHighs,
      isLowerLows,
    };
  }

  /**
   * Generate entry signal with confirmation count
   */
  generateEntrySignal(candles4H, candles1M, bias) {
    this.confirmations = [];
    this.tradeSetup = null;

    // Confirmation 1: Directional bias from 4H
    if (bias && bias.strength === 'STRONG') {
      this.confirmations.push({
        type: 'BIAS',
        value: bias.bias,
        strength: bias.strength,
      });
    }

    // Confirmation 2: Breakout detected
    const { support, resistance } = this.detectSupportResistance(candles1M);
    const { breakoutType, breakoutLevel, breakoutStrength } = this.detectBreakout(
      candles1M,
      support,
      resistance
    );

    if (breakoutType && breakoutStrength > 0.001) { // At least 0.1% breakout
      this.confirmations.push({
        type: 'BREAKOUT',
        value: breakoutType,
        level: breakoutLevel,
        strength: breakoutStrength,
      });
    }

    // Confirmation 3: Market structure
    const marketStructure = this.analyzeMarketStructure(candles1M);
    if (
      (marketStructure.structure === 'BULLISH_STRUCTURE' && breakoutType === 'BULLISH') ||
      (marketStructure.structure === 'BEARISH_STRUCTURE' && breakoutType === 'BEARISH')
    ) {
      this.confirmations.push({
        type: 'MARKET_STRUCTURE',
        value: marketStructure.structure,
      });
    }

    // Check if we have minimum confirmations
    if (this.confirmations.length >= this.config.minConfirmations) {
      const entryPrice = candles1M[candles1M.length - 1].close;
      const stopLoss = this.calculateStopLoss(breakoutType, candles1M, support, resistance);
      const riskPips = Math.abs(entryPrice - stopLoss) / 0.0001; // Convert to pips

      this.tradeSetup = {
        entryPrice,
        stopLoss,
        riskPips,
        direction: breakoutType,
        confirmationCount: this.confirmations.length,
        confirmations: this.confirmations,
      };

      return {
        signal: 'ENTRY',
        direction: breakoutType,
        entryPrice,
        stopLoss,
        riskPips,
        confirmationCount: this.confirmations.length,
      };
    }

    return { signal: 'NO_ENTRY', reason: `Insufficient confirmations: ${this.confirmations.length}/${this.config.minConfirmations}` };
  }

  /**
   * Calculate stop loss using market structure
   */
  calculateStopLoss(direction, candles, support, resistance) {
    const lookback = 10;
    const recent = candles.slice(-lookback);

    if (direction === 'BULLISH') {
      // For buys, stop below recent swing low
      const lows = recent.map(c => c.low);
      const recentLow = Math.min(...lows);
      return recentLow - (this.config.stopLossPips * 0.0001); // Convert pips to price
    } else if (direction === 'BEARISH') {
      // For sells, stop above recent swing high
      const highs = recent.map(c => c.high);
      const recentHigh = Math.max(...highs);
      return recentHigh + (this.config.stopLossPips * 0.0001); // Convert pips to price
    }

    return null;
  }

  /**
   * Calculate position size based on account and risk
   */
  calculatePositionSize(accountBalance, entryPrice, stopLoss, leverage = 100) {
    const riskAmount = (accountBalance * this.config.positionSizePercent) / 100;
    const riskPips = Math.abs(entryPrice - stopLoss) / 0.0001;
    const pipValue = 10; // $10 per pip for standard lot

    const positionSize = riskAmount / (riskPips * pipValue);
    return {
      positionSize,
      riskAmount,
      riskPips,
      pipValue,
    };
  }

  /**
   * Calculate profit targets (partial + trailing)
   */
  calculateProfitTargets(entryPrice, stopLoss, direction) {
    const riskPips = Math.abs(entryPrice - stopLoss) / 0.0001;

    let target1, target2;

    if (direction === 'BULLISH') {
      target1 = entryPrice + (riskPips * this.config.profitTarget1Ratio * 0.0001);
      target2 = entryPrice + (riskPips * this.config.profitTarget2Ratio * 0.0001);
    } else {
      target1 = entryPrice - (riskPips * this.config.profitTarget1Ratio * 0.0001);
      target2 = entryPrice - (riskPips * this.config.profitTarget2Ratio * 0.0001);
    }

    return {
      target1, // Close 50% here
      target2, // Close 25% here
      trailingStopPips: this.config.trailingStopPips,
    };
  }

  /**
   * Helper: Calculate moving average
   */
  calculateMA(prices, period) {
    if (prices.length < period) return null;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Calculate ATR (Average True Range)
   */
  calculateATR(candles, period = 14) {
    if (candles.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];

      const tr1 = current.high - current.low;
      const tr2 = Math.abs(current.high - previous.close);
      const tr3 = Math.abs(current.low - previous.close);

      trueRanges.push(Math.max(tr1, tr2, tr3));
    }

    const atrValues = [];
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trueRanges[i];
    }
    atrValues.push(sum / period);

    for (let i = period; i < trueRanges.length; i++) {
      const atr = (atrValues[atrValues.length - 1] * (period - 1) + trueRanges[i]) / period;
      atrValues.push(atr);
    }

    return atrValues[atrValues.length - 1];
  }

  /**
   * Detect Previous Day High/Low (PDH/PDL) rejection
   * Requires daily candles to identify PDH/PDL levels
   */
  detectPDHPDLRejection(dailyCandles, currentPrice, direction) {
    if (!dailyCandles || dailyCandles.length < 2) {
      return { isRejection: false, reason: 'Insufficient daily data' };
    }

    const yesterday = dailyCandles[dailyCandles.length - 2];
    const pdh = yesterday.high;
    const pdl = yesterday.low;
    const pipValue = 0.0001; // Standard forex pip value

    if (direction === 'SELL') {
      // Check if price is near PDH and showing rejection (bearish candle)
      const distanceToPDH = Math.abs(currentPrice - pdh) / pipValue;
      if (distanceToPDH < 10) { // Within 10 pips of PDH
        return {
          isRejection: true,
          level: pdh,
          distance: distanceToPDH,
          type: 'PDH_REJECTION',
          reason: `Price near PDH (${distanceToPDH.toFixed(1)} pips away)`,
        };
      }
    } else if (direction === 'BUY') {
      // Check if price is near PDL and showing rejection (bullish candle)
      const distanceToPDL = Math.abs(currentPrice - pdl) / pipValue;
      if (distanceToPDL < 10) { // Within 10 pips of PDL
        return {
          isRejection: true,
          level: pdl,
          distance: distanceToPDL,
          type: 'PDL_REJECTION',
          reason: `Price near PDL (${distanceToPDL.toFixed(1)} pips away)`,
        };
      }
    }

    return { isRejection: false, reason: 'Price not near PDH/PDL' };
  }

  /**
   * Check if market is choppy based on ATR volatility
   * Returns true if ATR is significantly below average (low volatility = chop)
   */
  isChoppyByATR(candles, period = 14, lookback = 50) {
    if (candles.length < lookback + period) return false;

    const recentCandles = candles.slice(-lookback);
    const atrValues = [];

    for (let i = 0; i < recentCandles.length - period; i++) {
      const slice = recentCandles.slice(i, i + period + 1);
      const atr = this.calculateATR(slice, period);
      if (atr) atrValues.push(atr);
    }

    if (atrValues.length === 0) return false;

    const currentATR = atrValues[atrValues.length - 1];
    const avgATR = atrValues.reduce((a, b) => a + b, 0) / atrValues.length;
    const atrRatio = currentATR / avgATR;

    // Market is choppy if current ATR is below 60% of average
    return atrRatio < 0.6;
  }

  /**
   * Detect choppy/sideways market (no clear direction)
   */
  detectChop(candles, lookback = 10) {
    if (!candles || candles.length < lookback) {
      return { isChopping: false, reason: 'Insufficient data' };
    }

    const recent = candles.slice(-lookback);
    const closes = recent.map(c => c.close);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);
    const volumes = recent.map(c => c.volume || 0);

    // Calculate range (high - low)
    const ranges = highs.map((h, i) => h - lows[i]);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;

    // Check if price is moving sideways (small range)
    const currentRange = highs[highs.length - 1] - lows[lows.length - 1];
    const rangeRatio = currentRange / avgRange;

    // Check if volume is low
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
    const volumeRatio = currentVolume / avgVolume;

    // Check if price is choppy (no clear direction)
    const priceRange = Math.max(...closes) - Math.min(...closes);
    const priceMovement = Math.abs(closes[closes.length - 1] - closes[0]);
    const choppyRatio = priceMovement / (priceRange || 1);

    // Chop if: VERY small range + VERY low volume + NO clear direction
    // Tightened thresholds (was 0.8/1.0/0.5) to avoid false chop exits
    const isChopping = rangeRatio < 0.5 && volumeRatio < 0.7 && choppyRatio < 0.3;

    return {
      isChopping,
      rangeRatio,
      volumeRatio,
      choppyRatio,
      reason: isChopping ? 'Market is choppy with low volume' : 'Market has clear direction',
    };
  }

  /**
   * Check volume against average (volume filter)
   */
  checkVolume(candles1M, lookback = 20) {
    if (!candles1M || candles1M.length < lookback) {
      return { hasVolume: false, reason: 'Insufficient data' };
    }

    const recent = candles1M.slice(-lookback);
    const volumes = recent.map(c => c.volume || 0);
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);

    const volumeRatio = currentVolume / avgVolume;
    const hasVolume = volumeRatio >= this.config.volumeThreshold;

    return {
      hasVolume,
      currentVolume,
      avgVolume,
      volumeRatio,
      threshold: this.config.volumeThreshold,
      reason: hasVolume ? 'Volume OK' : `Low volume`,
    };
  }

  /**
   * Check if trade should be skipped
   */
  shouldSkipTrade(candles4H, candles1M, bias) {
    // Skip if no bias
    if (!bias) {
      return { skip: true, reason: 'No clear directional bias' };
    }

    // Skip if consolidating
    const consolidation = this.detectConsolidation(candles1M);
    if (consolidation.isConsolidating) {
      return { skip: true, reason: `Market consolidating: ${consolidation.reason}` };
    }

    // Skip if insufficient volume (CRITICAL for 24/7 trading)
    const volumeCheck = this.checkVolume(candles1M);
    if (!volumeCheck.hasVolume) {
      return { skip: true, reason: `Volume filter: ${volumeCheck.reason}` };
    }

    // Skip if insufficient confirmations
    if (this.confirmations.length < this.config.minConfirmations) {
      return { skip: true, reason: `Insufficient confirmations: ${this.confirmations.length}/${this.config.minConfirmations}` };
    }

    return { skip: false };
  }
}

export default MambafXStrategy;
