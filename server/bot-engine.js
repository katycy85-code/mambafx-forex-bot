/**
 * MambafX Bot Engine
 * Main trading bot that executes trades based on strategy signals
 */

import { v4 as uuidv4 } from 'uuid';
import MambafXStrategy from './strategy.js';
// FXOpen removed - using OANDA only
import NotificationService from './notifications.js';
import * as db from './db.js';

export class BotEngine {
  constructor(config) {
    this.config = {
      tradingCapital: 200,
      leverage: 100,
      maxDailyLoss: 5,
      maxDrawdown: 15,
      botMode: 'manual', // manual, semi-auto, full-auto
      tradingPairs: ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY', 'NZD/USD'],
      nyOpenHour: 6,
      nyOpenMinute: 30,
      nyCloseHour: 15,
      nyCloseMinute: 0,
      ...config,
    };

    this.strategy = new MambafXStrategy({
      minConfirmations: 3,
      riskRewardRatio: 7,
      positionSizePercent: 25,
    });

    // FXOpen removed - using OANDA only
    this.fxopen = null;

    // Initialize Twilio notifications only if configured
    if (config.twilioAccountSid && config.twilioAuthToken && config.twilioPhoneNumber) {
      this.notifications = new NotificationService(
        config.twilioAccountSid,
        config.twilioAuthToken,
        config.twilioPhoneNumber
      );
    } else {
      this.notifications = null;
      console.log('ℹ️  Twilio not configured - SMS notifications disabled');
    }

    this.userPhoneNumber = config.userPhoneNumber;
    this.isRunning = false;
    this.openTrades = [];
    this.dailyPnL = 0;
    this.accountBalance = this.config.tradingCapital;
  }

  /**
   * Start the bot
   */
  async start() {
    console.log('🤖 MambafX Bot Starting...');
    this.isRunning = true;

    // Save bot status
    await db.saveBotSetting('botStatus', 'running');

    // Send start notification if Twilio is configured
    if (this.notifications) {
      await this.notifications.notifyBotStatus(this.userPhoneNumber, {
        isRunning: true,
        accountBalance: this.accountBalance,
        openPositions: this.openTrades.length,
        dailyPnL: this.dailyPnL,
      });
    }

    // Start trading loop
    this.startTradingLoop();
  }

  /**
   * Stop the bot
   */
  async stop() {
    console.log('🛑 MambafX Bot Stopping...');
    this.isRunning = false;

    // Save bot status
    await db.saveBotSetting('botStatus', 'stopped');

    // Send stop notification if Twilio is configured
    if (this.notifications) {
      await this.notifications.notifyBotStatus(this.userPhoneNumber, {
        isRunning: false,
        accountBalance: this.accountBalance,
        openPositions: this.openTrades.length,
        dailyPnL: this.dailyPnL,
      });
    }
  }

  /**
   * Main trading loop
   */
  async startTradingLoop() {
    while (this.isRunning) {
      try {
        // Check if it's NY trading hours
        if (this.isNYTradingHours()) {
          // Scan all trading pairs
          for (const pair of this.config.tradingPairs) {
            await this.analyzeAndTrade(pair);
          }
        }

        // Check open trades
        await this.checkOpenTrades();

        // Update account balance
        await this.updateAccountBalance();

        // Sleep for 1 minute before next scan
        await this.sleep(60000);
      } catch (error) {
        console.error('Bot Error:', error);
        if (this.notifications) {
          await this.notifications.notifyError(this.userPhoneNumber, {
            message: error.message,
          });
        }
      }
    }
  }

