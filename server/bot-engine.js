/**
 * MambafX Bot Engine v2
 * Main trading bot that executes trades based on strategy signals
 * 
 * v2 Changes:
 * - Proper 1:2 R:R (was 1:0.67)
 * - Reduced pairs from 9 to 4 (focus on best liquidity)
 * - Spread filter: skip if spread > 2 pips
 * - ATR-based dynamic stop loss (not fixed)
 * - Trailing stop activates at +10 pips (was +5), trails at 8 pips (was 15)
 * - Removed premature breakeven/chop exits that locked in losses
 * - Max hold increased to 4 hours
 * - Smarter partial close: 50% at 1.5x risk, let rest run with trailing
 * - Scan interval increased to 2 minutes (reduce noise)
 * - Per-pair cooldown increased to 30 min after loss
 */

import { v4 as uuidv4 } from 'uuid';
import MambafXStrategy from './strategy.js';
import { QuickScalpStrategy } from './quick-scalp-strategy.js';
import NotificationService from './notifications.js';
import OandaAPI from './oanda-api.js';
import { NewsCalendar } from './news-calendar.js';
import * as db from './db.js';

export class BotEngine {
  constructor(config) {
    console.log('DEBUG: BotEngine constructor received config:', JSON.stringify(config, null, 2));
    this.config = {
      tradingCapital: 100,
      leverage: 50,
      maxDailyLoss: 10,           // 10% max daily loss (was 50% — way too high)
      maxDrawdown: 15,
      botMode: 'full-auto',
      // REDUCED to 4 best pairs — tighter spreads, better liquidity
      tradingPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'],
      nyOpenHour: 6,
      nyOpenMinute: 30,
      nyCloseHour: 15,
      nyCloseMinute: 0,
      // Trailing stop settings
      trailingStopEnabled: true,
      trailingStopPips: 8,              // Tighter trail (was 15)
      trailingStopActivationPips: 10,   // Activate later (was 5) — let trades breathe
      // News filter settings
      newsFilterEnabled: true,
      newsBlackoutMinutes: 30,
      // Max hold time: 4 hours (was 2 — too short for 20-pip targets)
      maxHoldMinutes: 240,
      // Scan interval: 2 minutes (was 1 — reduce noise)
      scanIntervalMs: 120000,
      // Spread filter
      maxSpreadPips: {
        default: 3.0, // Default for pairs not specified
        'EUR/USD': 2.0,
        'GBP/USD': 2.5,
        'AUD/USD': 2.5,
        'USD/JPY': 2.5,
        'NZD/USD': 3.0,
        'USD/CAD': 3.0,
        'GBP/JPY': 4.5, // Higher spread for volatile pairs
        'EUR/GBP': 3.0,
        'USD/CHF': 3.0,
      },
      ...config,
    };
    console.log('DEBUG: Final config.tradingPairs:', this.config.tradingPairs);

    this.strategy = new MambafXStrategy({
      minConfirmations: 3,
      riskRewardRatio: 2,
      positionSizePercent: 2,       // 2% risk per trade
      stopLossPips: 12,
      profitTarget1Ratio: 1.5,
      profitTarget2Ratio: 2.5,
      trailingStopPips: 8,
    });

    // Initialize Quick Scalp strategy v2
    this.quickScalpStrategy = new QuickScalpStrategy(this.config.tradingCapital);

    // Initialize OANDA API
    const oandaAccountId = process.env.OANDA_ACCOUNT_ID || '001-001-17887452-001';
    const oandaApiToken = process.env.OANDA_API_TOKEN || 'd1613cf312d0d35c93db8b37f2a1d48f-4cae4dcbb78257d569421fcfb4046bd0';
    const oandaApiUrl = process.env.OANDA_API_URL || 'https://api-fxtrade.oanda.com';
    
    if (oandaAccountId && oandaApiToken && oandaApiUrl) {
      this.oanda = new OandaAPI(oandaAccountId, oandaApiToken, oandaApiUrl);
      console.log('✅ OANDA API initialized with live account');
    } else {
      this.oanda = null;
      console.log('⚠️  OANDA credentials not configured - using simulation mode');
    }

    // Initialize news calendar
    this.newsCalendar = new NewsCalendar();
    if (this.config.newsFilterEnabled && this.newsCalendar) {
      console.log(`✅ News filter enabled: ${this.config.newsBlackoutMinutes} min blackout window`);
    }

    if (this.config.trailingStopEnabled) {
      console.log(`✅ Trailing stops enabled: ${this.config.trailingStopPips} pips (activates after ${this.config.trailingStopActivationPips} pips profit)`);
    }

    // Twilio notifications DISABLED
    this.notifications = null;
    console.log('ℹ️  Twilio notifications disabled (cost control)');

    this.userPhoneNumber = config.userPhoneNumber;
    this.isRunning = false;
    this.openTrades = [];
    this.dailyPnL = 0;
    this.accountBalance = this.config.tradingCapital;
    // Per-pair cooldown: 30 min after a losing trade (was 15)
    this.pairCooldowns = {};
    // Track daily trade count to prevent overtrading
    this.dailyTradeCount = 0;
    this.maxDailyTrades = 6; // Max 6 trades per day
    this.lastDayReset = new Date().toDateString();
  }

