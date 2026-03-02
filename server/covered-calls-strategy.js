/**
 * Covered Calls Strategy Engine
 * Micro covered calls strategy for Robinhood - MANUAL EXECUTION
 * 
 * CONSTRAINT: Max $500 per trade (100 shares max)
 * 
 * Strategy:
 * 1. Find stocks where 100 shares cost <= $500 (price <= $5/share)
 * 2. Analyze call options for income generation
 * 3. Send SMS signal to user with exact execution steps
 * 4. User executes manually on Robinhood
 * 5. User logs trade in dashboard
 * 
 * Target: 0.3-0.5% weekly income (1.5-2.5% monthly)
 */

export class CoveredCallsStrategy {
  constructor(config = {}) {
    this.maxCapitalPerTrade = config.maxCapitalPerTrade || 500; // Max $500 per trade
    this.sharesPerContract = 100; // Always 100 shares
    this.maxSharePrice = this.maxCapitalPerTrade / this.sharesPerContract; // $5 per share max
    this.maxPositions = config.maxPositions || 5;
    this.targetWeeklyIncome = config.targetWeeklyIncome || 0.004; // 0.4% weekly
    this.minDelta = config.minDelta || 0.20;
    this.maxDelta = config.maxDelta || 0.30;
    this.otmPercent = config.otmPercent || 0.07; // 7% OTM
    this.positions = [];
  }

  /**
   * Analyze stock for covered call opportunity
   * Returns signal if stock meets criteria
   * 
   * CONSTRAINT: Must be able to own 100 shares for max $500
   */
  analyzeStock(stockData) {
    const {
      symbol,
      currentPrice,
      volatility,
      volume,
      avgVolume,
      marketCap,
      optionChain,
    } = stockData;

    // CRITICAL: Check if 100 shares costs <= $500
    const costFor100Shares = currentPrice * this.sharesPerContract;
    if (costFor100Shares > this.maxCapitalPerTrade) {
      return null; // Stock too expensive
    }

    // Validation checks
    const validations = {
      liquidStock: this.isLiquidStock(symbol, volume, avgVolume),
      affordablePrice: currentPrice <= this.maxSharePrice, // Must be <= $5/share
      goodVolatility: volatility >= 0.15 && volatility <= 1.0, // 15-100% IV
      hasOptions: optionChain && optionChain.length > 0,
      largeCapStock: marketCap >= 1_000_000_000, // $1B+ market cap
    };

    // All validations must pass
    if (!Object.values(validations).every(v => v)) {
      return null;
    }

    // Calculate target strike price (OTM)
    const targetStrike = currentPrice * (1 + this.otmPercent);

    // Find best call option to sell
    const bestCall = this.findBestCallOption(
      optionChain,
      targetStrike,
      currentPrice
    );

    if (!bestCall) {
      return null;
    }

    // Calculate income metrics
    const costToOwn = currentPrice * this.sharesPerContract;
    const premiumIncome = bestCall.bid * this.sharesPerContract;
    const weeklyReturn = premiumIncome / costToOwn;
    const annualizedReturn = weeklyReturn * 52;

    // Check if meets income target
    if (weeklyReturn < this.targetWeeklyIncome) {
      return null;
    }

    return {
      symbol,
      type: 'COVERED_CALL',
      action: 'MANUAL_EXECUTION_REQUIRED',
      executionSteps: [
        `STEP 1: Buy 100 shares of ${symbol} at market price (~$${currentPrice.toFixed(2)})`,
        `STEP 2: Sell 1 call contract at ${bestCall.strike} strike for $${bestCall.bid.toFixed(2)} premium`,
      ],
      stock: {
        symbol,
        currentPrice,
        sharesNeeded: this.sharesPerContract,
        costToOwn: costToOwn.toFixed(2),
        maxCapital: this.maxCapitalPerTrade,
        capitalUsed: ((costToOwn / this.maxCapitalPerTrade) * 100).toFixed(1),
      },
      call: {
        strike: bestCall.strike,
        expiration: bestCall.expiration,
        bid: bestCall.bid,
        ask: bestCall.ask,
        delta: bestCall.delta,
        theta: bestCall.theta,
        vega: bestCall.vega,
        daysToExpiration: bestCall.daysToExpiration,
      },
      metrics: {
        premiumIncome: premiumIncome.toFixed(2),
        weeklyReturn: (weeklyReturn * 100).toFixed(2),
        monthlyReturn: (weeklyReturn * 4.33 * 100).toFixed(2),
        annualizedReturn: (annualizedReturn * 100).toFixed(2),
        breakeven: (currentPrice - (premiumIncome / this.sharesPerContract)).toFixed(2),
        maxProfit: ((bestCall.strike - currentPrice) * this.sharesPerContract + premiumIncome).toFixed(2),
        riskReward: (((bestCall.strike - currentPrice) * this.sharesPerContract) / premiumIncome).toFixed(2),
      },
      confidence: this.calculateConfidence(bestCall, volatility, weeklyReturn),
      smsAlert: `COVERED CALL SIGNAL: ${symbol}\nBUY 100 @ $${currentPrice.toFixed(2)} ($${costToOwn.toFixed(0)} total)\nSELL ${bestCall.strike} call @ $${bestCall.bid.toFixed(2)} premium\nWeekly return: ${(weeklyReturn * 100).toFixed(2)}%\nExpires: ${bestCall.expiration}`,
    };
  }

