/**
 * FXOpen API Client
 * Handles all API calls to FXOpen for trading
 */

import axios from 'axios';

export class FXOpenClient {
  constructor(apiKey, apiSecret, accountId) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accountId = accountId;
    this.baseURL = 'https://api.fxopen.com';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    try {
      const response = await this.client.get(`/api/v1/accounts/${this.accountId}`);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get account balance
   */
  async getBalance() {
    try {
      const response = await this.client.get(`/api/v1/accounts/${this.accountId}/balance`);
      return {
        success: true,
        balance: response.data.balance,
        equity: response.data.equity,
        usedMargin: response.data.usedMargin,
        freeMargin: response.data.freeMargin,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get historical candles (OHLC data)
   */
  async getCandles(symbol, timeframe, limit = 100) {
    try {
      const response = await this.client.get(`/api/v1/candles`, {
        params: {
          symbol,
          timeframe,
          limit,
        },
      });

      return {
        success: true,
        candles: response.data.candles,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Place a market order
   */
  async placeMarketOrder(symbol, side, volume, stopLoss = null, takeProfit = null) {
    try {
      const orderData = {
        symbol,
        side, // 'buy' or 'sell'
        type: 'market',
        volume,
      };

      if (stopLoss) {
        orderData.stopLoss = stopLoss;
      }

      if (takeProfit) {
        orderData.takeProfit = takeProfit;
      }

      const response = await this.client.post(
        `/api/v1/accounts/${this.accountId}/orders`,
        orderData
      );

      return {
        success: true,
        orderId: response.data.orderId,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Place a limit order
   */
  async placeLimitOrder(symbol, side, volume, price, stopLoss = null, takeProfit = null) {
    try {
      const orderData = {
        symbol,
        side,
        type: 'limit',
        volume,
        price,
      };

      if (stopLoss) {
        orderData.stopLoss = stopLoss;
      }

      if (takeProfit) {
        orderData.takeProfit = takeProfit;
      }

      const response = await this.client.post(
        `/api/v1/accounts/${this.accountId}/orders`,
        orderData
      );

      return {
        success: true,
        orderId: response.data.orderId,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Close an order (partial or full)
   */
  async closeOrder(orderId, volume = null) {
    try {
      const closeData = {
        orderId,
      };

      if (volume) {
        closeData.volume = volume;
      }

      const response = await this.client.post(
        `/api/v1/accounts/${this.accountId}/orders/close`,
        closeData
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Update stop loss for an order
   */
  async updateStopLoss(orderId, stopLoss) {
    try {
      const response = await this.client.patch(
        `/api/v1/accounts/${this.accountId}/orders/${orderId}`,
        { stopLoss }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Update take profit for an order
   */
  async updateTakeProfit(orderId, takeProfit) {
    try {
      const response = await this.client.patch(
        `/api/v1/accounts/${this.accountId}/orders/${orderId}`,
        { takeProfit }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get open positions
   */
  async getOpenPositions() {
    try {
      const response = await this.client.get(
        `/api/v1/accounts/${this.accountId}/positions`
      );

      return {
        success: true,
        positions: response.data.positions,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get order history
   */
  async getOrderHistory(limit = 100, offset = 0) {
    try {
      const response = await this.client.get(
        `/api/v1/accounts/${this.accountId}/orders/history`,
        {
          params: { limit, offset },
        }
      );

      return {
        success: true,
        orders: response.data.orders,
        total: response.data.total,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get symbol details (bid/ask, pip value, etc.)
   */
  async getSymbolDetails(symbol) {
    try {
      const response = await this.client.get(`/api/v1/symbols/${symbol}`);

      return {
        success: true,
        symbol: response.data.symbol,
        bid: response.data.bid,
        ask: response.data.ask,
        pipValue: response.data.pipValue,
        minVolume: response.data.minVolume,
        maxVolume: response.data.maxVolume,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Get real-time quote
   */
  async getQuote(symbol) {
    try {
      const response = await this.client.get(`/api/v1/quotes/${symbol}`);

      return {
        success: true,
        bid: response.data.bid,
        ask: response.data.ask,
        timestamp: response.data.timestamp,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }
}

export default FXOpenClient;