  /**
   * Start the bot
   */
  async start() {
    console.log('🤖 MambafX Bot v2 Starting...');
    this.isRunning = true;

    if (this.oanda) {
      try {
        const accountDetails = await this.oanda.getAccountDetails();
        this.accountBalance = accountDetails.balance;
        console.log('💵 Account balance from OANDA: $' + this.accountBalance.toFixed(2));
      } catch (error) {
        console.error('⚠️  Could not fetch account balance from OANDA:', error.message);
      }
    }

    // Sync open trades from OANDA on startup
    if (this.oanda) {
      try {
        const oandaTrades = await this.oanda.getOpenTrades();
        if (oandaTrades.length > 0) {
          this.openTrades = oandaTrades.map(t => ({
            tradeId: t.id,
            orderId: t.id,
            symbol: t.pair.replace('_', '/'),
            direction: t.units > 0 ? 'BUY' : 'SELL',
            actualEntryPrice: t.entryPrice,
            entryPrice: t.entryPrice,
            totalUnits: Math.abs(t.units),
            remainingUnits: Math.abs(t.units),
            positionSize: Math.abs(t.units),
            pipValue: t.pair.includes('JPY') ? 0.01 : 0.0001,

            partialClosedAt: [],
            openedAt: t.openTime ? new Date(t.openTime).getTime() : Date.now(),
          }));
          console.log(`📂 Synced ${oandaTrades.length} open trade(s) from OANDA`);

          for (const trade of this.openTrades) {
            try {
              await db.saveTrade({
                tradeId: trade.tradeId,
                symbol: trade.symbol,
                direction: trade.direction,
                entryPrice: trade.entryPrice,
                stopLoss: 12,
                positionSize: trade.positionSize,
                riskAmount: trade.positionSize * 0.0001 * 12,
                confirmationCount: 0,
                confirmations: [],
                status: 'OPEN',
              });
            } catch (err) {
              if (!err.message?.includes('UNIQUE')) {
                console.error(`Failed to save synced trade ${trade.symbol} to DB:`, err.message);
              }
            }
          }
        } else {
          console.log('📂 No open trades on OANDA to sync');
        }
      } catch (error) {
        console.error('⚠️  Could not sync open trades from OANDA:', error.message);
      }

      // Import historical closed trades
      try {
        const closedTrades = await this.oanda.getRecentClosedTrades(100);
        let imported = 0;
        for (const ct of closedTrades) {
          try {
            await db.saveClosedTrade({
              tradeId: `oanda-${ct.tradeId}`,
              symbol: ct.instrument,
              direction: ct.direction,
              entryPrice: ct.entryPrice,
              exitPrice: ct.exitPrice,
              stopLoss: 12,
              positionSize: ct.units,
              riskAmount: ct.units * 0.0001 * 12,
              profitLoss: ct.realizedPL,
              entryTime: ct.openTime ? new Date(ct.openTime).toISOString() : new Date().toISOString(),
              exitTime: ct.closeTime ? new Date(ct.closeTime).toISOString() : new Date().toISOString(),
            });
            imported++;
          } catch (err) {
            // Ignore duplicates
          }
        }
        if (imported > 0) {
          console.log(`📋 Imported ${imported} historical closed trade(s) from OANDA`);
        }
      } catch (err) {
        console.error('⚠️  Could not import closed trades from OANDA:', err.message);
      }
    }

    await db.saveBotSetting('botStatus', 'running');

    if (this.notifications) {
      await this.notifications.notifyBotStatus(this.userPhoneNumber, {
        isRunning: true,
        accountBalance: this.accountBalance,
        openPositions: this.openTrades.length,
        dailyPnL: this.dailyPnL,
      });
    }

    this.startTradingLoop();
  }