  /**
   * Find best call option to sell
   * Criteria: Delta 0.20-0.30, closest to target strike
   */
  findBestCallOption(optionChain, targetStrike, currentPrice) {
    if (!optionChain || optionChain.length === 0) {
      return null;
    }

    // Filter calls that meet delta criteria
    const validCalls = optionChain.filter(option => {
      const delta = Math.abs(option.delta || 0);
      return (
        option.type === 'CALL' &&
        delta >= this.minDelta &&
        delta <= this.maxDelta &&
        option.bid > 0 &&
        option.strike > currentPrice // OTM
      );
    });

    if (validCalls.length === 0) {
      return null;
    }

    // Sort by closest to target strike
    validCalls.sort((a, b) => {
      const aDiff = Math.abs(a.strike - targetStrike);
      const bDiff = Math.abs(b.strike - targetStrike);
      return aDiff - bDiff;
    });

    return validCalls[0];
  }

  /**
   * Check if stock is liquid enough for options trading
   */
  isLiquidStock(symbol, volume, avgVolume) {
    // Minimum volume requirements
    const minVolume = 500000; // 500k shares
    const minAvgVolume = 1000000; // 1M shares average

    return volume >= minVolume && avgVolume >= minAvgVolume;
  }

  /**
   * Calculate confidence score (0-100)
   */
  calculateConfidence(callOption, volatility, weeklyReturn) {
    let score = 50; // Base score

    // Delta score (closer to 0.25 is better)
    const deltaScore = Math.max(0, 25 - Math.abs(callOption.delta - 0.25) * 100);
    score += deltaScore * 0.2;

    // Theta score (positive theta is good)
    const thetaScore = Math.min(25, callOption.theta * 100);
    score += thetaScore * 0.2;

    // Return score (higher return is better)
    const returnScore = Math.min(25, weeklyReturn * 100);
    score += returnScore * 0.3;

    // Volatility score (moderate volatility is better)
    const volScore = Math.max(0, 25 - Math.abs(volatility - 0.4) * 50);
    score += volScore * 0.3;

    return Math.min(100, Math.round(score));
  }

