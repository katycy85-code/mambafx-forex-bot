/**
 * MambafX Strategy Engine v2
 * Higher-timeframe trend-following strategy with strict confirmation requirements
 * Uses 15M for bias + 5M for entry timing
 * 
 * Changes from v1:
 * - Proper R:R (1:2 minimum)
 * - EMA-based trend detection instead of simple MA
 * - Requires price action confirmation (not just breakout)
 * - ATR-based dynamic stops
 * - Consolidation detection uses ATR, not arbitrary pip thresholds
 */

export class MambafXStrategy {
  constructor(config = {}) {
    this.config = {
      minConfirmations: 3,
      riskRewardRatio: 2,           // 1:2 R:R minimum
      positionSizePercent: 2,       // 2% risk per trade
      stopLossPips: 12,             // Default, overridden by ATR
      profitTarget1Ratio: 1.5,      // First target at 1.5x risk
      profitTarget2Ratio: 2.5,      // Second target at 2.5x risk
      trailingStopPips: 8,          // Tight trailing after activation
      consolidationThreshold: 0.3,  // ATR ratio threshold for consolidation
      volumeThreshold: 1.2,         // 20% above average
      ...config,
    };
    
    this.confirmations = [];
    this.tradeSetup = null;
  }

  /**
   * Analyze 15M chart for directional bias using EMA crossover + structure
   */
  analyzeBias(candles15M) {
    if (candles15M.length < 50) return null;

    const recent = candles15M.slice(-50);
    const closes = recent.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    // Use EMA-21 and EMA-50 for trend
    const ema21 = this.calculateEMA(closes, 21);
    const ema50 = this.calculateEMA(closes, 50);

    if (ema21 === null || ema50 === null) return null;

    // Determine trend direction
    let bias = null;
    let strength = 'WEAK';

    if (currentPrice > ema50 && ema21 > ema50) {
      bias = 'BULLISH';
      // Strong if price is above both EMAs and EMAs are separated
      const emaSeparation = Math.abs(ema21 - ema50) / ema50;
      if (emaSeparation > 0.001 && currentPrice > ema21) {
        strength = 'STRONG';
      }
    } else if (currentPrice < ema50 && ema21 < ema50) {
      bias = 'BEARISH';
      const emaSeparation = Math.abs(ema21 - ema50) / ema50;
      if (emaSeparation > 0.001 && currentPrice < ema21) {
        strength = 'STRONG';
      }
    }

    if (!bias) return null;

    // Check for higher highs/lows (bullish) or lower highs/lows (bearish)
    const swingHighs = this.findSwingPoints(recent, 'high');
    const swingLows = this.findSwingPoints(recent, 'low');

    let structureConfirms = false;
    if (bias === 'BULLISH' && swingHighs.length >= 2 && swingLows.length >= 2) {
      const lastTwoHighs = swingHighs.slice(-2);
      const lastTwoLows = swingLows.slice(-2);
      if (lastTwoHighs[1] > lastTwoHighs[0] && lastTwoLows[1] > lastTwoLows[0]) {
        structureConfirms = true;
        strength = 'STRONG';
      }
    } else if (bias === 'BEARISH' && swingHighs.length >= 2 && swingLows.length >= 2) {
      const lastTwoHighs = swingHighs.slice(-2);
      const lastTwoLows = swingLows.slice(-2);
      if (lastTwoHighs[1] < lastTwoHighs[0] && lastTwoLows[1] < lastTwoLows[0]) {
        structureConfirms = true;
        strength = 'STRONG';
      }
    }

    return { bias, strength, ema21, ema50, structureConfirms };
  }

