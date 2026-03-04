/**
 * Covered Calls Scanner
 * Scans penny stocks for covered calls opportunities
 * Strategy: Aggressive, maximize weekly premiums
 */

export class CoveredCallsScanner {
  constructor(budget = 500, sharesPerTrade = 100) {
    this.budget = budget;
    this.sharesPerTrade = sharesPerTrade;
    this.maxStockPrice = budget / sharesPerTrade; // ~$5
    this.minStockPrice = 3;
    this.minIV = 0.5; // 50% IV minimum for aggressive
    this.minPremiumPercent = 2; // 2% minimum weekly premium
  }

  /**
   * Score a stock for covered calls potential
   */
  scoreStock(stock) {
    const {
      symbol,
      price,
      iv,
      weeklyCallPrice,
      strikePrice,
      daysToExpiration,
      volume,
      bid,
      ask,
    } = stock;

    // Price check
    if (price < this.minStockPrice || price > this.maxStockPrice) {
      return { score: 0, reason: `Price $${price} outside range $${this.minStockPrice}-$${this.maxStockPrice}` };
    }

    // IV check
    if (iv < this.minIV) {
      return { score: 0, reason: `IV ${(iv * 100).toFixed(1)}% too low (min ${this.minIV * 100}%)` };
    }

    // Premium calculation
    const totalCost = price * this.sharesPerTrade;
    const premiumReceived = weeklyCallPrice * this.sharesPerTrade;
    const premiumPercent = (premiumReceived / totalCost) * 100;

    if (premiumPercent < this.minPremiumPercent) {
      return { score: 0, reason: `Premium ${premiumPercent.toFixed(2)}% too low (min ${this.minPremiumPercent}%)` };
    }

    // Volume check (liquidity)
    if (volume < 100000) {
      return { score: 0, reason: `Volume ${volume} too low (min 100k)` };
    }

    // Calculate score (0-100)
    let score = 0;

    // IV score (higher IV = higher premiums) - 40 points
    const ivScore = Math.min(40, (iv / 2) * 40);
    score += ivScore;

    // Premium score (higher premium = better) - 40 points
    const premiumScore = Math.min(40, (premiumPercent / 5) * 40);
    score += premiumScore;

    // Volume score (higher volume = more liquid) - 20 points
    const volumeScore = Math.min(20, (volume / 1000000) * 20);
    score += volumeScore;

    // Uptrend bonus (if price trending up, less likely to be assigned) - 10 points
    // This would need price history, for now we'll add it if available
    if (stock.priceChange && stock.priceChange > 0) {
      score += Math.min(10, stock.priceChange * 2);
    }

    return {
      score: Math.round(score),
      premiumPercent: premiumPercent.toFixed(2),
      totalCost: totalCost.toFixed(2),
      premiumReceived: premiumReceived.toFixed(2),
      annualizedReturn: (premiumPercent * 52).toFixed(1), // If repeated weekly
      reason: 'Good candidate',
    };
  }

  /**
   * Rank stocks by score
   */
  rankStocks(stocks) {
    return stocks
      .map(stock => ({
        ...stock,
        analysis: this.scoreStock(stock),
      }))
      .filter(s => s.analysis.score > 0)
      .sort((a, b) => b.analysis.score - a.analysis.score);
  }

  /**
   * Get top N stocks
   */
  getTopStocks(stocks, limit = 5) {
    const ranked = this.rankStocks(stocks);
    return ranked.slice(0, limit).map((stock, index) => ({
      rank: index + 1,
      symbol: stock.symbol,
      price: stock.price,
      iv: (stock.iv * 100).toFixed(1),
      weeklyPremium: stock.analysis.premiumPercent,
      annualizedReturn: stock.analysis.annualizedReturn,
      totalCost: stock.analysis.totalCost,
      premiumReceived: stock.analysis.premiumReceived,
      score: stock.analysis.score,
      strikePrice: stock.strikePrice,
      daysToExpiration: stock.daysToExpiration,
      volume: stock.volume,
      recommendation: `Buy 100 @ $${stock.price}, Sell weekly calls @ $${stock.strikePrice}`,
    }));
  }

  /**
   * Generate signal for a stock
   */
  generateSignal(stock) {
    const analysis = this.scoreStock(stock);

    if (analysis.score < 50) {
      return {
        signal: 'SKIP',
        reason: analysis.reason,
        score: analysis.score,
      };
    }

    if (analysis.score >= 75) {
      return {
        signal: 'STRONG_BUY',
        reason: `Excellent covered calls candidate - ${analysis.premiumPercent}% weekly premium`,
        score: analysis.score,
        details: analysis,
      };
    }

    if (analysis.score >= 60) {
      return {
        signal: 'BUY',
        reason: `Good covered calls candidate - ${analysis.premiumPercent}% weekly premium`,
        score: analysis.score,
        details: analysis,
      };
    }

    return {
      signal: 'HOLD',
      reason: `Moderate candidate - ${analysis.premiumPercent}% weekly premium`,
      score: analysis.score,
      details: analysis,
    };
  }

  /**
   * Get scanner parameters
   */
  getParameters() {
    return {
      name: 'Covered Calls Scanner',
      description: 'Aggressive weekly covered calls strategy',
      budget: this.budget,
      sharesPerTrade: this.sharesPerTrade,
      maxStockPrice: this.maxStockPrice,
      minIV: (this.minIV * 100).toFixed(1),
      minPremiumPercent: this.minPremiumPercent,
      strategy: 'Aggressive - Maximize weekly premiums',
      scanFrequency: 'Every hour',
      topRecommendations: 5,
    };
  }
}
