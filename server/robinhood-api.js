/**
 * Robinhood API Integration
 * Fetches stock and options data from Robinhood
 * Using unofficial robin_stocks library approach
 */

export class RobinhoodAPI {
  constructor() {
    this.baseUrl = 'https://api.robinhood.com';
    this.token = null;
    this.accountId = null;
  }

  /**
   * Login to Robinhood (requires credentials)
   * Note: This is a placeholder - actual implementation would need credentials
   */
  async login(username, password) {
    try {
      const response = await fetch(`${this.baseUrl}/api-token-auth/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Robinhood login failed');
      }

      const data = await response.json();
      this.token = data.token;
      console.log('✅ Robinhood login successful');
      return true;
    } catch (error) {
      console.error('Robinhood login error:', error);
      return false;
    }
  }

  /**
   * Get stock quote
   */
  async getStockQuote(symbol) {
    try {
      const response = await fetch(
        `${this.baseUrl}/quotes/${symbol}/?include_inactive=true`,
        {
          headers: { Authorization: `Token ${this.token}` },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch quote for ${symbol}`);
      }

      const data = await response.json();
      return {
        symbol,
        price: parseFloat(data.last_trade_price),
        bid: parseFloat(data.bid_price),
        ask: parseFloat(data.ask_price),
        volume: data.volume,
        change: parseFloat(data.last_trade_price) - parseFloat(data.previous_close),
        changePercent: ((parseFloat(data.last_trade_price) - parseFloat(data.previous_close)) / parseFloat(data.previous_close)) * 100,
      };
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get options chain for a stock
   */
  async getOptionsChain(symbol, expirationDate) {
    try {
      // Get instrument ID first
      const instrumentResponse = await fetch(
        `${this.baseUrl}/instruments/?symbol=${symbol}`,
        {
          headers: { Authorization: `Token ${this.token}` },
        }
      );

      if (!instrumentResponse.ok) {
        throw new Error(`Failed to fetch instrument for ${symbol}`);
      }

      const instrumentData = await instrumentResponse.json();
      if (!instrumentData.results || instrumentData.results.length === 0) {
        throw new Error(`Instrument not found for ${symbol}`);
      }

      const instrumentId = instrumentData.results[0].id;

      // Get options chain
      const optionsResponse = await fetch(
        `${this.baseUrl}/options/chains/?instrument_id=${instrumentId}&expiration_date=${expirationDate}`,
        {
          headers: { Authorization: `Token ${this.token}` },
        }
      );

      if (!optionsResponse.ok) {
        throw new Error(`Failed to fetch options chain for ${symbol}`);
      }

      const optionsData = await optionsResponse.json();
      return optionsData.results || [];
    } catch (error) {
      console.error(`Error fetching options chain for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get implied volatility for a stock
   * This is estimated from options prices
   */
  async getImpliedVolatility(symbol) {
    try {
      // Get next Friday's expiration
      const nextFriday = this.getNextFriday();
      const options = await this.getOptionsChain(symbol, nextFriday);

      if (options.length === 0) {
        return null;
      }

      // Average IV from call options
      const calls = options.filter(o => o.type === 'call');
      if (calls.length === 0) return null;

      const avgIV = calls.reduce((sum, call) => sum + (call.implied_volatility || 0), 0) / calls.length;
      return avgIV;
    } catch (error) {
      console.error(`Error calculating IV for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get weekly call options for a stock
   */
  async getWeeklyCalls(symbol) {
    try {
      const nextFriday = this.getNextFriday();
      const options = await this.getOptionsChain(symbol, nextFriday);

      // Filter for calls
      const calls = options.filter(o => o.type === 'call');

      // Sort by strike price
      return calls.sort((a, b) => parseFloat(a.strike_price) - parseFloat(b.strike_price));
    } catch (error) {
      console.error(`Error fetching weekly calls for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get best call option for covered calls (slightly OTM for aggressive strategy)
   */
  async getBestCallForCoveredCalls(symbol, stockPrice) {
    try {
      const calls = await this.getWeeklyCalls(symbol);

      if (calls.length === 0) {
        return null;
      }

      // For aggressive strategy: find call that's 5-15% OTM with best premium
      const aggressiveCalls = calls.filter(call => {
        const strike = parseFloat(call.strike_price);
        const otmPercent = ((strike - stockPrice) / stockPrice) * 100;
        return otmPercent >= 0 && otmPercent <= 15; // OTM but not too far
      });

      if (aggressiveCalls.length === 0) {
        // If no OTM calls, take the closest ATM call
        return calls[Math.floor(calls.length / 2)];
      }

      // Return the call with highest bid price (best premium)
      return aggressiveCalls.reduce((best, current) => {
        const currentBid = parseFloat(current.bid_price) || 0;
        const bestBid = parseFloat(best.bid_price) || 0;
        return currentBid > bestBid ? current : best;
      });
    } catch (error) {
      console.error(`Error finding best call for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get next Friday's date (weekly options expiration)
   */
  getNextFriday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7; // If today is Friday, get next Friday
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    return nextFriday.toISOString().split('T')[0];
  }

  /**
   * Get days until next Friday
   */
  getDaysToExpiration() {
    const today = new Date();
    const nextFriday = new Date(today);
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    return daysUntilFriday || 7;
  }
}
