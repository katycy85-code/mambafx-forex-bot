/**
 * Quick Scalp Strategy - Active Edition
 * High-frequency scalping strategy designed to trade multiple times per day
 * Uses RSI momentum + trend + price action - no strict crossover required
 * Risk: 15 pips SL, 25 pips TP (1:1.67 R:R)
 * Position: 5% of account per trade
 */

export class QuickScalpStrategy {
  constructor(accountBalance) {
    this.accountBalance = accountBalance;
    this.positionSizePercent = 0.05; // 5% per trade for capital utilization
    this.stopLossPips = 20;          // 20 pips SL to avoid noise stop-outs
    this.takeProfitPips = 40;        // 40 pips TP for better R:R (1:2)
    this.maxConcurrentTrades = 4;    // 4 concurrent trades to capitalize on multiple opportunities
    this.rsiPeriod = 14;
    this.maPeriod = 20;
    this.fastMaPeriod = 8;
  }

  /**
   * Calculate RSI
   */
  calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate Simple Moving Average
   */
  calculateMA(closes, period = 20) {
    if (closes.length < period) return null;
    const sum = closes.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Check if RSI is trending in a direction over last N candles
   * Returns 'UP', 'DOWN', or null
   */
  rsiTrend(closes, lookback = 3) {
    if (closes.length < this.rsiPeriod + lookback + 1) return null;

    const rsiValues = [];
    for (let i = lookback; i >= 0; i--) {
      const slice = closes.slice(0, closes.length - i);
      rsiValues.push(this.calculateRSI(slice, this.rsiPeriod));
    }

    if (rsiValues.some(v => v === null)) return null;

    const first = rsiValues[0];
    const last = rsiValues[rsiValues.length - 1];

    if (last - first > 2) return 'UP';
    if (first - last > 2) return 'DOWN';
    return 'FLAT';
  }

  /**
   * Detect trend direction using fast and slow MA
   */
  detectTrend(closes) {
    const fastMA = this.calculateMA(closes, this.fastMaPeriod);
    const slowMA = this.calculateMA(closes, this.maPeriod);
    const currentPrice = closes[closes.length - 1];

    if (fastMA === null || slowMA === null) return null;

    // Strong uptrend: fast MA > slow MA and price above both
    if (fastMA > slowMA && currentPrice > fastMA) return 'UP';
    // Strong downtrend: fast MA < slow MA and price below both
    if (fastMA < slowMA && currentPrice < fastMA) return 'DOWN';
    // Weak uptrend: price above slow MA
    if (currentPrice > slowMA) return 'UP';
    // Weak downtrend: price below slow MA
    if (currentPrice < slowMA) return 'DOWN';

    return null;
  }

  /**
   * Check for recent candle momentum (bullish or bearish candles)
   */
  candleMomentum(candles, lookback = 3) {
    if (candles.length < lookback) return null;
    const recent = candles.slice(-lookback);
    const bullish = recent.filter(c => c.close > c.open).length;
    const bearish = recent.filter(c => c.close < c.open).length;

    if (bullish >= 2) return 'BULLISH';
    if (bearish >= 2) return 'BEARISH';
    return 'MIXED';
  }

  /**
   * Generate trading signal - flexible multi-condition approach
   * Any 2 of 3 conditions must align (not all 3 required)
   */
  analyzeSignal(candles, openTrades = 0) {
    if (candles.length < 30) {
      return { signal: 'NONE', reason: 'Insufficient data' };
    }

    if (openTrades >= this.maxConcurrentTrades) {
      return { signal: 'NONE', reason: 'Max concurrent trades reached' };
    }

    const closes = candles.map(c => c.close);
    const rsi = this.calculateRSI(closes, this.rsiPeriod);
    const trend = this.detectTrend(closes);
    const rsiDir = this.rsiTrend(closes, 3);
    const momentum = this.candleMomentum(candles, 3);

    if (rsi === null || trend === null) {
      return { signal: 'NONE', reason: 'Indicators not ready' };
    }

    // ── BUY CONDITIONS ──────────────────────────────────────────────────
    const buyConditions = {
      trend: trend === 'UP',
      rsiOversold: rsi < 35,          // Tightened RSI threshold (was 40)
      rsiRising: rsiDir === 'UP',     // RSI trending upward
      momentum: momentum === 'BULLISH',
    };

    const buyScore = Object.values(buyConditions).filter(Boolean).length;

    // Require 3-of-4 conditions for balanced entry (quality + activity)
    if (buyScore >= 3 && rsi < 45) {
      const reasons = Object.entries(buyConditions)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ');
      return {
        signal: 'BUY',
        reason: `BUY: ${reasons} | RSI ${rsi.toFixed(1)}`,
        rsi,
        trend,
        score: buyScore,
      };
    }

    // ── SELL CONDITIONS ─────────────────────────────────────────────────
    const sellConditions = {
      trend: trend === 'DOWN',
      rsiOverbought: rsi > 65,        // Tightened RSI threshold (was 60)
      rsiFalling: rsiDir === 'DOWN',  // RSI trending downward
      momentum: momentum === 'BEARISH',
    };

    const sellScore = Object.values(sellConditions).filter(Boolean).length;

    // Require 3-of-4 conditions for balanced entry (quality + activity)
    if (sellScore >= 3 && rsi > 55) {
      const reasons = Object.entries(sellConditions)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ');
      return {
        signal: 'SELL',
        reason: `SELL: ${reasons} | RSI ${rsi.toFixed(1)}`,
        rsi,
        trend,
        score: sellScore,
      };
    }

    return {
      signal: 'NONE',
      reason: `No signal | RSI: ${rsi.toFixed(1)}, Trend: ${trend}, RSI dir: ${rsiDir}, Momentum: ${momentum}`,
    };
  }

  /**
   * Calculate position size
   */
  calculatePositionSize(pair, leverage = 25) {
    const riskAmount = this.accountBalance * this.positionSizePercent;
    const units = (riskAmount * leverage) / 1;
    return Math.floor(units);
  }

  /**
   * Get strategy parameters
   */
  getParameters() {
    return {
      name: 'Quick Scalp (Active)',
      description: 'High-frequency scalping - 2-of-4 conditions required',
      stopLossPips: this.stopLossPips,
      takeProfitPips: this.takeProfitPips,
      positionSizePercent: this.positionSizePercent * 100,
      maxConcurrentTrades: this.maxConcurrentTrades,
      rsiPeriod: this.rsiPeriod,
      maPeriod: this.maPeriod,
    };
  }
}