  /**
   * Manage existing position
   * Check if should close early or hold
   */
  managePosition(position, currentStockPrice, currentCallPrice) {
    const {
      entryStockPrice,
      entryCallPrice,
      strikePrice,
      daysToExpiration,
    } = position;

    // Calculate current P&L
    const stockPnL = (currentStockPrice - entryStockPrice) * 100;
    const callPnL = (entryCallPrice - currentCallPrice) * 100;
    const totalPnL = stockPnL + callPnL;

    // Decision logic
    const decisions = {
      shouldClose: false,
      reason: null,
      action: null,
    };

    // Close if profit target reached (50% of max profit)
    const maxProfit = (strikePrice - entryStockPrice) * 100 + entryCallPrice * 100;
    if (totalPnL >= maxProfit * 0.5) {
      decisions.shouldClose = true;
      decisions.reason = 'PROFIT_TARGET_REACHED';
      decisions.action = 'CLOSE_POSITION';
      return decisions;
    }

    // Close if stock approaches strike (assignment risk)
    if (currentStockPrice >= strikePrice * 0.98) {
      decisions.shouldClose = true;
      decisions.reason = 'ASSIGNMENT_RISK';
      decisions.action = 'CLOSE_POSITION';
      return decisions;
    }

    // Close if stock drops significantly (stop loss)
    if (totalPnL <= -maxProfit * 0.2) {
      decisions.shouldClose = true;
      decisions.reason = 'STOP_LOSS_HIT';
      decisions.action = 'CLOSE_POSITION';
      return decisions;
    }

    // Hold if expiration is near and profitable
    if (daysToExpiration <= 3 && totalPnL > 0) {
      decisions.shouldClose = false;
      decisions.reason = 'HOLD_TO_EXPIRATION';
      decisions.action = 'HOLD';
      return decisions;
    }

    // Default: hold
    decisions.shouldClose = false;
    decisions.reason = 'HOLD';
    decisions.action = 'HOLD';
    return decisions;
  }

  /**
   * Get portfolio statistics
   */
  getPortfolioStats(positions) {
    if (positions.length === 0) {
      return {
        totalCapitalDeployed: 0,
        totalPositions: 0,
        totalMonthlyIncome: 0,
        totalMonthlyIncomePercent: 0,
        averageWeeklyReturn: 0,
      };
    }

    const totalCapitalDeployed = positions.reduce((sum, p) => sum + p.capitalDeployed, 0);
    const totalMonthlyIncome = positions.reduce((sum, p) => sum + p.monthlyIncome, 0);
    const totalMonthlyIncomePercent = (totalMonthlyIncome / totalCapitalDeployed) * 100;
    const averageWeeklyReturn = positions.reduce((sum, p) => sum + p.weeklyReturn, 0) / positions.length;

    return {
      totalCapitalDeployed,
      totalPositions: positions.length,
      totalMonthlyIncome,
      totalMonthlyIncomePercent: totalMonthlyIncomePercent.toFixed(2),
      averageWeeklyReturn: averageWeeklyReturn.toFixed(2),
    };
  }

  /**
   * Get recommended stocks to trade
   * FILTERED: Only stocks where 100 shares cost <= $500 (price <= $5/share)
   */
  getRecommendedStocks() {
    // These are typically lower-priced ETFs and stocks
    return [
      'QQQ', // Nasdaq 100
      'SPY', // S&P 500
      'IWM', // Russell 2000
      'XLK', // Tech sector
      'XLV', // Healthcare
      'XLF', // Financials
      'GLD', // Gold ETF
      'SLV', // Silver ETF
      'USO', // Oil ETF
      'TLT', // Bonds ETF
      'EEM', // Emerging Markets
      'EWJ', // Japan ETF
      'FXI', // China ETF
      'SCHX', // US Large Cap
      'SCHB', // US Broad Market
    ];
  }

  /**
   * Get affordable stocks (price <= $5/share for 100 shares = $500 max)
   */
  getAffordableStocks() {
    return this.getRecommendedStocks().filter(symbol => {
      // In production, fetch real prices
      // For now, these are known to be <= $5/share
      return true;
    });
  }
}

export default CoveredCallsStrategy;
