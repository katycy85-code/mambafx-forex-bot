/**
 * MambafX Bot Engine
 * Main trading bot that executes trades based on strategy signals
 * Features: Quick Scalp + MambafX strategies, trailing stops, news filter
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
      leverage: 25,
      maxDailyLoss: 50,
      maxDrawdown: 15,
      botMode: 'full-auto', // manual, semi-auto, full-auto
      // OANDA live account supports forex pairs only (no metals/commodities)
      tradingPairs: ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY', 'NZD/USD', 'USD/CAD', 'GBP/JPY', 'EUR/GBP', 'USD/CHF'],
      nyOpenHour: 6,
      nyOpenMinute: 30,
      nyCloseHour: 15,
      nyCloseMinute: 0,
      // Trailing stop settings (in pips)
      trailingStopEnabled: true,
      trailingStopPips: 20,       // 20 pips trailing stop - wider to avoid noise stop-outs
      trailingStopActivationPips: 8, // Only activate trailing stop after 8 pips profit
      // News filter settings
      newsFilterEnabled: true,
      newsBlackoutMinutes: 30,    // 30 min before/after high-impact news
      ...config,
    };
    console.log('DEBUG: Final config.tradingPairs:', this.config.tradingPairs);

    this.strategy = new MambafXStrategy({
      minConfirmations: 3,
      riskRewardRatio: 7,
      positionSizePercent: 25,
    });

    // Initialize Quick Scalp strategy
    this.quickScalpStrategy = new QuickScalpStrategy(this.config.tradingCapital);

    // Initialize OANDA API with hardcoded credentials
    const oandaAccountId = process.env.OANDA_ACCOUNT_ID || '001-001-17887452-001';
    const oandaApiToken = process.env.OANDA_API_TOKEN || 'd1613cf312d0d35c93db8b37f2a1d48f-4cae4dcbb78257d569421fcfb4046bd0';
    const oandaApiUrl = process.env.OANDA_API_URL || 'https://api-fxtrade.oanda.com';
    
    if (oandaAccountId && oandaApiToken && oandaApiUrl) {
      this.oanda = new OandaAPI(
        oandaAccountId,
        oandaApiToken,
        oandaApiUrl
      );
      console.log('✅ OANDA API initialized with live account');
    } else {
      this.oanda = null;
      console.log('⚠️  OANDA credentials not configured - using simulation mode');
    }

    // Initialize news calendar (uses ForexFactory public feed - no API key needed)
    this.newsCalendar = new NewsCalendar();
    if (this.config.newsFilterEnabled && this.newsCalendar) {
      console.log(`✅ News filter enabled: ${this.config.newsBlackoutMinutes} min blackout window`);
    } else {
      console.log('ℹ️  News filter disabled');
    }

    // Log trailing stop config
    if (this.config.trailingStopEnabled) {
      console.log(`✅ Trailing stops enabled: ${this.config.trailingStopPips} pips (activates after ${this.config.trailingStopActivationPips || 8} pips profit)`);
    }

    // Twilio notifications DISABLED - set to null to prevent SMS charges
    // To re-enable: remove the line below and uncomment the block
    this.notifications = null;
    console.log('ℹ️  Twilio notifications disabled (cost control)');
    /* DISABLED - uncomment to re-enable Twilio
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
    */

    this.userPhoneNumber = config.userPhoneNumber;
    this.isRunning = false;
    this.openTrades = [];
    this.dailyPnL = 0;
    this.accountBalance = this.config.tradingCapital;
    // Per-pair cooldown: after a losing trade, wait 15 min before re-entering same pair
    this.pairCooldowns = {}; // { 'EUR/USD': timestamp_when_cooldown_expires }
  }

  /**
   * Start the bot
   */
  async start() {
    console.log('🤖 MambafX Bot Starting...');
    this.isRunning = true;

    // Fetch real account balance from OANDA if connected
    if (this.oanda) {
      try {
        const accountDetails = await this.oanda.getAccountDetails();
        this.accountBalance = accountDetails.balance;
        console.log('💵 Account balance from OANDA: $' + this.accountBalance.toFixed(2));
      } catch (error) {
        console.error('⚠️  Could not fetch account balance from OANDA:', error.message);
        console.log('Using default balance: $' + this.accountBalance);
      }
    }

    // Sync open trades from OANDA on startup (restores state after redeploy)
    if (this.oanda) {
      try {
        const oandaTrades = await this.oanda.getOpenTrades();
        if (oandaTrades.length > 0) {
          this.openTrades = oandaTrades.map(t => ({
            tradeId: t.id,   // Use OANDA's actual ID so updateOpenTradePnL() matches correctly
            orderId: t.id,
            symbol: t.pair.replace('_', '/'),
            direction: t.units > 0 ? 'BUY' : 'SELL',
            actualEntryPrice: t.entryPrice,
            entryPrice: t.entryPrice,
            totalUnits: Math.abs(t.units),
            remainingUnits: Math.abs(t.units),
            positionSize: Math.abs(t.units),
            pipValue: t.pair.includes('JPY') ? 0.01 : 0.0001,
            tp25Price: t.units > 0
              ? t.entryPrice + (25 * (t.pair.includes('JPY') ? 0.01 : 0.0001))
              : t.entryPrice - (25 * (t.pair.includes('JPY') ? 0.01 : 0.0001)),
            partialClosedAt: [],
            // Use actual OANDA openTime so max-hold-time check is accurate after redeploy
            openedAt: t.openTime ? new Date(t.openTime).getTime() : Date.now(),
            profitTargets: {},
          }));
          console.log(`📂 Synced ${oandaTrades.length} open trade(s) from OANDA: ${this.openTrades.map(t => t.symbol).join(', ')}`);

          // Save synced trades to database so the dashboard Trades tab shows them
          for (const trade of this.openTrades) {
            try {
              await db.saveTrade({
                tradeId: trade.tradeId,  // This is now the OANDA trade ID
                symbol: trade.symbol,
                direction: trade.direction,
                entryPrice: trade.entryPrice,
                stopLoss: 15,
                positionSize: trade.positionSize,
                riskAmount: trade.positionSize * 0.0001 * 15,
                confirmationCount: 0,
                confirmations: [],
                status: 'OPEN',
              });
            } catch (err) {
              // Ignore duplicate key errors (trade already in DB from previous run)
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
      // Import historical closed trades from OANDA into DB (for Closed tab)
      try {
        const closedTrades = await this.oanda.getRecentClosedTrades(100);
        let imported = 0;
        for (const ct of closedTrades) {
          try {
            // Save as a closed trade — ignore duplicates silently
            await db.saveClosedTrade({
              tradeId: `oanda-${ct.tradeId}`,
              symbol: ct.instrument,
              direction: ct.direction,
              entryPrice: ct.entryPrice,
              exitPrice: ct.exitPrice,
              stopLoss: 15,
              positionSize: ct.units,
              riskAmount: ct.units * 0.0001 * 15,
              profitLoss: ct.realizedPL,
              entryTime: ct.openTime ? new Date(ct.openTime).toISOString() : new Date().toISOString(),
              exitTime: ct.closeTime ? new Date(ct.closeTime).toISOString() : new Date().toISOString(),
            });
            imported++;
          } catch (err) {
            if (!err.message?.includes('UNIQUE')) {
              // Ignore duplicate key errors silently
            }
          }
        }
        if (imported > 0) {
          console.log(`📋 Imported ${imported} historical closed trade(s) from OANDA into DB`);
        }
      } catch (err) {
        console.error('⚠️  Could not import closed trades from OANDA:', err.message);
      }
    }
    // Save bot status
    await db.saveBotSetting('botStatus', 'running');;

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
        // Trade 24/7 (volume filter will prevent low-liquidity trades)
        for (const pair of this.config.tradingPairs) {
          await this.analyzeAndTrade(pair);
        }

        // Check open trades (trailing stop management + exit conditions)
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
   * Check if news filter blocks trading for this pair
   * Returns { blocked: boolean, reason: string }
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
      // If news check fails, allow trading (fail-open)
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
          // News is upcoming (not past) - check if trade is profitable
          if (this.oanda) {
            const price = await this.oanda.getPrice(trade.symbol);
            const currentPrice = (price.bid + price.ask) / 2;
            const isBuy = trade.direction === 'BUY' || trade.direction === 'BULLISH';
            const pnl = isBuy
              ? (currentPrice - trade.entryPrice) * trade.positionSize
              : (trade.entryPrice - currentPrice) * trade.positionSize;

            if (pnl > 0) {
              console.log(`📰 Closing profitable ${trade.symbol} trade before news: ${newsStatus.event}`);
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
   * Analyze pair and execute trade if signal found
   */
  async analyzeAndTrade(symbol) {
    try {
      console.log(`🔍 Scanning ${symbol}...`);
      // Check news filter before analyzing
      const newsCheck = await this.checkNewsFilter(symbol);
      if (newsCheck.blocked) {
        return; // Skip this pair during news window
      }

      // Check per-pair cooldown (15 min after a losing trade)
      const cooldownExpiry = this.pairCooldowns[symbol];
      if (cooldownExpiry && Date.now() < cooldownExpiry) {
        const minsLeft = Math.ceil((cooldownExpiry - Date.now()) / 60000);
        console.log(`⏳ ${symbol} in cooldown — ${minsLeft}min remaining after last loss`);
        return;
      }

      // Get 5M candles for both strategies
      const candles5M = await this.getCandles(symbol, '5m', 100);
      const candles15M = await this.getCandles(symbol, '15m', 50);

      if (!candles5M.success || !candles15M.success) {
        console.log(`Failed to get candles for ${symbol}`);
        return;
      }

      // Count open trades for this symbol
      const openTradesForSymbol = this.openTrades.filter(t => t.symbol === symbol).length;

      // Strategy 1: MambafX (high quality, fewer trades)
      const bias = this.strategy.analyzeBias(candles15M.candles);
      const shouldSkip = this.strategy.shouldSkipTrade(
        candles15M.candles,
        candles5M.candles,
        bias
      );

      if (!shouldSkip.skip) {
        const mambafxSignal = this.strategy.generateEntrySignal(
          candles15M.candles,
          candles5M.candles,
          bias
        );

        if (mambafxSignal.signal === 'ENTRY') {
          console.log(`[MambafX] ${symbol}: ${mambafxSignal.direction} signal`);
          await this.handleEntrySignal(symbol, { ...mambafxSignal, strategy: 'MambafX' });
          return; // Execute MambafX if signal found
        }
      }

      // Strategy 2: Quick Scalp (high frequency, small wins)
      if (openTradesForSymbol < this.quickScalpStrategy.maxConcurrentTrades) {
        const quickScalpSignal = this.quickScalpStrategy.analyzeSignal(
          candles5M.candles,
          openTradesForSymbol
        );

        if (quickScalpSignal.signal !== 'NONE') {
          console.log(`[Quick Scalp] ${symbol}: ${quickScalpSignal.signal} - ${quickScalpSignal.reason}`);
          const tradeSignal = {
            signal: 'ENTRY',
            direction: quickScalpSignal.signal === 'BUY' ? 1 : -1,
            entryPrice: candles5M.candles[candles5M.candles.length - 1].close,
            stopLoss: this.quickScalpStrategy.stopLossPips,
            takeProfit: this.quickScalpStrategy.takeProfitPips,
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
      // Check global max concurrent trades before executing
      const maxTrades = this.quickScalpStrategy?.maxConcurrentTrades || 3;
      if (this.openTrades.length >= maxTrades) {
        // Silently skip - don't log every scan to avoid spam
        return;
      }
      // Execute trade automatically
      await this.executeTrade(symbol, signal);
    }
  }

  /**
   * Execute trade
   */
  async executeTrade(symbol, signal) {
    try {
      // tradeId will be replaced with OANDA's actual trade ID after order fill
      // so that updateOpenTradePnL() can match by tradeId correctly
      let tradeId = uuidv4(); // temporary, overwritten below if OANDA order succeeds

      // Determine direction: support both numeric (1/-1) and string ('BUY'/'SELL'/'BULLISH'/'BEARISH')
      const isBuy = signal.direction === 1 ||
        signal.direction === 'BUY' ||
        signal.direction === 'BULLISH';

      // Calculate position size in OANDA units
      // Use simple fixed-fraction sizing: risk 2% of account per trade
      // OANDA minimum is 1 unit; standard lot = 100,000 units
      // With $199 account and 50x leverage: usable margin = ~$9,950
      // Risk 2% = ~$4 per trade; at 15-pip SL on EUR/USD (~$1.50/pip for 1000 units)
      // => trade ~2,500 units per trade (safe for small account)
      const stopLossPips = typeof signal.stopLoss === 'number' && signal.stopLoss < 100
        ? signal.stopLoss   // already in pips (e.g. 15)
        : 15;               // fallback
      const takeProfitPips = typeof signal.takeProfit === 'number' && signal.takeProfit < 200
        ? signal.takeProfit
        : 25;

      // Fixed unit size: 2% of account * leverage / pip value
      // For a $199 account: 2% = $3.98 risk, 15-pip SL
      // pip value for 1000 units of EUR/USD ≈ $0.10/pip → need ~$3.98/($0.10*15) = 2,653 units
      const riskDollars = this.accountBalance * 0.02;
      const pipValuePer1000Units = symbol.includes('JPY') ? 0.0076 : 0.10; // approx USD per pip per 1000 units
      const rawUnits = (riskDollars / (stopLossPips * pipValuePer1000Units)) * 1000;
      const safeUnits = Math.max(1000, Math.min(Math.floor(rawUnits), 50000)); // clamp 1000–50000

      const positionSizing = {
        positionSize: safeUnits,
        riskAmount: riskDollars,
      };

      // Calculate profit targets
      const profitTargets = this.strategy.calculateProfitTargets(
        signal.entryPrice,
        signal.stopLoss,
        signal.direction
      );

      // Place order on OANDA
      let order = { success: false };
      if (this.oanda) {
        try {
          const units = isBuy ? safeUnits : -safeUnits;

          // Use trailing stop if enabled
          const trailingStopPips = this.config.trailingStopEnabled
            ? this.config.trailingStopPips
            : null;

          const result = await this.oanda.placeOrder(
            symbol,
            units,
            takeProfitPips,
            stopLossPips,
            trailingStopPips
          );
          order = { success: true, orderId: result.tradeId, ...result };
          const trailingInfo = trailingStopPips ? ` | Trailing: ${trailingStopPips}pip` : '';
          console.log(`✅ Trade placed on OANDA for ${symbol}: ${units} units at ${result.entryPrice}${trailingInfo}`);
        } catch (error) {
          order = { success: false, error: error.message };
          console.error(`❌ Failed to place order on OANDA for ${symbol}:`, error.message);
        }
      } else {
        // Simulation mode
        order = { success: true, orderId: tradeId };
        console.log(`📊 SIMULATION: Trade placed for ${symbol}`);
      }

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

      // Use OANDA's actual trade ID so P&L updates match via updateOpenTradePnL()
      if (order.orderId) {
        tradeId = order.orderId;
      }

      // Save trade to database
      const trade = {
        tradeId,
        symbol,
        direction: isBuy ? 'BUY' : 'SELL',
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        positionSize: positionSizing.positionSize,
        riskAmount: positionSizing.riskAmount,
        confirmationCount: signal.confirmationCount,
        confirmations: signal.confirmations || [],
        entryTime: new Date().toISOString(),  // explicit UTC ISO string
        trailingStopPips: this.config.trailingStopPips || 20,
      };

      await db.saveTrade(trade);

      // Add to open trades
      const actualEntryPrice = order.entryPrice || signal.entryPrice;
      const pipValue = symbol.includes('JPY') ? 0.01 : 0.0001;
      const tpPips = takeProfitPips || 25;
      const isBuyTrade = isBuy;
      const tp25Price = isBuyTrade
        ? actualEntryPrice + (tpPips * pipValue)
        : actualEntryPrice - (tpPips * pipValue);

      this.openTrades.push({
        ...trade,
        orderId: order.orderId,
        actualEntryPrice,
        totalUnits: safeUnits,
        remainingUnits: safeUnits,
        tp25Price,           // price level for 50% close
        pipValue,
        profitTargets,
        partialClosedAt: [],
        openedAt: Date.now(),
      });

      // Send notification if Twilio is configured
      if (this.notifications) {
        await this.notifications.notifyTradeOpened(this.userPhoneNumber, {
          symbol,
          direction: isBuy ? 'BUY' : 'SELL',
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          riskAmount: positionSizing.riskAmount,
          positionSize: positionSizing.positionSize,
        });
      }

      console.log(`✅ Trade opened: ${symbol} ${isBuy ? 'BUY' : 'SELL'}`);
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
    // First: close profitable trades before upcoming news
    await this.closeTradesBeforeNews();

    for (const trade of this.openTrades) {
      try {
        // Get current price from OANDA
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

        // Check for chop/no volume exit (scalping exit condition)
        const timeInTrade = Date.now() - (trade.openedAt || Date.now());
        const timeInTradeMinutes = timeInTrade / (1000 * 60);
        
        // Chop exit: only check after 60 minutes AND only if trade is in negative
        // If trade is positive after 60 min, let the trailing stop manage the exit
        if (timeInTradeMinutes >= 60) {
          const candles5M = await this.getCandles(trade.symbol, '5m', 20);
          if (candles5M.success) {
            const chopCheck = this.strategy.detectChop(candles5M.candles);
            const isBuyForChop = trade.direction === 'BUY' || trade.direction === 'BULLISH';
            const pipValueForChop = trade.pipValue || 0.0001;
            const priceDiffForChop = isBuyForChop
              ? currentPrice - (trade.actualEntryPrice || currentPrice)
              : (trade.actualEntryPrice || currentPrice) - currentPrice;
            const pipsProfitForChop = priceDiffForChop / pipValueForChop;
            // Exit choppy trade at breakeven or small profit (up to +8 pips)
            // Don't hold a choppy trade hoping for more — take the even or small win
            // Only let it run if it's strongly in profit (>8 pips) — trailing stop manages those
            if (chopCheck.isChopping && pipsProfitForChop < 8) {
              const exitLabel = pipsProfitForChop >= 0
                ? `+${pipsProfitForChop.toFixed(1)} pips (small win/even — taking it)`
                : `${pipsProfitForChop.toFixed(1)} pips (cutting loser)`;
              console.log(`Chop exit: ${trade.symbol} after ${timeInTradeMinutes.toFixed(1)}min | ${exitLabel}`);
              await this.closeFullTrade(trade, 'chop_exit');
              continue;
            } else if (pipsProfitForChop >= 8) {
              console.log(`Chop detected but ${trade.symbol} strongly positive (${pipsProfitForChop.toFixed(1)} pips) — trailing stop managing`);
            }
          }
        }
        // ── MAX HOLD TIME: force-close stale trades after 4 hours ──────────
        const maxHoldMinutes = this.config.maxHoldMinutes || 240; // 4 hours default
        if (timeInTradeMinutes >= maxHoldMinutes) {
          const isBuy = trade.direction === 'BUY' || trade.direction === 'BULLISH';
          const pipValue = trade.pipValue || 0.0001;
          const priceDiff = isBuy
            ? currentPrice - (trade.actualEntryPrice || currentPrice)
            : (trade.actualEntryPrice || currentPrice) - currentPrice;
          const pipsProfit = priceDiff / pipValue;
          // Only force-close if not meaningfully in profit (< 5 pips)
          if (pipsProfit < 5) {
            console.log(`⏰ MAX HOLD: ${trade.symbol} open ${timeInTradeMinutes.toFixed(0)}min (>${maxHoldMinutes}min) | P&L: ${pipsProfit.toFixed(1)} pips — force closing`);
            await this.closeFullTrade(trade, 'max_hold_time');
            continue;
          } else {
            console.log(`⏰ MAX HOLD: ${trade.symbol} open ${timeInTradeMinutes.toFixed(0)}min but in profit (${pipsProfit.toFixed(1)} pips) — letting trailing stop manage`);
          }
        }

        // ── PARTIAL CLOSE LOGIC ──────────────────────────────────────────
        // At 25-pip target: close 50%, move stop to breakeven, let 50% run
        const isBuyTrade = trade.direction === 'BUY' || trade.direction === 'BULLISH';

        if (trade.tp25Price && !trade.partialClosedAt.includes('tp25')) {
          const hitTP = isBuyTrade
            ? currentPrice >= trade.tp25Price
            : currentPrice <= trade.tp25Price;

          if (hitTP) {
            console.log(`🎯 ${trade.symbol}: Hit 25-pip target at ${currentPrice.toFixed(5)} — closing 50%, moving stop to breakeven`);
            const closed = await this.closePartialTrade(trade, 0.5, 'tp25');
            if (closed) {
              trade.partialClosedAt.push('tp25');
              // Move trailing stop to breakeven on remaining 50%
              if (this.oanda && trade.orderId) {
                try {
                  await this.oanda.moveStopToBreakeven(trade.orderId, trade.actualEntryPrice, trade.pipValue);
                  console.log(`🔒 ${trade.symbol}: Stop moved to breakeven at ${trade.actualEntryPrice.toFixed(5)}`);
                } catch (err) {
                  console.error(`Failed to move stop to breakeven for ${trade.symbol}:`, err.message);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error checking trade ${trade.tradeId}:`, error);
      }
    }
  }

  /**
   * Close full trade (for chop exit or other reasons)
   */
  async closeFullTrade(trade, reason = 'manual') {
    try {
      // Close order on OANDA
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
        
        // Save closed trade to database
        try {
          await db.closeTrade(trade.tradeId, exitPrice, pnl);
          this.dailyPnL += pnl;
        } catch (dbErr) {
          console.error(`Failed to save closed trade ${trade.symbol} to DB:`, dbErr.message);
        }

        // Remove from open trades
        this.openTrades = this.openTrades.filter(t => t.tradeId !== trade.tradeId);

        // Set 15-minute cooldown on this pair if trade closed at a loss
        if (pnl < 0) {
          const cooldownMs = 15 * 60 * 1000; // 15 minutes
          this.pairCooldowns[trade.symbol] = Date.now() + cooldownMs;
          console.log(`⏳ ${trade.symbol} cooldown set — 15min before re-entry (loss: $${pnl.toFixed(2)})`);
        }
      }
    } catch (error) {
      console.error('Error closing full trade:', error);
    }
  }

  /**
   * Close partial trade - closes a percentage of the remaining units
   * Returns true if successful
   */
  async closePartialTrade(trade, percentage, targetName) {
    try {
      const unitsToClose = Math.floor((trade.remainingUnits || trade.totalUnits || trade.positionSize) * percentage);
      if (unitsToClose < 1) {
        console.log(`Skipping partial close for ${trade.symbol} - units too small`);
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
        // Simulation
        success = true;
      }

      if (success) {
        // Update remaining units on the trade object
        trade.remainingUnits = (trade.remainingUnits || trade.totalUnits) - unitsToClose;
        console.log(
          `✅ Partial close: ${trade.symbol} ${targetName} — closed ${unitsToClose} units (${percentage * 100}%), ${trade.remainingUnits} units still running`
        );
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
        console.log(`⚠️  OANDA not configured - cannot fetch real candles for ${symbol}`);
        return { success: false, candles: [] };
      }

      // Convert timeframe format: '5m' -> 'M5', '15m' -> 'M15', '4h' -> 'H4'
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
      // Get balance from OANDA
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
        // Save to history
        await db.saveAccountHistory({
          balance: balance.balance,
          equity: balance.equity,
          usedMargin: balance.usedMargin,
          freeMargin: balance.freeMargin,
          dailyPnL: this.dailyPnL,
        });

        // Update unrealized P&L and reconcile closed trades
        try {
          const oandaTrades = await this.oanda.getOpenTrades();
          const oandaTradeIds = new Set(oandaTrades.map(t => t.id));

          // Update P&L for still-open trades
          for (const oandaTrade of oandaTrades) {
            await db.updateOpenTradePnL(oandaTrade.id, oandaTrade.unrealizedPL, oandaTrade.currentPrice);
            // Store last known P&L on in-memory trade for reconciliation
            const memTrade = this.openTrades.find(t => t.orderId === oandaTrade.id);
            if (memTrade) {
              memTrade.lastUnrealizedPL = oandaTrade.unrealizedPL;
              memTrade.lastPrice = oandaTrade.currentPrice;
            }
          }

          // Reconcile: find trades in our memory that OANDA has already closed (trailing stop, TP, etc.)
          const closedByOanda = this.openTrades.filter(t => t.orderId && !oandaTradeIds.has(t.orderId));
          for (const closedTrade of closedByOanda) {
            console.log(`📋 ${closedTrade.symbol}: Closed by OANDA (trailing stop/TP) — recording to DB`);
            try {
              // We don't have the exact exit price, use last known price from P&L
              const pnl = closedTrade.lastUnrealizedPL || 0;
              await db.closeTrade(closedTrade.tradeId, closedTrade.lastPrice || closedTrade.actualEntryPrice || 0, pnl);
              this.dailyPnL += pnl;
            } catch (dbErr) {
              console.error(`Failed to record OANDA-closed trade ${closedTrade.symbol}:`, dbErr.message);
            }
            // Remove from in-memory list
            this.openTrades = this.openTrades.filter(t => t.tradeId !== closedTrade.tradeId);
          }

          // Also reconcile DB: mark any DB-open trades not in OANDA as closed
          try {
            const dbOpenTrades = await db.getOpenTrades();
            for (const dbTrade of dbOpenTrades) {
              if (!oandaTradeIds.has(dbTrade.tradeId)) {
                // Check if it's in our memory (might be a synced trade without orderId)
                const inMemory = this.openTrades.find(t => t.tradeId === dbTrade.tradeId);
                if (!inMemory) {
                  // Trade is in DB as OPEN but not in OANDA and not in memory — mark closed
                  await db.closeTrade(dbTrade.tradeId, dbTrade.entryPrice, dbTrade.profitLoss || 0);
                  console.log(`🔄 Reconciled stale DB trade: ${dbTrade.symbol} marked CLOSED`);
                }
              }
            }
          } catch (reconcileErr) {
            // Non-critical
          }
        } catch (err) {
          // Non-critical - don't crash the balance update if P&L sync fails
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
      botMode: this.config.botMode,
      tradingPairs: this.config.tradingPairs,
      trailingStopEnabled: this.config.trailingStopEnabled,
      trailingStopPips: this.config.trailingStopPips,
      newsFilterEnabled: this.config.newsFilterEnabled,
    };
  }
}

export default BotEngine;
