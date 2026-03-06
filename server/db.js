/**
 * Database Management
 * SQLite database for storing trades and bot data
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

/**
 * Initialize database
 */
export async function initializeDatabase() {
  db = await open({
    filename: path.join(__dirname, '../trading_bot.db'),
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA foreign_keys = ON');

  // Create tables
  await createTables();

  return db;
}

/**
 * Create all database tables
 */
async function createTables() {
  // Trades table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tradeId TEXT UNIQUE NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      entryPrice REAL NOT NULL,
      exitPrice REAL,
      stopLoss REAL NOT NULL,
      takeProfit1 REAL,
      takeProfit2 REAL,
      positionSize REAL NOT NULL,
      riskAmount REAL NOT NULL,
      profitLoss REAL,
      profitLossPercent REAL,
      status TEXT DEFAULT 'OPEN',
      entryTime DATETIME DEFAULT CURRENT_TIMESTAMP,
      exitTime DATETIME,
      confirmationCount INTEGER,
      confirmations TEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Account balance history table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS accountHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance REAL NOT NULL,
      equity REAL NOT NULL,
      usedMargin REAL,
      freeMargin REAL,
      dailyPnL REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Bot settings table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS botSettings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      type TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Daily summary table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS dailySummary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE UNIQUE NOT NULL,
      openingBalance REAL NOT NULL,
      closingBalance REAL NOT NULL,
      dailyPnL REAL NOT NULL,
      dailyPnLPercent REAL NOT NULL,
      tradeCount INTEGER,
      wins INTEGER,
      losses INTEGER,
      winRate REAL,
      maxDrawdown REAL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notifications log table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS notificationLog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      phoneNumber TEXT,
      status TEXT,
      sentAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_trades_entryTime ON trades(entryTime);
    CREATE INDEX IF NOT EXISTS idx_accountHistory_timestamp ON accountHistory(timestamp);
    CREATE INDEX IF NOT EXISTS idx_dailySummary_date ON dailySummary(date);
  `);
}

/**
 * Save a trade
 */
export async function saveTrade(tradeData) {
  const {
    tradeId,
    symbol,
    direction,
    entryPrice,
    stopLoss,
    positionSize,
    riskAmount,
    confirmationCount,
    confirmations,
  } = tradeData;

  const result = await db.run(
    `INSERT INTO trades (
      tradeId, symbol, direction, entryPrice, stopLoss, positionSize,
      riskAmount, status, confirmationCount, confirmations
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tradeId,
      symbol,
      direction,
      entryPrice,
      stopLoss,
      positionSize,
      riskAmount,
      'OPEN',
      confirmationCount,
      JSON.stringify(confirmations),
    ]
  );

  return result;
}

/**
 * Update unrealized P&L for an open trade (called every minute from OANDA live data)
 */
export async function updateOpenTradePnL(tradeId, unrealizedPL, currentPrice) {
  await db.run(
    `UPDATE trades SET
      profitLoss = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE tradeId = ? AND status = 'OPEN'`,
    [unrealizedPL, tradeId]
  );
}

/**
 * Update trade with exit data
 */
export async function closeTrade(tradeId, exitPrice, profitLoss) {
  const profitLossPercent = (profitLoss / (await db.get(
    'SELECT riskAmount FROM trades WHERE tradeId = ?',
    [tradeId]
  )).riskAmount) * 100;

  const result = await db.run(
    `UPDATE trades SET
      exitPrice = ?, profitLoss = ?, profitLossPercent = ?,
      status = 'CLOSED', exitTime = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
    WHERE tradeId = ?`,
    [exitPrice, profitLoss, profitLossPercent, tradeId]
  );

  return result;
}

/**
 * Get all trades
 */
export async function getAllTrades(limit = 100, offset = 0) {
  const trades = await db.all(
    `SELECT * FROM trades ORDER BY entryTime DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return trades.map(trade => ({
    ...trade,
    confirmations: JSON.parse(trade.confirmations || '[]'),
  }));
}

/**
 * Get open trades
 */
export async function getOpenTrades() {
  const trades = await db.all(
    `SELECT * FROM trades WHERE status = 'OPEN' ORDER BY entryTime DESC`
  );

  return trades.map(trade => ({
    ...trade,
    confirmations: JSON.parse(trade.confirmations || '[]'),
  }));
}

/**
 * Get closed trades
 */
export async function getClosedTrades(limit = 100) {
  const trades = await db.all(
    `SELECT * FROM trades WHERE status = 'CLOSED' ORDER BY exitTime DESC LIMIT ?`,
    [limit]
  );

  return trades.map(trade => ({
    ...trade,
    confirmations: JSON.parse(trade.confirmations || '[]'),
  }));
}

/**
 * Get trades by symbol
 */
export async function getTradesBySymbol(symbol, limit = 100) {
  const trades = await db.all(
    `SELECT * FROM trades WHERE symbol = ? ORDER BY entryTime DESC LIMIT ?`,
    [symbol, limit]
  );

  return trades.map(trade => ({
    ...trade,
    confirmations: JSON.parse(trade.confirmations || '[]'),
  }));
}

/**
 * Save account balance history
 */
export async function saveAccountHistory(accountData) {
  const { balance, equity, usedMargin, freeMargin, dailyPnL } = accountData;

  const result = await db.run(
    `INSERT INTO accountHistory (balance, equity, usedMargin, freeMargin, dailyPnL)
    VALUES (?, ?, ?, ?, ?)`,
    [balance, equity, usedMargin, freeMargin, dailyPnL]
  );

  return result;
}

/**
 * Get account history
 */
export async function getAccountHistory(hours = 24) {
  const timestamp = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const history = await db.all(
    `SELECT * FROM accountHistory WHERE timestamp > ? ORDER BY timestamp DESC`,
    [timestamp]
  );

  return history;
}

/**
 * Save bot setting
 */
export async function saveBotSetting(key, value, type = 'string') {
  const result = await db.run(
    `INSERT OR REPLACE INTO botSettings (key, value, type, updatedAt)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [key, String(value), type]
  );

  return result;
}

/**
 * Get bot setting
 */
export async function getBotSetting(key) {
  const setting = await db.get(
    `SELECT * FROM botSettings WHERE key = ?`,
    [key]
  );

  if (!setting) return null;

  if (setting.type === 'number') return Number(setting.value);
  if (setting.type === 'boolean') return setting.value === 'true';
  return setting.value;
}

/**
 * Save daily summary
 */
export async function saveDailySummary(summaryData) {
  const {
    date,
    openingBalance,
    closingBalance,
    dailyPnL,
    dailyPnLPercent,
    tradeCount,
    wins,
    losses,
    winRate,
    maxDrawdown,
  } = summaryData;

  const result = await db.run(
    `INSERT OR REPLACE INTO dailySummary (
      date, openingBalance, closingBalance, dailyPnL, dailyPnLPercent,
      tradeCount, wins, losses, winRate, maxDrawdown
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      date,
      openingBalance,
      closingBalance,
      dailyPnL,
      dailyPnLPercent,
      tradeCount,
      wins,
      losses,
      winRate,
      maxDrawdown,
    ]
  );

  return result;
}

/**
 * Get daily summary
 */
export async function getDailySummary(days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const summaries = await db.all(
    `SELECT * FROM dailySummary WHERE date >= ? ORDER BY date DESC`,
    [startDate]
  );

  return summaries;
}

/**
 * Log notification
 */
export async function logNotification(notificationData) {
  const { type, message, phoneNumber, status } = notificationData;

  const result = await db.run(
    `INSERT INTO notificationLog (type, message, phoneNumber, status)
    VALUES (?, ?, ?, ?)`,
    [type, message, phoneNumber, status]
  );

  return result;
}

/**
 * Get trade statistics
 */
export async function getTradeStatistics(days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const stats = await db.get(
    `SELECT
      COUNT(*) as totalTrades,
      SUM(CASE WHEN profitLoss > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN profitLoss < 0 THEN 1 ELSE 0 END) as losses,
      SUM(profitLoss) as totalPnL,
      AVG(profitLoss) as avgPnL,
      MAX(profitLoss) as bestTrade,
      MIN(profitLoss) as worstTrade,
      AVG(profitLossPercent) as avgPnLPercent
    FROM trades
    WHERE status = 'CLOSED' AND exitTime > ?`,
    [startDate]
  );

  const winRate = stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 0;

  return {
    ...stats,
    winRate: winRate.toFixed(2),
  };
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (db) {
    await db.close();
  }
}

export { db };
