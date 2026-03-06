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
   * Get pip value for a given forex instrument
   * JPY pairs: 0.01 per pip, all other forex pairs: 0.0001 per pip
   * Note: OANDA live forex accounts do not support metals (XAU) or commodities (WTI)
   */
  getPipValue(pair) {
    const pairUpper = pair.toUpperCase();
    if (pairUpper.includes('JPY')) return 0.01;
    return 0.0001;
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
   * Get current price for a pair using the /pricing endpoint (real-time bid/ask)
   */
  async getPrice(pair) {
    try {
      const oandaPair = pair.replace('/', '_');
      // Use the pricing endpoint for accurate real-time bid/ask prices
      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}/pricing?instruments=${oandaPair}`,
        { headers: this.headers }
      );

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.prices && data.prices.length > 0) {
        const price = data.prices[0];
        const bid = parseFloat(price.bids[0].price);
        const ask = parseFloat(price.asks[0].price);
        return {
          bid,
          ask,
          mid: (bid + ask) / 2,
        };
      }
      throw new Error('No price data received from OANDA pricing endpoint');
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

      return data.candles.map(candle => {
        // OANDA candles can return mid, bid, or ask prices depending on the request
        // Default to mid prices; fall back to bid prices if mid is not available
        const mid = candle.mid || {
          o: candle.bid?.o,
          h: candle.bid?.h,
          l: candle.bid?.l,
          c: candle.bid?.c,
        };
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
   * Place a market order with optional trailing stop
   * @param {string} pair - Currency pair (e.g. 'EUR/USD')
   * @param {number} units - Positive for BUY, negative for SELL
   * @param {number} takeProfitPips - Take profit in pips
   * @param {number} stopLossPips - Stop loss in pips
   * @param {number|null} trailingStopPips - Trailing stop distance in pips (null to disable)
   */
  async placeOrder(pair, units, takeProfitPips, stopLossPips, trailingStopPips = null) {
    try {
      // Get current price to calculate TP and SL
      const price = await this.getPrice(pair);
      const pipsValue = this.getPipValue(pair);

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

      // Build order object
      const orderObj = {
        instrument: oandaPair,
        units: units.toString(),
        type: 'MARKET',
      };

      // Add take profit if specified
      if (takeProfit) {
        orderObj.takeProfitOnFill = { price: takeProfit.toFixed(5) };
      }

      // Add trailing stop OR fixed stop loss (trailing stop takes priority)
      if (trailingStopPips && trailingStopPips > 0) {
        // OANDA trailing stop distance is in price units, not pips
        const trailingDistance = (trailingStopPips * pipsValue).toFixed(5);
        orderObj.trailingStopLossOnFill = { distance: trailingDistance };
        console.log(`📍 Trailing stop set: ${trailingStopPips} pips (${trailingDistance} price units) for ${pair}`);
      } else if (stopLoss) {
        orderObj.stopLossOnFill = { price: stopLoss.toFixed(5) };
      }

      const orderData = { order: orderObj };

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

      // OANDA can return different transaction types:
      // - orderFillTransaction: normal fill (most common)
      // - orderCancelTransaction: order cancelled (e.g. insufficient margin)
      // - relatedTransactionIDs: array of transaction IDs
      // Handle all cases safely
      const fill = data.orderFillTransaction;
      if (!fill) {
        // Log the full response to help diagnose
        const cancelReason = data.orderCancelTransaction?.reason || JSON.stringify(data).slice(0, 200);
        throw new Error(`Order not filled: ${cancelReason}`);
      }

      // tradeOpenedID is present when a new trade is opened
      // tradeReducedID is present when an existing trade is reduced
      const tradeId = fill.tradeOpenedID || fill.tradeReducedID || fill.id;

      return {
        tradeId,
        entryPrice: parseFloat(fill.price),
        units: units,
        takeProfit: takeProfit,
        stopLoss: stopLoss,
        trailingStopPips: trailingStopPips,
      };
    } catch (error) {
      console.error('Error placing order on OANDA:', error.message);
      throw error;
    }
  }

  /**
   * Update trailing stop on an existing trade
   * @param {string} tradeId - OANDA trade ID
   * @param {number} trailingStopPips - New trailing stop distance in pips
   * @param {string} pair - Currency pair (needed to calculate pip value)
   */
  async updateTrailingStop(tradeId, trailingStopPips, pair) {
    try {
      const pipsValue = this.getPipValue(pair);
      const trailingDistance = (trailingStopPips * pipsValue).toFixed(5);

      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}/trades/${tradeId}/orders`,
        {
          method: 'PUT',
          headers: this.headers,
          body: JSON.stringify({
            trailingStopLoss: { distance: trailingDistance },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OANDA API error: ${error.errorMessage || response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Trailing stop updated for trade ${tradeId}: ${trailingStopPips} pips`);
      return data;
    } catch (error) {
      console.error(`Error updating trailing stop for trade ${tradeId}:`, error.message);
      throw error;
    }
  }

  /**
   * Close a partial portion of a trade
   * @param {string} tradeId - OANDA trade ID
   * @param {number} units - Number of units to close (positive integer)
   */
  async closePartialTrade(tradeId, units) {
    try {
      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}/trades/${tradeId}/close`,
        {
          method: 'PUT',
          headers: this.headers,
          body: JSON.stringify({ units: units.toString() }),
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
        unitsClosed: units,
      };
    } catch (error) {
      console.error(`Error partially closing trade ${tradeId}:`, error.message);
      throw error;
    }
  }

  /**
   * Move stop loss to breakeven (entry price) on an existing trade
   * Replaces the trailing stop with a fixed stop at entry price
   * @param {string} tradeId - OANDA trade ID
   * @param {number} entryPrice - The original entry price
   * @param {number} pipValue - Pip value for the pair (0.0001 or 0.01 for JPY)
   */
  async moveStopToBreakeven(tradeId, entryPrice, pipValue) {
    try {
      // Set a fixed stop loss at entry price + 1 pip buffer (to avoid immediate stop-out on spread)
      const breakevenPrice = entryPrice;

      const response = await fetch(
        `${this.apiUrl}/v3/accounts/${this.accountId}/trades/${tradeId}/orders`,
        {
          method: 'PUT',
          headers: this.headers,
          body: JSON.stringify({
            stopLoss: { price: breakevenPrice.toFixed(5) },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OANDA API error: ${error.errorMessage || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error moving stop to breakeven for trade ${tradeId}:`, error.message);
      throw error;
    }
  }

  /**
   * Close a trade (fully)
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
