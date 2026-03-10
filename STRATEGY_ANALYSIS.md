# MambafX Strategy Analysis & Fix Plan

## Current Performance
- 142 trades, 42 wins / 98 losses = 29.58% win rate
- Total P&L: -$79.73
- Average P&L: -$0.56/trade
- Best trade: +$6.58, Worst trade: -$4.98

## Root Cause Analysis

### Problem 1: Negative Expected Value Setup
- SL = 15 pips, TP = 10 pips → Risk:Reward = 1.5:1 (AGAINST you)
- Need >60% win rate to break even with this R:R
- Current win rate is 29.58% → guaranteed loss

### Problem 2: QuickScalp Strategy Too Loose
- Only needs 3/4 weak conditions
- RSI thresholds (35/65) still too wide for scalping
- Trend detection using simple 8/20 MA on 5M is noisy
- Candle momentum (2/3 bullish candles) is not meaningful

### Problem 3: MambafX Strategy Never Fires
- Requires STRONG bias (higher highs on 15M) + breakout + market structure
- This combo almost never aligns → nearly all trades from QuickScalp
- When it does fire, it uses the same bad R:R

### Problem 4: Too Many Pairs
- 9 pairs scanned every 60 seconds
- More pairs = more noise = more bad signals
- Small account ($100-200) spread too thin

### Problem 5: Premature Exits Lock In Losses
- 1-hour breakeven rule closes at ±2 pips → usually small loss after spread
- ATR chop detection after 30 min closes trades that might recover
- Max hold 2 hours forces exit on trades that need more time

### Problem 6: No Spread Consideration
- On a $100-200 account, spread is ~1-2 pips on major pairs
- With 10-pip TP, spread eats 10-20% of target
- No spread check before entry

## Fix Plan

### Fix 1: Flip the Risk:Reward
- SL = 10 pips (tighter), TP = 20 pips (wider) → R:R = 1:2
- Only need 34% win rate to break even
- With decent signals, 40-45% win rate = profitable

### Fix 2: Rewrite QuickScalp with Stronger Filters
- Add EMA 50 as trend filter (only trade with the trend)
- Use RSI divergence, not just level
- Add ADX filter (only trade when ADX > 20 = trending)
- Require price to be at a key level (S/R, round number)
- Minimum 2 consecutive candles in direction before entry

### Fix 3: Reduce Pairs to 3-4 Best
- EUR/USD, GBP/USD, USD/JPY, AUD/USD
- Better liquidity, tighter spreads, more predictable

### Fix 4: Remove Premature Exit Rules
- Remove 1-hour breakeven rule (let trades breathe)
- Remove ATR chop exit (trailing stop handles this)
- Increase max hold to 4 hours
- Keep trailing stop as primary exit mechanism

### Fix 5: Add Spread Filter
- Check spread before entry
- Skip if spread > 2 pips (too expensive for scalp)

### Fix 6: Smarter Trailing Stop
- Don't activate trailing stop until +8 pips (not 5)
- Trail at 8 pips (not 15) once activated
- This locks in more profit