  /**
   * Stop the bot
   */
  async stop() {
    console.log('🛑 MambafX Bot Stopping...');
    this.isRunning = false;
    await db.saveBotSetting('botStatus', 'stopped');

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
   * Handle trades before weekend close (Friday 4:30 PM EST)
   */
  async handleWeekendTrades() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    if (dayOfWeek === 5 && (utcHour > 20 || (utcHour === 20 && utcMinute >= 30))) {
      console.log('⏰ Friday 4:30 PM EST: Initiating Weekend Management...');

      for (let i = this.openTrades.length - 1; i >= 0; i--) {
        const trade = this.openTrades[i];
        try {
          const quote = await this.oanda.getPrice(trade.symbol);
          const currentPrice = (quote.bid + quote.ask) / 2;
          const pipValue = trade.pipValue || 0.0001;
          const isBuy = trade.direction === 'BUY' || trade.direction === 'BULLISH';
          const priceDiff = isBuy
            ? currentPrice - (trade.actualEntryPrice || currentPrice)
            : (trade.actualEntryPrice || currentPrice) - currentPrice;
          const pipsProfit = priceDiff / pipValue;

          if (pipsProfit >= 10) {
            console.log(`✅ ${trade.symbol}: +${pipsProfit.toFixed(1)} pips. Moving SL to breakeven, taking 50% profit.`);
            await this.oanda.moveStopToBreakeven(trade.tradeId, trade.actualEntryPrice, pipValue);
            const unitsToClose = Math.floor(trade.remainingUnits / 2);
            if (unitsToClose > 0) {
              await this.oanda.closePartialTrade(trade.tradeId, unitsToClose);
              trade.remainingUnits -= unitsToClose;
            }
          } else {
            console.log(`❌ ${trade.symbol}: ${pipsProfit.toFixed(1)} pips. Closing before weekend.`);
            await this.closeFullTrade(trade, 'weekend_close');
          }
        } catch (error) {
          console.error(`Error during weekend management for ${trade.symbol}:`, error.message);
        }
      }
    }
  }

  /**
   * Reset daily counters at midnight
   */
  resetDailyCounters() {
    const today = new Date().toDateString();
    if (today !== this.lastDayReset) {
      console.log(`📅 New trading day: resetting daily counters`);
      this.dailyPnL = 0;
      this.dailyTradeCount = 0;
      this.lastDayReset = today;
    }
  }

  /**
   * Main trading loop
   */
  async startTradingLoop() {
    while (this.isRunning) {
      try {
        this.resetDailyCounters();
        await this.handleWeekendTrades();

        // Check daily loss limit before scanning
        const dailyLossLimit = this.accountBalance * (this.config.maxDailyLoss / 100);
        if (this.dailyPnL < -dailyLossLimit) {
          console.log(`🛑 Daily loss limit reached ($${this.dailyPnL.toFixed(2)} < -$${dailyLossLimit.toFixed(2)}). Pausing new trades.`);
        } else if (this.dailyTradeCount >= this.maxDailyTrades) {
          console.log(`🛑 Max daily trades reached (${this.dailyTradeCount}/${this.maxDailyTrades}). Pausing new trades.`);
        } else {
          // Scan for new trades
          for (const pair of this.config.tradingPairs) {
            await this.analyzeAndTrade(pair);
          }
        }

        // Always check open trades (trailing stop management + exit conditions)
        await this.checkOpenTrades();

        // Update account balance
        await this.updateAccountBalance();

        // Sleep for scan interval (2 minutes)
        await this.sleep(this.config.scanIntervalMs || 120000);
      } catch (error) {
        console.error("Bot Error:", error);
        if (this.notifications) {
          await this.notifications.notifyError(this.userPhoneNumber, { message: error.message });
        }
      }
    }
  }

  /**
   * Check if news filter blocks trading for this pair
   */
  async checkNewsFilter(pair) {
    if (!this.config.newsFilterEnabled || !this.newsCalendar) {
      return { blocked: false };
    }

    try {
      const newsStatus = await this.newsCalendar.isNewsWindowActive(pair, this.config.newsBlackoutMinutes);
      if (newsStatus.active) {
        const minutesAway = Math.round(Math.abs(newsStatus.timeUntil) / 60000);
        const direction = newsStatus.timeUntil > 0 ? 'in' : 'ago';
        console.log(`📰 NEWS FILTER: Blocking ${pair} - "${newsStatus.event}" ${minutesAway}min ${direction}`);
        return { blocked: true, reason: newsStatus.reason };
      }
    } catch (error) {
      console.warn(`⚠️  News filter check failed for ${pair}: ${error.message} - allowing trade`);
    }

    return { blocked: false };
  }

