/**
 * MambafX Forex Bot Server
 * Express API server with WebSocket support for real-time updates
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import BotEngine from './bot-engine.js';
import * as db from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize bot engine
let botEngine = null;

/**
 * Initialize server
 */
async function initializeServer() {
  try {
    // Initialize database
    await db.initializeDatabase();
    console.log('✅ Database initialized');

    // Debug: Log environment variables
    console.log('Environment variables:', {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING',
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING',
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ? 'SET' : 'MISSING',
      USER_PHONE_NUMBER: process.env.USER_PHONE_NUMBER ? 'SET' : 'MISSING',
    });

    // Initialize bot engine
    botEngine = new BotEngine({
      fxopenApiKey: process.env.FXOPEN_API_KEY,
      fxopenApiSecret: process.env.FXOPEN_API_SECRET,
      fxopenAccountId: process.env.FXOPEN_ACCOUNT_ID,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
      userPhoneNumber: process.env.USER_PHONE_NUMBER,
      tradingCapital: parseInt(process.env.TRADING_CAPITAL || '200'),
      leverage: parseInt(process.env.LEVERAGE || '100'),
      botMode: process.env.BOT_MODE || 'manual',
      tradingPairs: (process.env.TRADING_PAIRS || 'EUR/USD,GBP/USD,AUD/USD').split(','),
    });

    console.log('✅ Bot engine initialized');
  } catch (error) {
    console.error('Server initialization error:', error);
    process.exit(1);
  }
}

// ============ API ENDPOINTS ============

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Get bot status
 */
app.get('/api/bot/status', (req, res) => {
  if (!botEngine) {
    return res.status(500).json({ error: 'Bot not initialized' });
  }

  res.json(botEngine.getStatus());
});

/**
 * Start bot
 */
app.post('/api/bot/start', async (req, res) => {
  try {
    if (!botEngine) {
      return res.status(500).json({ error: 'Bot not initialized' });
    }

    if (botEngine.isRunning) {
      return res.status(400).json({ error: 'Bot is already running' });
    }

    await botEngine.start();
    res.json({ message: 'Bot started', status: botEngine.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop bot
 */
app.post('/api/bot/stop', async (req, res) => {
  try {
    if (!botEngine) {
      return res.status(500).json({ error: 'Bot not initialized' });
    }

    await botEngine.stop();
    res.json({ message: 'Bot stopped', status: botEngine.getStatus() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get open trades
 */
app.get('/api/trades/open', async (req, res) => {
  try {
    const trades = await db.getOpenTrades();
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get closed trades
 */
app.get('/api/trades/closed', async (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const trades = await db.getClosedTrades(parseInt(limit));
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all trades
 */
app.get('/api/trades', async (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const offset = req.query.offset || 0;
    const trades = await db.getAllTrades(parseInt(limit), parseInt(offset));
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get trades by symbol
 */
app.get('/api/trades/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit = req.query.limit || 100;
    const trades = await db.getTradesBySymbol(symbol, parseInt(limit));
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get trade statistics
 */
app.get('/api/statistics', async (req, res) => {
  try {
    const days = req.query.days || 30;
    const stats = await db.getTradeStatistics(parseInt(days));
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get account history
 */
app.get('/api/account/history', async (req, res) => {
  try {
    const hours = req.query.hours || 24;
    const history = await db.getAccountHistory(parseInt(hours));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get daily summary
 */
app.get('/api/daily-summary', async (req, res) => {
  try {
    const days = req.query.days || 30;
    const summaries = await db.getDailySummary(parseInt(days));
    res.json(summaries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Approve pending trade
 */
app.post('/api/trades/approve', async (req, res) => {
  try {
    const { symbol } = req.body;

    if (!botEngine) {
      return res.status(500).json({ error: 'Bot not initialized' });
    }

    // Get pending trade from database
    const pendingTradeJson = await db.getBotSetting(`pending_trade_${symbol}`);
    if (!pendingTradeJson) {
      return res.status(404).json({ error: 'No pending trade for this symbol' });
    }

    const signal = JSON.parse(pendingTradeJson);

    // Execute trade
    await botEngine.executeTrade(symbol, signal);

    // Remove pending trade
    await db.saveBotSetting(`pending_trade_${symbol}`, '');

    res.json({ message: 'Trade approved and executed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reject pending trade
 */
app.post('/api/trades/reject', async (req, res) => {
  try {
    const { symbol } = req.body;

    // Remove pending trade
    await db.saveBotSetting(`pending_trade_${symbol}`, '');

    res.json({ message: 'Trade rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual trade execution
 */
app.post('/api/trades/manual', async (req, res) => {
  try {
    const { symbol, direction, entryPrice, exitPrice, profitLoss } = req.body;

    if (!symbol || !direction || !entryPrice) {
      return res.status(400).json({
        error: 'Missing required fields: symbol, direction, entryPrice',
      });
    }

    // Save manual trade
    const tradeId = `manual-${Date.now()}`;
    await db.saveTrade({
      tradeId,
      symbol,
      direction,
      entryPrice,
      stopLoss: 0,
      positionSize: 0,
      riskAmount: 0,
      confirmationCount: 0,
      confirmations: [],
    });

    // If exit data provided, close trade
    if (exitPrice && profitLoss !== undefined) {
      await db.closeTrade(tradeId, exitPrice, profitLoss);
    }

    res.json({ message: 'Manual trade recorded', tradeId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update bot settings
 */
app.post('/api/settings', async (req, res) => {
  try {
    const { key, value, type } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Missing required fields: key, value' });
    }

    await db.saveBotSetting(key, value, type);

    res.json({ message: 'Setting updated', key, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get bot settings
 */
app.get('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const value = await db.getBotSetting(key);

    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Serve static files (React frontend)
 */
app.use(express.static(path.join(__dirname, '../client/dist')));

/**
 * Fallback to index.html for SPA routing
 */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

/**
 * Start server
 */
async function startServer() {
  try {
    await initializeServer();

    app.listen(PORT, () => {
      console.log(`\n✅ MambafX Forex Bot Server running on port ${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}`);
      console.log(`🤖 Bot Status: http://localhost:${PORT}/api/bot/status\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  if (botEngine && botEngine.isRunning) {
    await botEngine.stop();
  }
  await db.closeDatabase();
  process.exit(0);
});

// Start the server
startServer();
