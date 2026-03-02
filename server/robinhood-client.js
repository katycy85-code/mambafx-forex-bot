/**
 * Robinhood API Client
 * Handles Robinhood account operations for covered calls
 * 
 * Note: Robinhood doesn't have official API for retail users
 * This uses the unofficial API (use at your own risk)
 * For production, use manual entry via dashboard
 */

import fetch from 'node-fetch';

export class RobinhoodClient {
  constructor(config = {}) {
    this.baseUrl = 'https://api.robinhood.com';
    this.username = config.username;
    this.password = config.password;
    this.mfaCode = config.mfaCode;
    this.token = null;
    this.refreshToken = null;
    this.accountId = null;
    this.isAuthenticated = false;
  }

  /**
   * Authenticate with Robinhood
   */
  async authenticate() {
    try {
      // Step 1: Request challenge
      const challengeRes = await fetch(`${this.baseUrl}/api-token-auth/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });

      if (challengeRes.status === 401) {
        // MFA required
        console.log('MFA required. Please provide MFA code.');
        return false;
      }

      const data = await challengeRes.json();

      if (data.token) {
        this.token = data.token;
        this.refreshToken = data.refresh_token;
        this.isAuthenticated = true;

        // Get account ID
        await this.getAccountInfo();

        console.log('✅ Robinhood authenticated');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Robinhood authentication error:', error);
      return false;
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/`, {
        headers: { Authorization: `Token ${this.token}` },
      });

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        this.accountId = data.results[0].account_number;
        return data.results[0];
      }

      return null;
    } catch (error) {
      console.error('Error getting account info:', error);
      return null;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance() {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/${this.accountId}/`, {
        headers: { Authorization: `Token ${this.token}` },
      });

      const data = await response.json();

      return {
        cash: parseFloat(data.cash),
        buyingPower: parseFloat(data.buying_power),
        equity: parseFloat(data.equity),
        totalReturn: parseFloat(data.portfolio_equity),
      };
    } catch (error) {
      console.error('Error getting account balance:', error);
      return null;
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

      const data = await response.json();

      return {
        symbol,
        lastPrice: parseFloat(data.last_trade_price),
        bid: parseFloat(data.bid_price),
        ask: parseFloat(data.ask_price),
        volume: parseInt(data.last_trade_price_source),
        updated: data.updated_at,
      };
    } catch (error) {
      console.error(`Error getting quote for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get option chain for stock
   */
  async getOptionChain(symbol) {
    try {
      // Get instrument ID first
      const instrumentRes = await fetch(
        `${this.baseUrl}/instruments/?symbol=${symbol}`,
        {
          headers: { Authorization: `Token ${this.token}` },
        }
      );

      const instrumentData = await instrumentRes.json();

      if (!instrumentData.results || instrumentData.results.length === 0) {
        return [];
      }

      const instrumentId = instrumentData.results[0].id;

      // Get option chain
      const chainRes = await fetch(
        `${this.baseUrl}/option_chains/?instrument_id=${instrumentId}`,
        {
          headers: { Authorization: `Token ${this.token}` },
        }
      );

      const chainData = await chainRes.json();

      if (!chainData.results || chainData.results.length === 0) {
        return [];
      }

      // Get option expirations
      const expirations = chainData.results[0].expiration_dates;

      // Get options for each expiration
      const allOptions = [];

      for (const expiration of expirations) {
        const optionsRes = await fetch(
          `${this.baseUrl}/options/?chain_id=${chainData.results[0].id}&expiration_date=${expiration}`,
          {
            headers: { Authorization: `Token ${this.token}` },
          }
        );

        const optionsData = await optionsRes.json();

        if (optionsData.results) {
          allOptions.push(...optionsData.results);
        }
      }

      // Format options
      return allOptions.map(opt => ({
        symbol: `${symbol} ${opt.expiration_date} ${opt.strike_price} ${opt.type.toUpperCase()}`,
        type: opt.type.toUpperCase(),
        strike: parseFloat(opt.strike_price),
        expiration: opt.expiration_date,
        bid: parseFloat(opt.bid_price || 0),
        ask: parseFloat(opt.ask_price || 0),
        lastPrice: parseFloat(opt.last_trade_price || 0),
        volume: parseInt(opt.volume || 0),
        openInterest: parseInt(opt.open_interest || 0),
        impliedVolatility: parseFloat(opt.implied_volatility || 0),
        delta: parseFloat(opt.delta || 0),
        gamma: parseFloat(opt.gamma || 0),
        theta: parseFloat(opt.theta || 0),
        vega: parseFloat(opt.vega || 0),
      }));
    } catch (error) {
      console.error(`Error getting option chain for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Place order (BUY stock)
   */
  async placeOrder(symbol, quantity, orderType = 'market') {
    try {
      // Get instrument
      const instrumentRes = await fetch(
        `${this.baseUrl}/instruments/?symbol=${symbol}`,
        {
          headers: { Authorization: `Token ${this.token}` },
        }
      );

      const instrumentData = await instrumentRes.json();

      if (!instrumentData.results || instrumentData.results.length === 0) {
        throw new Error(`Instrument not found: ${symbol}`);
      }

      const instrumentUrl = instrumentData.results[0].url;

      // Place order
      const orderRes = await fetch(`${this.baseUrl}/orders/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: `${this.baseUrl}/accounts/${this.accountId}/`,
          instrument: instrumentUrl,
          symbol,
          quantity,
          side: 'buy',
          type: orderType,
          time_in_force: 'gfd', // Good for day
          trigger: 'immediate',
          price: null,
        }),
      });

      const orderData = await orderRes.json();

      return {
        orderId: orderData.id,
        symbol,
        quantity,
        side: 'BUY',
        status: orderData.state,
        createdAt: orderData.created_at,
      };
    } catch (error) {
      console.error(`Error placing order for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Place options order (SELL call)
   */
  async placeOptionsOrder(optionSymbol, quantity, orderType = 'market') {
    try {
      // Get option instrument
      const optionRes = await fetch(
        `${this.baseUrl}/options/instruments/?symbol=${optionSymbol}`,
        {
          headers: { Authorization: `Token ${this.token}` },
        }
      );

      const optionData = await optionRes.json();

      if (!optionData.results || optionData.results.length === 0) {
        throw new Error(`Option not found: ${optionSymbol}`);
      }

      const optionUrl = optionData.results[0].url;

      // Place options order
      const orderRes = await fetch(`${this.baseUrl}/options/orders/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: `${this.baseUrl}/accounts/${this.accountId}/`,
          legs: [
            {
              instrument: optionUrl,
              side: 'sell',
              quantity,
              position_effect: 'open',
            },
          ],
          type: orderType,
          time_in_force: 'gfd',
          trigger: 'immediate',
          price: null,
        }),
      });

      const orderData = await orderRes.json();

      return {
        orderId: orderData.id,
        option: optionSymbol,
        quantity,
        side: 'SELL',
        status: orderData.state,
        createdAt: orderData.created_at,
      };
    } catch (error) {
      console.error(`Error placing options order for ${optionSymbol}:`, error);
      return null;
    }
  }

  /**
   * Get positions
   */
  async getPositions() {
    try {
      const response = await fetch(`${this.baseUrl}/positions/`, {
        headers: { Authorization: `Token ${this.token}` },
      });

      const data = await response.json();

      return data.results.map(pos => ({
        symbol: pos.instrument.split('/').pop().replace('/', ''),
        quantity: parseFloat(pos.quantity),
        averagePrice: parseFloat(pos.average_buy_price),
        currentPrice: parseFloat(pos.instrument_data.last_price),
        totalValue: parseFloat(pos.quantity) * parseFloat(pos.instrument_data.last_price),
        unrealizedPnL: (parseFloat(pos.quantity) * parseFloat(pos.instrument_data.last_price)) - 
                       (parseFloat(pos.quantity) * parseFloat(pos.average_buy_price)),
      }));
    } catch (error) {
      console.error('Error getting positions:', error);
      return [];
    }
  }

  /**
   * Get orders
   */
  async getOrders() {
    try {
      const response = await fetch(`${this.baseUrl}/orders/`, {
        headers: { Authorization: `Token ${this.token}` },
      });

      const data = await response.json();

      return data.results.map(order => ({
        orderId: order.id,
        symbol: order.symbol,
        quantity: parseFloat(order.quantity),
        side: order.side.toUpperCase(),
        status: order.state,
        type: order.type,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      }));
    } catch (error) {
      console.error('Error getting orders:', error);
      return [];
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    try {
      const response = await fetch(`${this.baseUrl}/orders/${orderId}/cancel/`, {
        method: 'POST',
        headers: { Authorization: `Token ${this.token}` },
      });

      return response.ok;
    } catch (error) {
      console.error(`Error canceling order ${orderId}:`, error);
      return false;
    }
  }
}

export default RobinhoodClient;
