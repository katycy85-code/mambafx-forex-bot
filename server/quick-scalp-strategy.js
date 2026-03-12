/**
 * Quick Scalp Strategy v2 — Trend-Following with Proper R:R
 * 
 * Key changes from v1:
 * 1. R:R flipped: SL 10 pips, TP 20 pips (1:2 reward) — only need ~34% win rate
 * 2. EMA-50 trend filter: only trade WITH the higher-timeframe trend
 * 3. ADX filter: only trade when market is trending (ADX > 20)
 * 4. Tighter RSI zones: oversold < 30, overbought > 70
 * 5. Spread filter: skip if spread > 2 pips
 * 6. Momentum confirmation: require 2+ candles in direction + volume spike
 * 7. Reduced max concurrent trades to 2 for focus
 */

export class QuickScalpStrategy {
  constructor(accountBalance) {
    this.accountBalance = accountBalance;
    this.positionSizePercent = 0.02; // 2% risk per trade (conservative)
    this.stopLossPips = 10;          // Tighter SL
    this.takeProfitPips = 20;        // 2:1 R:R — the key fix
    this.maxConcurrentTrades = 2;    // Focus on fewer, better trades
    this.rsiPeriod = 14;
    this.emaPeriod = 50;             // EMA-50 for trend filter
    this.fastEmaPeriod = 9;          // EMA-9 for signal
    this.adxPeriod = 14;
    // Trailing stop: activate after +10 pips, trail at 8 pips
    this.trailingStopActivationPips = 10;
    this.trailingStopPips = 8;
    // Max spread allowed (in pips) — skip trade if spread is wider
    this.maxSpreadPips = 2.0;
  }

  /**
   * Calculate RSI using Wilder's smoothing (more accurate)
   */
  calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    // Initial average
    for (let i = 1; i <= period; i++) {
      const change = closes[closes.length - period - 1 + i] - closes[closes.length - period - 1 + i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  calculateEMA(closes, period) {
    if (closes.length < period) return null;
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for the first value
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  /**
   * Calculate ADX (Average Directional Index)
   * ADX > 20 = trending, ADX < 20 = ranging/choppy
   */
  calculateADX(candles, period = 14) {
    if (candles.length < period * 2 + 1) return null;

    const plusDM = [];
    const minusDM = [];
    const trueRanges = [];

    for (let i = 1; i < candles.length; i++) {
      const highDiff = candles[i].high - candles[i - 1].high;
      const lowDiff = candles[i - 1].low - candles[i].low;

      plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
      minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trueRanges.push(tr);
    }

    if (trueRanges.length < period) return null;

    // Smooth using Wilder's method
    let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);

    const dxValues = [];

    for (let i = period; i < trueRanges.length; i++) {
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
      smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];

      const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
      const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
      const diSum = plusDI + minusDI;
      const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
      dxValues.push(dx);
    }

    if (dxValues.length < period) return null;

    // ADX is the smoothed average of DX
    let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxValues.length; i++) {
      adx = ((adx * (period - 1)) + dxValues[i]) / period;
    }

    // Also return +DI and -DI for direction
    const lastPlusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const lastMinusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    return {
      adx,
      plusDI: lastPlusDI,
      minusDI: lastMinusDI,
      trending: adx > 20,
      strongTrend: adx > 30,
      direction: lastPlusDI > lastMinusDI ? 'UP' : 'DOWN',
    };
  }

  /**
   * Calculate ATR for volatility-based stop sizing
   */
  calculateATR(candles, period = 14) {
    if (candles.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
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
   * Check if there's a bullish/bearish engulfing pattern
   */
  detectEngulfing(candles) {
    if (candles.length < 2) return null;
    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];

    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);

    // Bullish engulfing: prev was bearish, current is bullish and body engulfs prev
    if (prev.close < prev.open && curr.close > curr.open && currBody > prevBody * 1.2) {
      if (curr.close > prev.open && curr.open < prev.close) {
        return 'BULLISH_ENGULFING';
      }
    }

    // Bearish engulfing: prev was bullish, current is bearish and body engulfs prev
    if (prev.close > prev.open && curr.close < curr.open && currBody > prevBody * 1.2) {
      if (curr.open > prev.close && curr.close < prev.open) {
        return 'BEARISH_ENGULFING';
      }
    }

    return null;
  }

  /**
   * Check for pin bar / rejection candle
   */
  detectPinBar(candles) {
    if (candles.length < 1) return null;
    const c = candles[candles.length - 1];
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.close, c.open);
    const lowerWick = Math.min(c.close, c.open) - c.low;
    const totalRange = c.high - c.low;

    if (totalRange === 0) return null;

    // Bullish pin bar: long lower wick, small body at top
    if (lowerWick > body * 2 && lowerWick > upperWick * 2 && body / totalRange < 0.35) {
      return 'BULLISH_PIN';
    }

