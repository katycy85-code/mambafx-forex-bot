/**
 * Covered Calls Routes
 * API endpoints for covered calls strategy
 */

import express from 'express';
import CoveredCallsStrategy from './covered-calls-strategy.js';
import * as db from './db.js';

const router = express.Router();
const strategy = new CoveredCallsStrategy({
  capital: 500,
  maxPositions: 5,
  targetWeeklyIncome: 0.004,
});

/**
 * Get covered calls recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const recommendedStocks = strategy.getRecommendedStocks();

    // In production, fetch real stock data from market data API
    // For now, return mock recommendations
    const recommendations = recommendedStocks.slice(0, 5).map(symbol => ({
      symbol,
      status: 'pending_analysis',
      message: 'Awaiting market data API integration',
    }));

    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Analyze stock for covered call opportunity
 */
router.post('/analyze', async (req, res) => {
  try {
    const { symbol, currentPrice, volatility, volume, avgVolume, optionChain } = req.body;

    if (!symbol || !currentPrice) {
      return res.status(400).json({ error: 'Missing required fields: symbol, currentPrice' });
    }

    const stockData = {
      symbol,
      currentPrice,
      volatility: volatility || 0.3,
      volume: volume || 1000000,
      avgVolume: avgVolume || 1000000,
      marketCap: 10_000_000_000, // Assume large cap
      optionChain: optionChain || [],
    };

    const signal = strategy.analyzeStock(stockData);

    if (!signal) {
      return res.json({
        symbol,
        recommendation: 'SKIP',
        reason: 'Does not meet covered call criteria',
      });
    }

    res.json(signal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create covered call position
 */
router.post('/positions', async (req, res) => {
  try {
    const {
      symbol,
      stockPrice,
      callStrike,
      callExpiration,
      callPremium,
      sharesQuantity,
    } = req.body;

    if (!symbol || !stockPrice || !callStrike) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const positionId = `cc-${symbol}-${Date.now()}`;
    const capitalDeployed = stockPrice * sharesQuantity;
    const premiumIncome = callPremium * sharesQuantity;
    const weeklyReturn = premiumIncome / capitalDeployed;
    const monthlyIncome = premiumIncome * 4.33; // Approximate monthly

    const position = {
      positionId,
      symbol,
      type: 'COVERED_CALL',
      status: 'OPEN',
      entryStockPrice: stockPrice,
      entryCallPrice: callPremium,
      strikePrice: callStrike,
      expirationDate: callExpiration,
      sharesQuantity,
      capitalDeployed,
      premiumIncome,
      weeklyReturn: (weeklyReturn * 100).toFixed(2),
      monthlyIncome: monthlyIncome.toFixed(2),
      createdAt: new Date().toISOString(),
    };

    // Save to database
    await db.saveCoveredCallPosition(position);

    res.json({
      message: 'Covered call position created',
      position,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all covered call positions
 */
router.get('/positions', async (req, res) => {
  try {
    const positions = await db.getCoveredCallPositions();
    res.json(positions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get specific covered call position
 */
router.get('/positions/:positionId', async (req, res) => {
  try {
    const { positionId } = req.params;
    const position = await db.getCoveredCallPosition(positionId);

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    res.json(position);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Close covered call position
 */
router.post('/positions/:positionId/close', async (req, res) => {
  try {
    const { positionId } = req.params;
    const { exitStockPrice, exitCallPrice, profitLoss } = req.body;

    if (!exitStockPrice || !exitCallPrice) {
      return res.status(400).json({ error: 'Missing exit prices' });
    }

    const position = await db.getCoveredCallPosition(positionId);

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Calculate final P&L
    const stockPnL = (exitStockPrice - position.entryStockPrice) * position.sharesQuantity;
    const callPnL = (position.entryCallPrice - exitCallPrice) * position.sharesQuantity;
    const totalPnL = stockPnL + callPnL;

    // Update position
    const closedPosition = {
      ...position,
      status: 'CLOSED',
      exitStockPrice,
      exitCallPrice,
      stockPnL: stockPnL.toFixed(2),
      callPnL: callPnL.toFixed(2),
      totalPnL: totalPnL.toFixed(2),
      closedAt: new Date().toISOString(),
    };

    await db.updateCoveredCallPosition(positionId, closedPosition);

    res.json({
      message: 'Position closed',
      position: closedPosition,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get portfolio statistics
 */
router.get('/portfolio/stats', async (req, res) => {
  try {
    const positions = await db.getCoveredCallPositions();
    const stats = strategy.getPortfolioStats(positions);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get portfolio performance
 */
router.get('/portfolio/performance', async (req, res) => {
  try {
    const days = req.query.days || 30;
    const positions = await db.getCoveredCallPositions();

    const openPositions = positions.filter(p => p.status === 'OPEN');
    const closedPositions = positions.filter(p => p.status === 'CLOSED');

    const totalOpenCapital = openPositions.reduce((sum, p) => sum + p.capitalDeployed, 0);
    const totalOpenIncome = openPositions.reduce((sum, p) => sum + parseFloat(p.premiumIncome), 0);
    const totalClosedPnL = closedPositions.reduce((sum, p) => sum + parseFloat(p.totalPnL), 0);

    res.json({
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      totalOpenCapital: totalOpenCapital.toFixed(2),
      totalOpenIncome: totalOpenIncome.toFixed(2),
      totalClosedPnL: totalClosedPnL.toFixed(2),
      averageReturn: openPositions.length > 0
        ? ((totalOpenIncome / totalOpenCapital) * 100).toFixed(2)
        : 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
