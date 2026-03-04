/**
 * Quick Scalp Strategy
 * High-frequency conservative scalping strategy
 * Entry: RSI + MA crossover on 5M timeframe
 * Risk: 15 pips SL, 25 pips TP
 * Position: 5% of account per trade
 */

export class QuickScalpStrategy {
  constructor(accountBalance) {
    this.accountBalance = accountBalance;
    this.positionSizePercent = 0.05; // 5% per trade
    this.stopLossPips = 15;
    this.takeProfitPips = 25;
    this.maxConcurrentTrades = 3;
    this.rsiPeriod = 14;
    this.maPeriod = 20;
  }

  /**
   * Calculate RSI (Relative Strength Index)
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
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
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
   * Detect trend direction
   */
  detectTrend(candles) {
    if (candles.length < 3) return null;

    const closes = candles.map(c => c.close);
    const ma50 = this.calculateMA(closes, 50);
    const currentPrice = closes[closes.length - 1];

    if (ma50 === null) return null;

    // Simple trend: price above MA = uptrend, below = downtrend
    if (currentPrice > ma50) return 'UP';
    if (currentPrice < ma50) return 'DOWN';
    return null;
  }

  /**
   * Generate trading signal
   */
  analyzeSignal(candles, openTrades = 0) {
    if (candles.length < 30) {
      return { signal: 'NONE', reason: 'Insufficient data' };
    }

    // Check max concurrent trades
    if (openTrades >= this.maxConcurrentTrades) {
      return { signal: 'NONE', reason: 'Max concurrent trades reached' };
    }

    const closes = candles.map(c => c.close);
    const opens = candles.map(c => c.open);

    // Calculate indicators
    const rsi = this.calculateRSI(closes, this.rsiPeriod);
    const ma = this.calculateMA(closes, this.maPeriod);
    const trend = this.detectTrend(candles);

    if (rsi === null || ma === null || trend === null) {
      return { signal: 'NONE', reason: 'Indicators not ready' };
    }

    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];

    // BUY Signal: Uptrend + RSI bounces from oversold + Price crosses MA
    if (
      trend === 'UP' &&
      rsi < 40 &&
      currentPrice > ma &&
      previousPrice <= ma &&
      rsi > 30
    ) {
      return {
        signal: 'BUY',
        reason: `Uptrend, RSI ${rsi.toFixed(1)} bounced from oversold, Price crossed MA`,
        rsi,
        ma,
        trend,
      };
    }

    // SELL Signal: Downtrend + RSI bounces from overbought + Price crosses MA
    if (
      trend === 'DOWN' &&
      rsi > 60 &&
      currentPrice < ma &&
      previousPrice >= ma &&
      rsi < 70
    ) {
      return {
        signal: 'SELL',
        reason: `Downtrend, RSI ${rsi.toFixed(1)} bounced from overbought, Price crossed MA`,
        rsi,
        ma,
        trend,
      };
    }

    return { signal: 'NONE', reason: `RSI: ${rsi.toFixed(1)}, Trend: ${trend}` };
  }

  /**
   * Calculate position size
   */
  calculatePositionSize(pair, leverage = 25) {
    const riskAmount = this.accountBalance * this.positionSizePercent;
    const units = (riskAmount * leverage) / 1; // Simplified for standard pairs
    return Math.floor(units);
  }

  /**
   * Get strategy parameters
   */
  getParameters() {
    return {
      name: 'Quick Scalp',
      description: 'High-frequency conservative scalping',
      stopLossPips: this.stopLossPips,
      takeProfitPips: this.takeProfitPips,
      positionSizePercent: this.positionSizePercent * 100,
      maxConcurrentTrades: this.maxConcurrentTrades,
      rsiPeriod: this.rsiPeriod,
      maPeriod: this.maPeriod,
    };
  }
}
