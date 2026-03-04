/**
 * Covered Calls Scanner Engine
 * Scans penny stocks for covered calls opportunities
 * Runs every hour to find top 5 recommendations
 */

import { CoveredCallsScanner } from './covered-calls-scanner.js';
import { RobinhoodAPI } from './robinhood-api.js';

export class CoveredCallsEngine {
  constructor() {
    this.scanner = new CoveredCallsScanner(500, 100); // $500 budget, 100 shares
    this.robinhood = new RobinhoodAPI();
    this.scanResults = [];
    this.lastScanTime = null;
    
    // Popular penny stocks to scan
    this.pennyStocks = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'PLTR', 'F',
      'GE', 'BAC', 'T', 'VZ', 'PFE', 'JNJ', 'KO', 'PEP', 'MCD', 'NKE',
      'NFLX', 'UBER', 'LYFT', 'DASH', 'COIN', 'SOFI', 'ROKU', 'SNAP', 'PINS', 'ETSY',
      'ZM', 'CRWD', 'OKTA', 'TWLO', 'DDOG', 'NET', 'SNOW', 'MSTR', 'SQ', 'HOOD',
      'LCID', 'RIVN', 'NIO', 'XPeng', 'LI', 'BABA', 'JD', 'PDD', 'BILI', 'MOMO',
    ];

    console.log('✅ Covered Calls Engine initialized');
  }

  /**
   * Scan a single stock for covered calls opportunity
   */
  async scanStock(symbol) {
    try {
      // Get stock quote
      const quote = await this.robinhood.getStockQuote(symbol);
      if (!quote) {
        console.log(`⚠️  Could not fetch quote for ${symbol}`);
        return null;
      }

      // Check if price is in range
      if (quote.price < this.scanner.minStockPrice || quote.price > this.scanner.maxStockPrice) {
        return null;
      }

      // Get IV
      const iv = await this.robinhood.getImpliedVolatility(symbol);
      if (!iv || iv < this.scanner.minIV) {
        return null;
      }

      // Get best call option
      const bestCall = await this.robinhood.getBestCallForCoveredCalls(symbol, quote.price);
      if (!bestCall) {
        return null;
      }

      // Compile stock data
      const stockData = {
        symbol,
        price: quote.price,
        bid: quote.bid,
        ask: quote.ask,
        volume: quote.volume,
        iv,
        weeklyCallPrice: parseFloat(bestCall.bid_price) || parseFloat(bestCall.last_trade_price) || 0,
        strikePrice: parseFloat(bestCall.strike_price),
        daysToExpiration: this.robinhood.getDaysToExpiration(),
        priceChange: quote.change,
        priceChangePercent: quote.changePercent,
      };

      return stockData;
    } catch (error) {
      console.error(`Error scanning ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Run full scan of all penny stocks
   */
  async runFullScan() {
    console.log('\n🔍 Starting Covered Calls Scan...');
    this.lastScanTime = new Date();

    const scannedStocks = [];

    // Scan all stocks in parallel (with rate limiting)
    for (let i = 0; i < this.pennyStocks.length; i += 5) {
      const batch = this.pennyStocks.slice(i, i + 5);
      const results = await Promise.all(batch.map(symbol => this.scanStock(symbol)));
      scannedStocks.push(...results.filter(r => r !== null));

      // Rate limiting
      if (i + 5 < this.pennyStocks.length) {
        await this.sleep(1000);
      }
    }

    // Get top 5
    this.scanResults = this.scanner.getTopStocks(scannedStocks, 5);

    console.log(`✅ Scan complete. Found ${this.scanResults.length} candidates`);
    return this.scanResults;
  }

  /**
   * Get latest scan results
   */
  getLatestResults() {
    return {
      timestamp: this.lastScanTime,
      results: this.scanResults,
      parameters: this.scanner.getParameters(),
    };
  }

  /**
   * Format results for display
   */
  formatResults() {
    if (this.scanResults.length === 0) {
      return 'No covered calls candidates found in this scan.';
    }

    let output = '\n📊 TOP 5 COVERED CALLS CANDIDATES\n';
    output += '═'.repeat(80) + '\n';

    this.scanResults.forEach(stock => {
      output += `\n${stock.rank}. ${stock.symbol} - Score: ${stock.score}/100\n`;
      output += `   Price: $${stock.price} | IV: ${stock.iv}% | Weekly Premium: ${stock.weeklyPremium}%\n`;
      output += `   Cost: $${stock.totalCost} | Premium: $${stock.premiumReceived} | Annualized: ${stock.annualizedReturn}%\n`;
      output += `   Strike: $${stock.strikePrice} | Expires: ${stock.daysToExpiration} days\n`;
      output += `   📌 ${stock.recommendation}\n`;
    });

    output += '\n' + '═'.repeat(80) + '\n';
    return output;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get scanner parameters
   */
  getParameters() {
    return this.scanner.getParameters();
  }
}