  /**
   * Analyze pair and execute trade if signal found
   */
  async analyzeAndTrade(symbol) {
    try {
      // Get 4H and 1M candles
      const candles4H = await this.getCandles(symbol, '4h', 50);
      const candles1M = await this.getCandles(symbol, '1m', 100);

      if (!candles4H.success || !candles1M.success) {
        console.log(`Failed to get candles for ${symbol}`);
        return;
      }

      // Analyze bias
      const bias = this.strategy.analyzeBias(candles4H.candles);

      // Check if should skip
      const shouldSkip = this.strategy.shouldSkipTrade(
        candles4H.candles,
        candles1M.candles,
        bias
      );

      if (shouldSkip.skip) {
        console.log(`Skipping ${symbol}: ${shouldSkip.reason}`);
        return;
      }

      // Generate entry signal
      const signal = this.strategy.generateEntrySignal(
        candles4H.candles,
        candles1M.candles,
        bias
      );

      if (signal.signal === 'ENTRY') {
        await this.handleEntrySignal(symbol, signal);
      }
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
    }
  }

  /**
   * Handle entry signal based on bot mode
   */
  async handleEntrySignal(symbol, signal) {
    // Check if we already have open trade for this symbol
    if (this.openTrades.find(t => t.symbol === symbol)) {
      console.log(`Already have open trade for ${symbol}`);
      return;
    }

    // Check daily loss limit
    if (this.dailyPnL < -(this.accountBalance * this.config.maxDailyLoss / 100)) {
      console.log('Daily loss limit reached, skipping trade');
      return;
    }

    if (this.config.botMode === 'manual') {
      // Send notification and wait for approval
      if (this.notifications) {
        await this.notifications.notifyEntrySignal(this.userPhoneNumber, {
          symbol,
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          riskRewardRatio: signal.riskRewardRatio || this.config.leverage,
          confirmationCount: signal.confirmationCount,
        });
      }

      // Store pending trade for manual approval
      await db.saveBotSetting(`pending_trade_${symbol}`, JSON.stringify(signal));
    } else if (this.config.botMode === 'semi-auto') {
      // Execute first trade automatically
      const openTradeCount = this.openTrades.length;
      if (openTradeCount === 0) {
        await this.executeTrade(symbol, signal);
      } else {
        // Send notification for additional trades
        if (this.notifications) {
          await this.notifications.notifyEntrySignal(this.userPhoneNumber, {
            symbol,
            direction: signal.direction,
            entryPrice: signal.entryPrice,
            stopLoss: signal.stopLoss,
            riskRewardRatio: signal.riskRewardRatio || this.config.leverage,
            confirmationCount: signal.confirmationCount,
          });
        }
      }
    } else if (this.config.botMode === 'full-auto') {
      // Execute trade automatically
      await this.executeTrade(symbol, signal);
    }
  }

  /**
   * Execute trade
   */
  async executeTrade(symbol, signal) {
    try {
      const tradeId = uuidv4();

      // Calculate position size
      const positionSizing = this.strategy.calculatePositionSize(
        this.accountBalance,
        signal.entryPrice,
        signal.stopLoss,
        this.config.leverage
      );

      // Calculate profit targets
      const profitTargets = this.strategy.calculateProfitTargets(
        signal.entryPrice,
        signal.stopLoss,
        signal.direction
      );

      // Place order on OANDA
      // TODO: Integrate with OANDA API
      const order = { success: true, orderId: tradeId };

      if (!order.success) {
        console.error(`Failed to place order for ${symbol}:`, order.error);
        if (this.notifications) {
          await this.notifications.notifyError(this.userPhoneNumber, {
            symbol,
            message: `Failed to place order: ${order.error}`,
          });
        }
        return;
      }

      // Save trade to database
      const trade = {
        tradeId,
        symbol,
        direction: signal.direction,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        positionSize: positionSizing.positionSize,
        riskAmount: positionSizing.riskAmount,
        confirmationCount: signal.confirmationCount,
        confirmations: signal.confirmations || [],
      };

      await db.saveTrade(trade);

      // Add to open trades
      this.openTrades.push({
        ...trade,
        orderId: order.orderId,
        profitTargets,
        partialClosedAt: [],
      });

      // Send notification if Twilio is configured
      if (this.notifications) {
        await this.notifications.notifyTradeOpened(this.userPhoneNumber, {
          symbol,
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          riskAmount: positionSizing.riskAmount,
          positionSize: positionSizing.positionSize,
        });
      }

      console.log(`✅ Trade opened: ${symbol} ${signal.direction}`);
    } catch (error) {
      console.error('Error executing trade:', error);
      if (this.notifications) {
        await this.notifications.notifyError(this.userPhoneNumber, {
          symbol,
          message: `Trade execution error: ${error.message}`,
        });
      }
    }
  }