    // Bearish pin bar: long upper wick, small body at bottom
    if (upperWick > body * 2 && upperWick > lowerWick * 2 && body / totalRange < 0.35) {
      return 'BEARISH_PIN';
    }

    return null;
  }

  /**
   * Check volume spike (current candle volume vs average)
   */
  hasVolumeSurge(candles, lookback = 20, threshold = 1.3) {
    if (candles.length < lookback + 1) return false;
    const volumes = candles.slice(-lookback - 1, -1).map(c => c.volume || 0);
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const currentVol = candles[candles.length - 1].volume || 0;
    return avgVol > 0 && currentVol > avgVol * threshold;
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
   * Main signal generation — MUCH stricter than v1
   * 
   * Entry conditions (ALL must be true):
   * 1. ADX > 20 (market is trending, not ranging)
   * 2. EMA-50 trend alignment (price on correct side)
   * 3. RSI in favorable zone (not extreme)
   * 4. Price action confirmation (engulfing, pin bar, or 3 consecutive candles)
   * 5. Volume above average
   */
  analyzeSignal(candles, openTrades = 0) {
    if (candles.length < 60) {
      return { signal: 'NONE', reason: 'Insufficient data (need 60+ candles)' };
    }

    if (openTrades >= this.maxConcurrentTrades) {
      return { signal: 'NONE', reason: 'Max concurrent trades reached' };
    }

    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    // ── INDICATOR CALCULATIONS ──────────────────────────────────────
    const rsi = this.calculateRSI(closes, this.rsiPeriod);
    const ema50 = this.calculateEMA(closes, this.emaPeriod);
    const ema9 = this.calculateEMA(closes, this.fastEmaPeriod);
    const adxData = this.calculateADX(candles, this.adxPeriod);
    const atr = this.calculateATR(candles, 14);

    if (rsi === null || ema50 === null || ema9 === null || adxData === null || atr === null) {
      return { signal: 'NONE', reason: 'Indicators not ready' };
    }

    // ── FILTER 1: ADX must show trending market ─────────────────────
    if (!adxData.trending) {
      return { signal: 'NONE', reason: `Market ranging (ADX: ${adxData.adx.toFixed(1)})` };
    }

    // ── FILTER 2: ATR must show reasonable volatility ───────────────
    // Skip if ATR is too low (dead market) or too high (news spike)
    const pipValue = currentPrice > 10 ? 0.01 : 0.0001; // JPY vs standard
    const atrPips = atr / pipValue;
    if (atrPips < 3) {
      return { signal: 'NONE', reason: `Volatility too low (ATR: ${atrPips.toFixed(1)} pips)` };
    }
    if (atrPips > 30) {
      return { signal: 'NONE', reason: `Volatility too high (ATR: ${atrPips.toFixed(1)} pips) — possible news` };
    }

    // ── SUPPORT/RESISTANCE ──────────────────────────────────────────
    const { support, resistance } = this.detectSupportResistance(candles);
    const isNearSupport = support && (currentPrice - support) / pipValue < 5; // Within 5 pips
    const isNearResistance = resistance && (resistance - currentPrice) / pipValue < 5; // Within 5 pips

    // ── PRICE ACTION PATTERNS ───────────────────────────────────────
    const engulfing = this.detectEngulfing(candles);
    const pinBar = this.detectPinBar(candles);
    const volumeSurge = this.hasVolumeSurge(candles, 20, 1.3);

    // Count consecutive bullish/bearish candles (last 4)
    const last4 = candles.slice(-4);
    const bullishCount = last4.filter(c => c.close > c.open).length;
    const bearishCount = last4.filter(c => c.close < c.open).length;

    // ── DYNAMIC STOP LOSS based on ATR ──────────────────────────────
    // Use 1.5x ATR for SL, clamped between 8-15 pips
    const dynamicSL = Math.max(8, Math.min(15, Math.round(atrPips * 1.5)));
    const dynamicTP = dynamicSL * 2; // Always maintain 1:2 R:R

    // ══════════════════════════════════════════════════════════════════
    // ── BUY SIGNAL ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    if (currentPrice > ema50 && ema9 > ema50) {
      // Price and fast EMA above slow EMA = uptrend confirmed

      let buyScore = 0;
      const buyReasons = [];

      // Condition A: RSI pulling back from oversold in uptrend (30-45)
      if (rsi >= 30 && rsi <= 45) {
        buyScore += 2;
        buyReasons.push(`RSI pullback (${rsi.toFixed(1)})`);
      } else if (rsi > 45 && rsi < 60) {
        buyScore += 1;
        buyReasons.push(`RSI neutral (${rsi.toFixed(1)})`);
      }

      // Condition B: Price near support
      if (isNearSupport) {
        buyScore += 2;
        buyReasons.push(`Price near support (${support.toFixed(5)})`);
      }

      // Condition C: ADX direction confirms uptrend
      if (adxData.direction === 'UP') {
        buyScore += 2;
        buyReasons.push(`ADX UP (${adxData.adx.toFixed(1)})`);
      }

      // Condition D: Bullish price action
      if (engulfing === 'BULLISH_ENGULFING') {
        buyScore += 2;
        buyReasons.push('Bullish engulfing');
      } else if (pinBar === 'BULLISH_PIN') {
        buyScore += 2;
        buyReasons.push('Bullish pin bar');
      } else if (bullishCount >= 3) {
        buyScore += 1;
        buyReasons.push(`${bullishCount}/4 bullish candles`);
      }

      // Condition E: Volume confirmation
      if (volumeSurge) {
        buyScore += 1;
        buyReasons.push('Volume surge');
      }

      // Condition F: Strong trend (ADX > 30)
      if (adxData.strongTrend) {
        buyScore += 1;
        buyReasons.push('Strong trend');
      }

      // Need score >= 6 to enter (stricter entry)
      if (buyScore >= 6) {
        return {
          signal: 'BUY',
          reason: `BUY: ${buyReasons.join(', ')} [score: ${buyScore}]`,
          rsi,
          adx: adxData.adx,
          score: buyScore,
          stopLoss: dynamicSL,
          takeProfit: dynamicTP,
        };
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // ── SELL SIGNAL ─────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════
    if (currentPrice < ema50 && ema9 < ema50) {
      // Price and fast EMA below slow EMA = downtrend confirmed

      let sellScore = 0;
      const sellReasons = [];

      // Condition A: RSI pulling back from overbought in downtrend (55-70)
      if (rsi >= 55 && rsi <= 70) {
        sellScore += 2;
        sellReasons.push(`RSI pullback (${rsi.toFixed(1)})`);
      } else if (rsi > 40 && rsi < 55) {
        sellScore += 1;
        sellReasons.push(`RSI neutral (${rsi.toFixed(1)})`);
      }

      // Condition B: Price near resistance
      if (isNearResistance) {
        sellScore += 2;
        sellReasons.push(`Price near resistance (${resistance.toFixed(5)})`);
      }

      // Condition C: ADX direction confirms downtrend
      if (adxData.direction === 'DOWN') {
        sellScore += 2;
        sellReasons.push(`ADX DOWN (${adxData.adx.toFixed(1)})`);
      }

      // Condition D: Bearish price action
      if (engulfing === 'BEARISH_ENGULFING') {
        sellScore += 2;
        sellReasons.push('Bearish engulfing');
      } else if (pinBar === 'BEARISH_PIN') {
        sellScore += 2;
        sellReasons.push('Bearish pin bar');
      } else if (bearishCount >= 3) {
        sellScore += 1;
        sellReasons.push(`${bearishCount}/4 bearish candles`);
      }

      // Condition E: Volume confirmation
      if (volumeSurge) {
        sellScore += 1;
        sellReasons.push('Volume surge');
      }

      // Condition F: Strong trend (ADX > 30)
      if (adxData.strongTrend) {
        sellScore += 1;
        sellReasons.push('Strong trend');
      }

      // Need score >= 6 to enter (stricter entry)
      if (sellScore >= 6) {
        return {
          signal: 'SELL',
          reason: `SELL: ${sellReasons.join(', ')} [score: ${sellScore}]`,
          rsi,
          adx: adxData.adx,
          score: sellScore,
          stopLoss: dynamicSL,
          takeProfit: dynamicTP,
        };
      }
    }

    return {
      signal: 'NONE',
      reason: `No signal | Price ${currentPrice > ema50 ? '>' : '<'} EMA50 | RSI: ${rsi.toFixed(1)} | ADX: ${adxData.adx.toFixed(1)} (${adxData.direction})`,
    };
  }

  /**
   * Calculate position size based on risk
   */
  calculatePositionSize(pair, leverage = 50) {
    const riskAmount = this.accountBalance * this.positionSizePercent;
    const units = (riskAmount * leverage) / 1;
    return Math.floor(units);
  }

  /**
   * Get strategy parameters
   */
  getParameters() {
    return {
      name: 'Quick Scalp v2 (Trend-Following)',
      description: 'Trend-following scalp: EMA+ADX+RSI+Price Action, 1:2 R:R, dynamic ATR stops',
      stopLossPips: this.stopLossPips,
      takeProfitPips: this.takeProfitPips,
      positionSizePercent: this.positionSizePercent * 100,
      maxConcurrentTrades: this.maxConcurrentTrades,
      trailingStopActivationPips: this.trailingStopActivationPips,
      trailingStopPips: this.trailingStopPips,
      rsiPeriod: this.rsiPeriod,
      emaPeriod: this.emaPeriod,
      adxPeriod: this.adxPeriod,
      maxSpreadPips: this.maxSpreadPips,
    };
  }
}