  /**
   * Close profitable open trades before upcoming high-impact news
   */
  async closeTradesBeforeNews() {
    if (!this.config.newsFilterEnabled || !this.newsCalendar) return;

    for (const trade of [...this.openTrades]) {
      try {
        const newsStatus = await this.newsCalendar.isNewsWindowActive(trade.symbol);
        if (newsStatus.active && newsStatus.timeUntil > 0) {
          if (this.oanda) {
            const price = await this.oanda.getPrice(trade.symbol);
            const currentPrice = (price.bid + price.ask) / 2;
            const isBuy = trade.direction === 'BUY' || trade.direction === 'BULLISH';
            const pipValue = trade.pipValue || 0.0001;
            const priceDiff = isBuy
              ? currentPrice - trade.entryPrice
              : trade.entryPrice - currentPrice;
            const pipsProfit = priceDiff / pipValue;

            if (pipsProfit > 5) {
              console.log(`📰 Closing profitable ${trade.symbol} (+${pipsProfit.toFixed(1)} pips) before news: ${newsStatus.event}`);
              await this.closeFullTrade(trade, 'news_close');
            }
          }
        }
      } catch (error) {
        console.error(`Error checking news for trade ${trade.tradeId}:`, error.message);
      }
    }
  }

  /**
   * Check spread before entering a trade
   * Returns spread in pips, or null if can't determine
   */
  async checkSpread(symbol) {
    if (!this.oanda) return null;
    try {
      const price = await this.oanda.getPrice(symbol);
      const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
      const spreadPips = (price.ask - price.bid) / pipValue;
      return spreadPips;
    } catch (error) {
      return null;
    }
  }

