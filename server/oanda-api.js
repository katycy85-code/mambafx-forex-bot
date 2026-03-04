/**
 * OANDA API Integration
 * Handles all OANDA REST API calls for trading, account management, and market data
 */

import fetch from 'node-fetch';

export class OandaAPI {
  constructor(accountId, apiToken, apiUrl) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.apiUrl = apiUrl || 'https://api-fxpractice.oanda.com';
    this.headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'AcceptDatetimeFormat': 'UNIX',
    };
  }

  /**
   * Get account details including balance
   */
  async getAccountDetails() {
    try {
      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}`,
        { headers: this.headers }
      );
      
      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        balance: parseFloat(data.account.balance),
        unrealizedPL: parseFloat(data.account.unrealizedPL),
        marginAvailable: parseFloat(data.account.marginAvailable),
        marginUsed: parseFloat(data.account.marginUsed),
        openTradeCount: data.account.openTradeCount,
      };
    } catch (error) {
      console.error('Error fetching account details from OANDA:', error.message);
      throw error;
    }
  }

  /**
   * Get current price for a pair
   */
  async getPrice(pair) {
    try {
      const oandaPair = pair.replace('/', '_');
      const response = await fetch(
        `${this.apiUrl}/v3/instruments/${oandaPair}/candles?count=1&granularity=M1`,
        { headers: this.headers }
      );

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.candles && data.candles.length > 0) {
        const candle = data.candles[0];
        return {
          bid: parseFloat(candle.bid.c),
          ask: parseFloat(candle.ask.c),
          mid: (parseFloat(candle.bid.c) + parseFloat(candle.ask.c)) / 2,
        };
      }
      throw new Error('No candle data received');
    } catch (error) {
      console.error(`Error fetching price for ${pair}:`, error.message);
      throw error;
    }
  }

  /**
   * Get candles for technical analysis
   */
  async getCandles(pair, granularity = 'M5', count = 100) {
    try {
      const oandaPair = pair.replace('/', '_');
      const response = await fetch(
        `${this.apiUrl}/v3/instruments/${oandaPair}/candles?count=${count}&granularity=${granularity}`,
        { headers: this.headers }
      );

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.candles || data.candles.length === 0) {
        throw new Error('No candles returned from OANDA');
      }
      console.log('DEBUG: First candle structure:', JSON.stringify(data.candles[0]).substring(0, 500));
      return data.candles.map(candle => {
        const mid = candle.mid || { o: candle.bid?.o, h: candle.bid?.h, l: candle.bid?.l, c: candle.bid?.c };
        return {
          time: candle.time,
          open: parseFloat(mid.o || 0),
          high: parseFloat(mid.h || 0),
          low: parseFloat(mid.l || 0),
          close: parseFloat(mid.c || 0),
          volume: candle.volume || 0,
          bid: {
            o: parseFloat(candle.bid?.o || 0),
            h: parseFloat(candle.bid?.h || 0),
            l: parseFloat(candle.bid?.l || 0),
            c: parseFloat(candle.bid?.c || 0),
          },
          ask: {
            o: parseFloat(candle.ask?.o || 0),
            h: parseFloat(candle.ask?.h || 0),
            l: parseFloat(candle.ask?.l || 0),
            c: parseFloat(candle.ask?.c || 0),
          },
        };
      });
    } catch (error) {
      console.error(`Error fetching candles for ${pair}:`, error.message);
      throw error;
    }
  }

  /**
   * Place a market order
   */
  async placeOrder(pair, units, takeProfitPips, stopLossPips) {
    try {
      // Get current price to calculate TP and SL
      const price = await this.getPrice(pair);
      const pipsValue = pair.includes('JPY') ? 0.01 : 0.0001;

      let takeProfit = null;
      let stopLoss = null;

      if (takeProfitPips) {
        takeProfit = units > 0 
          ? price.ask + (takeProfitPips * pipsValue)
          : price.bid - (takeProfitPips * pipsValue);
      }

      if (stopLossPips) {
        stopLoss = units > 0
          ? price.ask - (stopLossPips * pipsValue)
          : price.bid + (stopLossPips * pipsValue);
      }

      const oandaPair = pair.replace('/', '_');
      const orderData = {
        order: {
          instrument: oandaPair,
          units: units.toString(),
          type: 'MARKET',
          takeProfitOnFill: takeProfit ? { price: takeProfit.toFixed(5) } : undefined,
          stopLossOnFill: stopLoss ? { price: stopLoss.toFixed(5) } : undefined,
        },
      };

      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}/orders`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(orderData),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OANDA API error: ${error.errorMessage || response.statusText}`);
      }

      const data = await response.json();
      return {
        tradeId: data.orderFillTransaction.tradeOpenedID,
        entryPrice: parseFloat(data.orderFillTransaction.price),
        units: units,
        takeProfit: takeProfit,
        stopLoss: stopLoss,
      };
    } catch (error) {
      console.error('Error placing order on OANDA:', error.message);
      throw error;
    }
  }

  /**
   * Close a trade
   */
  async closeTrade(tradeId) {
    try {
      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}/trades/${tradeId}/close`,
        {
          method: 'PUT',
          headers: this.headers,
          body: JSON.stringify({ units: 'ALL' }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OANDA API error: ${error.errorMessage || response.statusText}`);
      }

      const data = await response.json();
      return {
        closePrice: parseFloat(data.orderFillTransaction.price),
        pnl: parseFloat(data.orderFillTransaction.pl),
      };
    } catch (error) {
      console.error('Error closing trade on OANDA:', error.message);
      throw error;
    }
  }

  /**
   * Get open trades
   */
  async getOpenTrades() {
    try {
      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}/openTrades`,
        { headers: this.headers }
      );

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`);
      }

      const data = await response.json();
      return data.trades.map(trade => ({
        id: trade.id,
        pair: trade.instrument,
        units: parseInt(trade.initialUnits),
        entryPrice: parseFloat(trade.price),
        currentPrice: parseFloat(trade.pricingInfo?.closeoutAsk || trade.price),
        unrealizedPL: parseFloat(trade.unrealizedPL),
        openTime: trade.openTime,
      }));
    } catch (error) {
      console.error('Error fetching open trades from OANDA:', error.message);
      throw error;
    }
  }
}

export default OandaAPI;