  /**
   * Check open trades and manage exits
   */
  async checkOpenTrades() {
    for (const trade of this.openTrades) {
      try {
        // Get current price from OANDA
        // TODO: Integrate with OANDA API
        const quote = { success: true, bid: 1.0, ask: 1.0 };
        if (!quote.success) continue;

        const currentPrice = (quote.bid + quote.ask) / 2;

        // Check for profit targets
        if (trade.direction === 'BULLISH') {
          // Check target 1 (1:3 ratio) - close 50%
          if (
            currentPrice >= trade.profitTargets.target1 &&
            !trade.partialClosedAt.includes('target1')
          ) {
            await this.closePartialTrade(trade, 0.5, 'target1');
            trade.partialClosedAt.push('target1');
          }

          // Check target 2 (1:5 ratio) - close 25%
          if (
            currentPrice >= trade.profitTargets.target2 &&
            !trade.partialClosedAt.includes('target2')
          ) {
            await this.closePartialTrade(trade, 0.25, 'target2');
            trade.partialClosedAt.push('target2');
          }
        } else if (trade.direction === 'BEARISH') {
          // Check target 1 (1:3 ratio) - close 50%
          if (
            currentPrice <= trade.profitTargets.target1 &&
            !trade.partialClosedAt.includes('target1')
          ) {
            await this.closePartialTrade(trade, 0.5, 'target1');
            trade.partialClosedAt.push('target1');
          }

          // Check target 2 (1:5 ratio) - close 25%
          if (
            currentPrice <= trade.profitTargets.target2 &&
            !trade.partialClosedAt.includes('target2')
          ) {
            await this.closePartialTrade(trade, 0.25, 'target2');
            trade.partialClosedAt.push('target2');
          }
        }
      } catch (error) {
        console.error(`Error checking trade ${trade.tradeId}:`, error);
      }
    }
  }

  /**
   * Close partial trade
   */
  async closePartialTrade(trade, percentage, targetName) {
    try {
      const volumeToClose = trade.positionSize * percentage;

      // Close order on OANDA
      // TODO: Integrate with OANDA API
      const result = { success: true };

      if (result.success) {
        console.log(
          `✅ Partial close: ${trade.symbol} ${targetName} (${percentage * 100}%)`
        );
      }
    } catch (error) {
      console.error('Error closing partial trade:', error);
    }
  }

  /**
   * Check if it's NY trading hours
   */
  isNYTradingHours() {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();

    const openTime = this.config.nyOpenHour * 60 + this.config.nyOpenMinute;
    const closeTime = this.config.nyCloseHour * 60 + this.config.nyCloseMinute;
    const currentTime = hour * 60 + minute;

    return currentTime >= openTime && currentTime < closeTime;
  }

  /**
   * Get candles from OANDA
   */
  async getCandles(symbol, timeframe, limit) {
    // TODO: Integrate with OANDA API
    return { success: true, candles: [] };
  }

  /**
   * Update account balance
   */
  async updateAccountBalance() {
    try {
      // Get balance from OANDA
      // TODO: Integrate with OANDA API
      const balance = { success: true, balance: this.accountBalance, equity: this.accountBalance, usedMargin: 0, freeMargin: this.accountBalance };

      if (balance.success) {
        this.accountBalance = balance.balance;

        // Save to history
        await db.saveAccountHistory({
          balance: balance.balance,
          equity: balance.equity,
          usedMargin: balance.usedMargin,
          freeMargin: balance.freeMargin,
          dailyPnL: this.dailyPnL,
        });
      }
    } catch (error) {
      console.error('Error updating account balance:', error);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      accountBalance: this.accountBalance,
      openTrades: this.openTrades.length,
      dailyPnL: this.dailyPnL,
      botMode: this.config.botMode,
      tradingPairs: this.config.tradingPairs,
    };
  }
}

export default BotEngine;