  /**
   * Analyze pair and execute trade if signal found
   */
  async analyzeAndTrade(symbol) {
    try {
      // Check news filter
      const newsCheck = await this.checkNewsFilter(symbol);
      if (newsCheck.blocked) return;

      // Check per-pair cooldown (30 min after a losing trade)
      const cooldownExpiry = this.pairCooldowns[symbol];
      if (cooldownExpiry && Date.now() < cooldownExpiry) {
        const minsLeft = Math.ceil((cooldownExpiry - Date.now()) / 60000);
        console.log(`⏳ ${symbol} in cooldown — ${minsLeft}min remaining`);
        return;
      }

      // Check spread before analyzing (save API calls if spread is too wide)
      const spreadPips = await this.checkSpread(symbol);
      if (spreadPips !== null) {
        const maxSpread = typeof this.config.maxSpreadPips === 'object'
          ? this.config.maxSpreadPips[symbol] || this.config.maxSpreadPips.default
          : this.config.maxSpreadPips;

        if (spreadPips > maxSpread) {
          console.log(`💸 ${symbol} spread too wide: ${spreadPips.toFixed(1)} pips (max: ${maxSpread})`);
          return;
        }
      }

      // Skip if already have open trade for this symbol
      if (this.openTrades.find(t => t.symbol === symbol)) {
        return; // Silently skip
      }

      // Get candles for analysis
      const candles5M = await this.getCandles(symbol, '5m', 100);
      const candles15M = await this.getCandles(symbol, '15m', 60);

      if (!candles5M.success || !candles15M.success) {
        return;
      }

      const openTradesForSymbol = this.openTrades.filter(t => t.symbol === symbol).length;

      // Strategy 1: MambafX (higher timeframe, fewer but better trades)
      const bias = this.strategy.analyzeBias(candles15M.candles);
      const shouldSkip = this.strategy.shouldSkipTrade(candles15M.candles, candles5M.candles, bias);

      if (!shouldSkip.skip) {
        const mambafxSignal = this.strategy.generateEntrySignal(candles15M.candles, candles5M.candles, bias);

        if (mambafxSignal.signal === 'ENTRY') {
          console.log(`[MambafX] ${symbol}: ${mambafxSignal.direction} signal (${mambafxSignal.confirmationCount} confirmations)`);
          await this.handleEntrySignal(symbol, { ...mambafxSignal, strategy: 'MambafX' });
          return;
        }
      }

      // Strategy 2: Quick Scalp v2 (stricter than v1)
      if (openTradesForSymbol < this.quickScalpStrategy.maxConcurrentTrades) {
        const quickScalpSignal = this.quickScalpStrategy.analyzeSignal(candles5M.candles, openTradesForSymbol);

        if (quickScalpSignal.signal !== 'NONE') {
          console.log(`[Quick Scalp v2] ${symbol}: ${quickScalpSignal.signal} - ${quickScalpSignal.reason}`);
          const tradeSignal = {
            signal: 'ENTRY',
            direction: quickScalpSignal.signal === 'BUY' ? 1 : -1,
            entryPrice: candles5M.candles[candles5M.candles.length - 1].close,
            stopLoss: quickScalpSignal.stopLoss || this.quickScalpStrategy.stopLossPips,
            takeProfit: quickScalpSignal.takeProfit || this.quickScalpStrategy.takeProfitPips,
            strategy: 'QuickScalp',
            reason: quickScalpSignal.reason,
          };
          await this.handleEntrySignal(symbol, tradeSignal);
        }
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
      return;
    }

    // Check daily loss limit
    const dailyLossLimit = this.accountBalance * (this.config.maxDailyLoss / 100);
    if (this.dailyPnL < -dailyLossLimit) {
      console.log('Daily loss limit reached, skipping trade');
      return;
    }

    // Check daily trade count
    if (this.dailyTradeCount >= this.maxDailyTrades) {
      console.log(`Max daily trades reached (${this.dailyTradeCount}/${this.maxDailyTrades})`);
      return;
    }

    if (this.config.botMode === 'manual') {
      if (this.notifications) {
        await this.notifications.notifyEntrySignal(this.userPhoneNumber, {
          symbol,
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          riskRewardRatio: signal.riskRewardRatio || 2,
          confirmationCount: signal.confirmationCount,
        });
      }
      await db.saveBotSetting(`pending_trade_${symbol}`, JSON.stringify(signal));
    } else if (this.config.botMode === 'semi-auto') {
      if (this.openTrades.length === 0) {
        await this.executeTrade(symbol, signal);
      } else if (this.notifications) {
        await this.notifications.notifyEntrySignal(this.userPhoneNumber, {
          symbol,
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
        });
      }
    } else if (this.config.botMode === 'full-auto') {
      const maxTrades = this.quickScalpStrategy?.maxConcurrentTrades || 2;
      if (this.openTrades.length >= maxTrades) {
        return;
      }
      await this.executeTrade(symbol, signal);
    }
  }

  /**
   * Execute trade
   */
  async executeTrade(symbol, signal) {
    try {
      let tradeId = uuidv4();

      const isBuy = signal.direction === 1 ||
        signal.direction === 'BUY' ||
        signal.direction === 'BULLISH';

      // Use signal's dynamic SL/TP (ATR-based from strategy)
      const stopLossPips = typeof signal.stopLoss === 'number' && signal.stopLoss < 100
        ? signal.stopLoss
        : 12;
      const takeProfitPips = typeof signal.takeProfit === 'number' && signal.takeProfit < 200
        ? signal.takeProfit
        : stopLossPips * 2; // Always maintain 1:2 R:R

      // Position sizing: risk 2% of account per trade
      const riskDollars = this.accountBalance * 0.02;
      const pipValuePer1000Units = symbol.includes('JPY') ? 0.0076 : 0.10;
      const rawUnits = (riskDollars / (stopLossPips * pipValuePer1000Units)) * 1000;
      let safeUnits = Math.max(1000, Math.min(Math.floor(rawUnits), 30000)); // Reduced max from 50k to 30k

      // Margin check
      let accountDetails = { marginAvailable: this.accountBalance };
      if (this.oanda) {
        try {
          accountDetails = await this.oanda.getAccountDetails();
        } catch (error) {
          // Continue with default
        }
      }

      const currentPrice = signal.entryPrice || 1.0;
      const notionalValue = (safeUnits / 1000) * currentPrice * 1000;
      const estimatedMarginRequired = notionalValue * 0.01;
      const maxMarginPerTrade = this.accountBalance * 0.25; // 25% max margin per trade (was 30%)

      if (estimatedMarginRequired > maxMarginPerTrade) {
        const maxUnitsForMargin = Math.floor((maxMarginPerTrade / 0.01) / currentPrice * 1000);
        safeUnits = Math.max(1000, Math.min(maxUnitsForMargin, 30000));
        console.log(`⚠️  Margin cap applied for ${symbol}`);
      }

      if (accountDetails.marginAvailable < estimatedMarginRequired) {
        console.warn(`❌ Insufficient margin for ${symbol}: need $${estimatedMarginRequired.toFixed(2)}, have $${accountDetails.marginAvailable.toFixed(2)}`);
        return;
      }

      const positionSizing = {
        positionSize: safeUnits,
        riskAmount: riskDollars,
      };

      // Calculate profit targets
      const profitTargets = this.strategy.calculateProfitTargets(
        signal.entryPrice,
        stopLossPips,
        signal.direction
      );

      // Place order on OANDA
      let order = { success: false };
      if (this.oanda) {
        try {
          const units = isBuy ? safeUnits : -safeUnits;

          // Place with FIXED stop loss initially
          // Trailing stop activated later after +10 pips profit
          const result = await this.oanda.placeOrder(
            symbol,
            units,
            takeProfitPips,
            stopLossPips,
            null  // No trailing stop on entry
          );
          order = { success: true, orderId: result.tradeId, ...result };
          console.log(`✅ Trade placed: ${symbol} ${isBuy ? 'BUY' : 'SELL'} ${units} units | SL: ${stopLossPips}pip | TP: ${takeProfitPips}pip (1:${(takeProfitPips/stopLossPips).toFixed(1)} R:R)`);
        } catch (error) {
          order = { success: false, error: error.message };
          console.error(`❌ Failed to place order for ${symbol}:`, error.message);
        }
      } else {
        order = { success: true, orderId: tradeId };
        console.log(`📊 SIMULATION: Trade placed for ${symbol}`);
      }

      if (!order.success) {
        console.error(`Failed to place order for ${symbol}:`, order.error);
        return;
      }

      if (order.orderId) {
        tradeId = order.orderId;
      }

      // Save trade to database
      const trade = {
        tradeId,
        symbol,
        direction: isBuy ? 'BUY' : 'SELL',
        entryPrice: signal.entryPrice,
        stopLoss: stopLossPips,
        positionSize: positionSizing.positionSize,
        riskAmount: positionSizing.riskAmount,
        confirmationCount: signal.confirmationCount,
        confirmations: signal.confirmations || [],
        entryTime: new Date().toISOString(),
        trailingStopPips: this.config.trailingStopPips || 8,
      };

      await db.saveTrade(trade);

      // Add to open trades
      const actualEntryPrice = order.entryPrice || signal.entryPrice;
      const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
      const tpPips = takeProfitPips;
      this.openTrades.push({
        ...trade,
        orderId: order.orderId,
        actualEntryPrice,
        totalUnits: safeUnits,
        remainingUnits: safeUnits,
        pipValue,

        partialClosedAt: [],
        openedAt: Date.now(),
        trailingStopActivated: false,
        stopLossPips,
        takeProfitPips,
      });

      // Increment daily trade count
      this.dailyTradeCount++;

      if (this.notifications) {
        await this.notifications.notifyTradeOpened(this.userPhoneNumber, {
          symbol,
          direction: isBuy ? 'BUY' : 'SELL',
          entryPrice: signal.entryPrice,
          stopLoss: stopLossPips,
          riskAmount: positionSizing.riskAmount,
          positionSize: positionSizing.positionSize,
        });
      }

      console.log(`✅ Trade opened: ${symbol} ${isBuy ? 'BUY' : 'SELL'} | Daily trades: ${this.dailyTradeCount}/${this.maxDailyTrades}`);
    } catch (error) {
      console.error('Error executing trade:', error);
    }
  }

  /**
   * Check open trades and manage exits
   * 
   * v2 changes:
   * - Removed 1-hour breakeven rule (was closing trades prematurely)
   * - Removed ATR chop exit (trailing stop handles this)
   * - Max hold increased to 4 hours
   * - Trailing stop activates at +10 pips (was +5)
   * - Partial close at 1.5x risk (not full TP)
   */
  async checkOpenTrades() {
    // Close profitable trades before upcoming news
    await this.closeTradesBeforeNews();

    for (const trade of this.openTrades) {
      try {
        let quote = { success: false };
        if (this.oanda) {
          try {
            quote = await this.oanda.getPrice(trade.symbol);
            quote.success = true;
          } catch (error) {
            console.error(`Failed to get price for ${trade.symbol}:`, error.message);
          }
        }
        if (!quote.success) continue;

        const currentPrice = (quote.bid + quote.ask) / 2;
        const timeInTrade = Date.now() - (trade.openedAt || Date.now());
        const timeInTradeMinutes = timeInTrade / (1000 * 60);
        const isBuyTrade = trade.direction === 'BUY' || trade.direction === 'BULLISH';
        const pipValue = trade.pipValue || 0.0001;
        const priceDiff = isBuyTrade
          ? currentPrice - (trade.actualEntryPrice || currentPrice)
          : (trade.actualEntryPrice || currentPrice) - currentPrice;
        const pipsProfit = priceDiff / pipValue;

        // ── TRAILING STOP ACTIVATION: after +10 pips profit ──────────
        const activationPips = this.config.trailingStopActivationPips || 10;
        if (this.config.trailingStopEnabled && !trade.trailingStopActivated && pipsProfit >= activationPips) {
          if (this.oanda && trade.orderId) {
            try {
              const trailPips = this.config.trailingStopPips || 8;
              await this.oanda.updateTrailingStop(trade.orderId, trailPips, trade.symbol);
              trade.trailingStopActivated = true;
              console.log(`📍 ${trade.symbol}: Trailing stop ACTIVATED at ${trailPips} pips (profit: +${pipsProfit.toFixed(1)} pips)`);
            } catch (err) {
              console.error(`Failed to activate trailing stop for ${trade.symbol}:`, err.message);
            }
          }
        }

        // ── MAX HOLD TIME: force-close after 4 hours ─────────────────
        const maxHoldMinutes = this.config.maxHoldMinutes || 240;
        if (timeInTradeMinutes >= maxHoldMinutes) {
          if (pipsProfit > 3) {
            // In profit — close with whatever we have
            console.log(`⏰ MAX HOLD: ${trade.symbol} open ${timeInTradeMinutes.toFixed(0)}min | +${pipsProfit.toFixed(1)} pips — closing with profit`);
            await this.closeFullTrade(trade, 'max_hold_profit');
            continue;
          } else if (pipsProfit > -3) {
            // Near breakeven — close to free up capital
            console.log(`⏰ MAX HOLD: ${trade.symbol} open ${timeInTradeMinutes.toFixed(0)}min | ${pipsProfit.toFixed(1)} pips — closing near breakeven`);
            await this.closeFullTrade(trade, 'max_hold_breakeven');
            continue;
          } else {
            // In loss — let stop loss handle it (don't force close at a loss)
            console.log(`⏰ MAX HOLD: ${trade.symbol} open ${timeInTradeMinutes.toFixed(0)}min | ${pipsProfit.toFixed(1)} pips — letting SL manage`);
          }
        }


      } catch (error) {
        console.error(`Error checking trade ${trade.tradeId}:`, error);
      }
    }
  }

  /**
   * Close full trade
   */
  async closeFullTrade(trade, reason = 'manual') {
    try {
      let result = { success: false };
      if (this.oanda) {
        try {
          result = await this.oanda.closeTrade(trade.orderId);
          result.success = true;
        } catch (error) {
          console.error(`Failed to close trade ${trade.tradeId}:`, error.message);
          result.success = false;
        }
      }

      if (result.success) {
        const exitPrice = result.closePrice || 0;
        const pnl = result.pnl || 0;
        console.log(`✅ Full close: ${trade.symbol} (${reason}) | P&L: $${pnl.toFixed(2)}`);
        
        try {
          await db.closeTrade(trade.tradeId, exitPrice, pnl);
          this.dailyPnL += pnl;
        } catch (dbErr) {
          console.error(`Failed to save closed trade ${trade.symbol} to DB:`, dbErr.message);
        }

        this.openTrades = this.openTrades.filter(t => t.tradeId !== trade.tradeId);

        // Set 30-minute cooldown on this pair if trade closed at a loss
        if (pnl < 0) {
          const cooldownMs = 30 * 60 * 1000; // 30 minutes (was 15)
          this.pairCooldowns[trade.symbol] = Date.now() + cooldownMs;
          console.log(`⏳ ${trade.symbol} cooldown set — 30min before re-entry (loss: $${pnl.toFixed(2)})`);
        }
      }
    } catch (error) {
      console.error('Error closing full trade:', error);
    }
  }

  /**
   * Close partial trade
   */
  async closePartialTrade(trade, percentage, targetName) {
    try {
      const unitsToClose = Math.floor((trade.remainingUnits || trade.totalUnits || trade.positionSize) * percentage);
      if (unitsToClose < 1) {
        return false;
      }

      let success = false;
      if (this.oanda) {
        try {
          await this.oanda.closePartialTrade(trade.orderId, unitsToClose);
          success = true;
        } catch (error) {
          console.error(`Failed to partial close ${trade.symbol}:`, error.message);
          return false;
        }
      } else {
        success = true;
      }

      if (success) {
        trade.remainingUnits = (trade.remainingUnits || trade.totalUnits) - unitsToClose;
        console.log(`✅ Partial close: ${trade.symbol} ${targetName} — closed ${unitsToClose} units (${percentage * 100}%), ${trade.remainingUnits} remaining`);
      }
      return success;
    } catch (error) {
      console.error('Error closing partial trade:', error);
      return false;
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
    try {
      if (!this.oanda) {
        return { success: false, candles: [] };
      }

      let granularity = timeframe.toUpperCase();
      if (granularity.match(/^\d+M$/)) {
        granularity = 'M' + granularity.replace('M', '');
      } else if (granularity.match(/^\d+H$/)) {
        granularity = 'H' + granularity.replace('H', '');
      } else if (granularity === '5M') {
        granularity = 'M5';
      } else if (granularity === '15M') {
        granularity = 'M15';
      } else if (granularity === '4H') {
        granularity = 'H4';
      }

      const candles = await this.oanda.getCandles(symbol, granularity, limit);
      return { success: true, candles };
    } catch (error) {
      console.error(`Error fetching candles for ${symbol}:`, error.message);
      return { success: false, candles: [], error: error.message };
    }
  }

  /**
   * Update account balance
   */
  async updateAccountBalance() {
    try {
      let balance = { success: false };
      if (this.oanda) {
        try {
          const accountDetails = await this.oanda.getAccountDetails();
          balance = {
            success: true,
            balance: accountDetails.balance,
            equity: accountDetails.balance + accountDetails.unrealizedPL,
            usedMargin: accountDetails.marginUsed,
            freeMargin: accountDetails.marginAvailable,
          };
        } catch (error) {
          console.error(`Failed to get account balance:`, error.message);
        }
      }

      if (balance.success) {
        this.accountBalance = balance.balance;
        await db.saveAccountHistory({
          balance: balance.balance,
          equity: balance.equity,
          usedMargin: balance.usedMargin,
          freeMargin: balance.freeMargin,
          dailyPnL: this.dailyPnL,
        });

        try {
          const oandaTrades = await this.oanda.getOpenTrades();
          const oandaTradeIds = new Set(oandaTrades.map(t => t.id));

          for (const oandaTrade of oandaTrades) {
            await db.updateOpenTradePnL(oandaTrade.id, oandaTrade.unrealizedPL, oandaTrade.currentPrice);
            const memTrade = this.openTrades.find(t => t.orderId === oandaTrade.id);
            if (memTrade) {
              memTrade.lastUnrealizedPL = oandaTrade.unrealizedPL;
              memTrade.lastPrice = oandaTrade.currentPrice;
            }
          }

          // Reconcile: find trades closed by OANDA (trailing stop, TP, SL)
          const closedByOanda = this.openTrades.filter(t => t.orderId && !oandaTradeIds.has(t.orderId));
          for (const closedTrade of closedByOanda) {
            console.log(`📋 ${closedTrade.symbol}: Closed by OANDA (trailing stop/TP/SL) — recording to DB`);
            try {
              const pnl = closedTrade.lastUnrealizedPL || 0;
              await db.closeTrade(closedTrade.tradeId, closedTrade.lastPrice || closedTrade.actualEntryPrice || 0, pnl);
              this.dailyPnL += pnl;

              // Set cooldown if loss
              if (pnl < 0) {
                const cooldownMs = 30 * 60 * 1000;
                this.pairCooldowns[closedTrade.symbol] = Date.now() + cooldownMs;
              }
            } catch (dbErr) {
              console.error(`Failed to record OANDA-closed trade ${closedTrade.symbol}:`, dbErr.message);
            }
            this.openTrades = this.openTrades.filter(t => t.tradeId !== closedTrade.tradeId);
          }

          // Reconcile DB
          try {
            const dbOpenTrades = await db.getOpenTrades();
            for (const dbTrade of dbOpenTrades) {
              if (!oandaTradeIds.has(dbTrade.tradeId)) {
                const inMemory = this.openTrades.find(t => t.tradeId === dbTrade.tradeId);
                if (!inMemory) {
                  await db.closeTrade(dbTrade.tradeId, dbTrade.entryPrice, dbTrade.profitLoss || 0);
                  console.log(`🔄 Reconciled stale DB trade: ${dbTrade.symbol} marked CLOSED`);
                }
              }
            }
          } catch (reconcileErr) {
            // Non-critical
          }
        } catch (err) {
          // Non-critical
        }
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
      dailyTradeCount: this.dailyTradeCount,
      maxDailyTrades: this.maxDailyTrades,
      botMode: this.config.botMode,
      tradingPairs: this.config.tradingPairs,
      trailingStopEnabled: this.config.trailingStopEnabled,
      trailingStopPips: this.config.trailingStopPips,
      newsFilterEnabled: this.config.newsFilterEnabled,
    };
  }
}

export default BotEngine;