  /**
   * Find swing highs or lows (local extremes)
   */
  findSwingPoints(candles, type = 'high', lookback = 3) {
    const points = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
      let isSwing = true;
      for (let j = 1; j <= lookback; j++) {
        if (type === 'high') {
          if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
            isSwing = false;
            break;
          }
        } else {
          if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
            isSwing = false;
            break;
          }
        }
      }
      if (isSwing) {
        points.push(type === 'high' ? candles[i].high : candles[i].low);
      }
    }
    return points;
  }

  /**
   * Detect support and resistance levels using swing points
   */
  detectSupportResistance(candles, lookback = 30) {
    const recent = candles.slice(-lookback);
    const currentPrice = recent[recent.length - 1].close;

    const swingHighs = this.findSwingPoints(recent, 'high', 2);
    const swingLows = this.findSwingPoints(recent, 'low', 2);

    // Nearest resistance above current price
    const resistance = swingHighs.filter(h => h > currentPrice);
    const nearestResistance = resistance.length > 0 ? Math.min(...resistance) : null;

    // Nearest support below current price
    const support = swingLows.filter(l => l < currentPrice);
    const nearestSupport = support.length > 0 ? Math.max(...support) : null;

    return {
      support: nearestSupport || Math.min(...recent.map(c => c.low)),
      resistance: nearestResistance || Math.max(...recent.map(c => c.high)),
      currentPrice,
    };
  }

  /**
   * Detect market consolidation using ATR compression
   */
  detectConsolidation(candles, lookback = 20) {
    const atrCurrent = this.calculateATR(candles.slice(-lookback), 14);
    const atrLonger = this.calculateATR(candles.slice(-lookback * 2), 14);

    if (atrCurrent === null || atrLonger === null) {
      return { isConsolidating: false };
    }

    // If current ATR is less than 50% of longer-term ATR, market is consolidating
    const atrRatio = atrCurrent / atrLonger;
    const isConsolidating = atrRatio < 0.5;

    return {
      isConsolidating,
      atrRatio,
      reason: isConsolidating ? `ATR compression (ratio: ${atrRatio.toFixed(2)})` : 'Normal volatility',
    };
  }

  /**
   * Detect breakout from support/resistance
   */
  detectBreakout(candles, support, resistance) {
    if (candles.length < 3) return { breakoutType: null };

    const current = candles[candles.length - 1];
    const prev1 = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];

    let breakoutType = null;
    let breakoutStrength = 0;

    // Bullish breakout: close above resistance with body (not just wick)
    if (prev1.close <= resistance && current.close > resistance && current.close > current.open) {
      breakoutStrength = (current.close - resistance) / (current.high - current.low || 0.0001);
      if (breakoutStrength > 0.3) { // At least 30% of candle body above resistance
        breakoutType = 'BULLISH';
      }
    }

    // Bearish breakout: close below support with body
    if (prev1.close >= support && current.close < support && current.close < current.open) {
      breakoutStrength = (support - current.close) / (current.high - current.low || 0.0001);
      if (breakoutStrength > 0.3) {
        breakoutType = 'BEARISH';
      }
    }

    return { breakoutType, breakoutStrength };
  }

  /**
   * Analyze market structure
   */
  analyzeMarketStructure(candles, lookback = 15) {
    const swingHighs = this.findSwingPoints(candles.slice(-lookback), 'high', 2);
    const swingLows = this.findSwingPoints(candles.slice(-lookback), 'low', 2);

    if (swingHighs.length < 2 || swingLows.length < 2) {
      return { structure: 'NO_STRUCTURE' };
    }

    const lastHighs = swingHighs.slice(-2);
    const lastLows = swingLows.slice(-2);

    const higherHighs = lastHighs[1] > lastHighs[0];
    const higherLows = lastLows[1] > lastLows[0];
    const lowerHighs = lastHighs[1] < lastHighs[0];
    const lowerLows = lastLows[1] < lastLows[0];

    if (higherHighs && higherLows) return { structure: 'BULLISH_STRUCTURE', isHigherHighs: true, isHigherLows: true };
    if (lowerHighs && lowerLows) return { structure: 'BEARISH_STRUCTURE', isLowerHighs: true, isLowerLows: true };
    return { structure: 'NO_STRUCTURE' };
  }

  /**
   * Generate entry signal with confirmation count
   */
  generateEntrySignal(candles15M, candles5M, bias) {
    this.confirmations = [];
    this.tradeSetup = null;

    if (!bias) return { signal: 'NO_ENTRY', reason: 'No bias' };

    // Confirmation 1: Directional bias from 15M (STRONG or with structure)
    if (bias.strength === 'STRONG' || bias.structureConfirms) {
      this.confirmations.push({
        type: 'BIAS',
        value: bias.bias,
        strength: bias.strength,
      });
    }

    // Confirmation 2: Breakout on 5M
    const { support, resistance } = this.detectSupportResistance(candles5M);
    const { breakoutType, breakoutStrength } = this.detectBreakout(candles5M, support, resistance);

    if (breakoutType && breakoutType === bias.bias && breakoutStrength > 0.3) {
      this.confirmations.push({
        type: 'BREAKOUT',
        value: breakoutType,
        strength: breakoutStrength,
      });
    }

    // Confirmation 3: Market structure on 5M aligns with bias
    const marketStructure = this.analyzeMarketStructure(candles5M);
    if (
      (marketStructure.structure === 'BULLISH_STRUCTURE' && bias.bias === 'BULLISH') ||
      (marketStructure.structure === 'BEARISH_STRUCTURE' && bias.bias === 'BEARISH')
    ) {
      this.confirmations.push({
        type: 'MARKET_STRUCTURE',
        value: marketStructure.structure,
      });
    }

    // Confirmation 4: Volume surge on entry candle
    const volumes = candles5M.slice(-21).map(c => c.volume || 0);
    const avgVol = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
    const currentVol = volumes[volumes.length - 1];
    if (avgVol > 0 && currentVol > avgVol * 1.3) {
      this.confirmations.push({
        type: 'VOLUME',
        value: (currentVol / avgVol).toFixed(2),
      });
    }

    // Need minimum confirmations
    if (this.confirmations.length >= this.config.minConfirmations) {
      const entryPrice = candles5M[candles5M.length - 1].close;
      
      // ATR-based stop loss
      const atr = this.calculateATR(candles5M, 14);
      const pipValue = entryPrice > 10 ? 0.01 : 0.0001;
      const atrPips = atr ? atr / pipValue : this.config.stopLossPips;
      const stopLossPips = Math.max(8, Math.min(15, Math.round(atrPips * 1.5)));
      
      const stopLoss = bias.bias === 'BULLISH'
        ? entryPrice - (stopLossPips * pipValue)
        : entryPrice + (stopLossPips * pipValue);

      this.tradeSetup = {
        entryPrice,
        stopLoss,
        riskPips: stopLossPips,
        direction: bias.bias,
        confirmationCount: this.confirmations.length,
        confirmations: this.confirmations,
      };

      return {
        signal: 'ENTRY',
        direction: bias.bias,
        entryPrice,
        stopLoss: stopLossPips,
        takeProfit: stopLossPips * 2, // Always 1:2 R:R
        riskPips: stopLossPips,
        confirmationCount: this.confirmations.length,
      };
    }

    return { signal: 'NO_ENTRY', reason: `Insufficient confirmations: ${this.confirmations.length}/${this.config.minConfirmations}` };
  }

  /**
   * Calculate stop loss using swing structure
   */
  calculateStopLoss(direction, candles, support, resistance) {
    const lookback = 10;
    const recent = candles.slice(-lookback);
    const pipValue = recent[0].close > 10 ? 0.01 : 0.0001;

    if (direction === 'BULLISH') {
      const lows = recent.map(c => c.low);
      const recentLow = Math.min(...lows);
      return recentLow - (2 * pipValue); // 2 pip buffer below swing low
    } else if (direction === 'BEARISH') {
      const highs = recent.map(c => c.high);
      const recentHigh = Math.max(...highs);
      return recentHigh + (2 * pipValue); // 2 pip buffer above swing high
    }

    return null;
  }

  /**
   * Calculate position size based on account and risk
   */
  calculatePositionSize(accountBalance, entryPrice, stopLoss, leverage = 50) {
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
   * Calculate profit targets
   */
  calculateProfitTargets(entryPrice, stopLossPips, direction) {
    const pipValue = entryPrice > 10 ? 0.01 : 0.0001;
    const riskPips = typeof stopLossPips === 'number' && stopLossPips < 100
      ? stopLossPips
      : 12;

    let target1, target2;

    if (direction === 'BULLISH' || direction === 1 || direction === 'BUY') {
      target1 = entryPrice + (riskPips * this.config.profitTarget1Ratio * pipValue);
      target2 = entryPrice + (riskPips * this.config.profitTarget2Ratio * pipValue);
    } else {
      target1 = entryPrice - (riskPips * this.config.profitTarget1Ratio * pipValue);
      target2 = entryPrice - (riskPips * this.config.profitTarget2Ratio * pipValue);
    }

    return {
      target1,
      target2,
      trailingStopPips: this.config.trailingStopPips,
    };
  }

  /**
   * Calculate EMA
   */
  calculateEMA(data, period) {
    if (!data || data.length < period) return null;
    
    // Handle both arrays of numbers and arrays of candle objects
    const values = typeof data[0] === 'number' ? data : data.map(c => c.close || c);
    
    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  /**
   * Helper: Calculate simple moving average
   */
  calculateMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const values = typeof prices[0] === 'number' ? prices : prices.map(c => c.close || c);
    const sum = values.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Calculate ATR (Average True Range)
   */
  calculateATR(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      );
      trueRanges.push(tr);
    }

    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }
    return atr;
  }

  /**
   * Check if market is choppy based on ATR volatility
   */
  isChoppyByATR(candles, period = 14, lookback = 50) {
    if (!candles || candles.length < lookback) return false;

    const atrRecent = this.calculateATR(candles.slice(-20), period);
    const atrLonger = this.calculateATR(candles.slice(-lookback), period);

    if (!atrRecent || !atrLonger) return false;

    return (atrRecent / atrLonger) < 0.5;
  }

  /**
   * Check volume against average
   */
  checkVolume(candles, lookback = 20) {
    if (!candles || candles.length < lookback) {
      return { hasVolume: true }; // Allow if insufficient data
    }

    const volumes = candles.slice(-lookback).map(c => c.volume || 0);
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);

    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
    return {
      hasVolume: volumeRatio >= this.config.volumeThreshold,
      volumeRatio,
    };
  }

  /**
   * Check if trade should be skipped
   */
  shouldSkipTrade(candles15M, candles5M, bias) {
    // Skip if no bias
    if (!bias) {
      return { skip: true, reason: 'No clear directional bias' };
    }

    // Skip if consolidating (ATR-based)
    const consolidation = this.detectConsolidation(candles5M);
    if (consolidation.isConsolidating) {
      return { skip: true, reason: `Market consolidating: ${consolidation.reason}` };
    }

    // Skip if insufficient volume
    const volumeCheck = this.checkVolume(candles5M);
    if (!volumeCheck.hasVolume) {
      return { skip: true, reason: `Low volume (ratio: ${volumeCheck.volumeRatio?.toFixed(2)})` };
    }

    return { skip: false };
  }
}

export default MambafXStrategy;
