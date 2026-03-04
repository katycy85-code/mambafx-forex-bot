# MambafX OANDA Real-Time Trading Bot - Integration Guide

## Overview

Your forex trading bot is now fully integrated with OANDA for **live trading** with real-time data. This guide explains how the bot works and how to use it safely.

---

## What's New: Real-Time OANDA Integration

### ✅ Implemented Features

1. **Real-Time Candle Fetching**
   - Fetches 5M and 15M candles directly from OANDA
   - Uses real market data for technical analysis
   - No more simulated data

2. **Real-Time Price Updates**
   - Gets current bid/ask prices for all trading pairs
   - Updates every time the bot checks open trades
   - Used for profit target and stop-loss management

3. **Actual Trade Execution**
   - Places real market orders on OANDA
   - Automatically sets take-profit and stop-loss levels
   - Calculates position sizes based on your account balance

4. **Trade Management**
   - Monitors open positions in real-time
   - Closes partial positions at profit targets
   - Exits trades if market becomes choppy (no volume)

5. **Account Balance Sync**
   - Fetches real account balance from OANDA at startup
   - Updates balance history for tracking

---

## How to Get Started

### Step 1: Set Up OANDA Account

1. Create a free practice account at [OANDA](https://www.oanda.com)
   - Practice account is perfect for testing
   - No real money required
   - Same API as live trading

2. Generate API credentials:
   - Log in to OANDA
   - Go to Account Settings → API Access
   - Create a new API token (save this securely)
   - Note your Account ID

### Step 2: Configure Environment Variables on Railway

Go to your Railway project dashboard and add these environment variables:

```
OANDA_ACCOUNT_ID=your_account_id_here
OANDA_API_TOKEN=your_api_token_here
OANDA_API_URL=https://api-fxpractice.oanda.com  (for practice account)
```

**For live trading** (when ready):
```
OANDA_API_URL=https://api-fxpractice.oanda.com  (keep this for now)
```

### Step 3: Configure Trading Settings

Set these environment variables to control bot behavior:

```
BOT_MODE=manual              # Options: manual, semi-auto, full-auto
TRADING_CAPITAL=100          # Your account balance in USD
LEVERAGE=50                  # Leverage multiplier (50x is typical for forex)
TRADING_PAIRS=EUR/USD,GBP/USD,AUD/USD,USD/JPY,NZD/USD,XAU/USD
```

**Bot Modes Explained:**
- **manual**: Bot sends you SMS alerts for entry signals, you approve before trading
- **semi-auto**: Bot automatically executes first trade, asks for approval on additional trades
- **full-auto**: Bot trades automatically without approval (use with caution!)

### Step 4: Optional - Enable SMS Notifications

Add Twilio credentials to get SMS alerts:

```
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890      # Twilio number
USER_PHONE_NUMBER=+1234567890        # Your phone number
```

---

## Bot Trading Strategy

### MambafX Scalping Strategy

The bot uses the MambafX strategy which is optimized for quick, small profits:

**Entry Conditions:**
1. 15M chart shows clear trend (bullish or bearish)
2. 5M chart shows volume spike (20% above average)
3. Price breaks support/resistance with confirmation
4. Minimum 3 confirmations from technical indicators

**Exit Conditions:**
1. **Profit Target 1** (1:3 ratio): Close 50% of position
2. **Profit Target 2** (1:5 ratio): Close 25% of position
3. **Chop Exit**: Close remaining position after 10 minutes if market becomes choppy
4. **Stop Loss**: Close entire position if price hits stop-loss

**Position Sizing:**
- Risk: 1% of account per trade
- Position size: 25% of account capital
- Leverage: Up to 50x (configurable)

---

## Dashboard & Monitoring

### Access the Dashboard

Open your browser and go to:
```
https://mambafx-forex-bot-production.up.railway.app
```

### Dashboard Features

- **Bot Status**: Shows if bot is running
- **Account Balance**: Real-time balance from OANDA
- **Open Trades**: List of currently open positions
- **Trade History**: Past trades with P&L
- **Daily P&L**: Today's profit/loss
- **Strategy Logs**: Detailed logs of bot decisions

### Manual Trade Approval (Manual Mode)

When bot mode is set to **manual**:

1. Bot detects entry signal
2. You receive SMS notification with:
   - Trading pair (e.g., EUR/USD)
   - Direction (BUY or SELL)
   - Entry price
   - Stop-loss level
   - Risk/reward ratio

3. You can approve or reject the trade via dashboard

---

## Important Safety Guidelines

### ⚠️ Start Small

1. **Use practice account first**
   - Test with fake money
   - Verify bot behavior
   - Confirm OANDA integration works

2. **Start with small position sizes**
   - Set `TRADING_CAPITAL=100` (or less)
   - Use `BOT_MODE=manual` for approval
   - Monitor first 10-20 trades

3. **Increase gradually**
   - Once comfortable, increase capital
   - Switch to `semi-auto` mode
   - Finally consider `full-auto` (if desired)

### Daily Loss Limits

Bot automatically stops trading if daily loss exceeds:
- **Max Daily Loss**: 5% of account
- **Max Drawdown**: 15% of account

Example: If account is $100, bot stops trading if daily loss > $5

### Risk Management

- **Never use more than 50x leverage** (unless you know what you're doing)
- **Always use stop-loss** (bot does this automatically)
- **Monitor bot regularly** (check dashboard daily)
- **Don't trade during low-volume hours** (bot filters this)

---

## Troubleshooting

### Bot Not Trading

**Check:**
1. Is OANDA_API_TOKEN set correctly?
2. Is OANDA_ACCOUNT_ID set correctly?
3. Is account balance > 0?
4. Is BOT_MODE set to something other than manual (if you want auto-trading)?
5. Check bot logs for errors

### Trades Not Executing

**Possible causes:**
1. OANDA API credentials are wrong
2. Account has insufficient margin
3. Trading pair not available on OANDA
4. Market is closed (forex trades 24/5)

**Solution:** Check Railway logs for error messages

### Wrong Position Sizes

**Check:**
1. Is TRADING_CAPITAL set correctly?
2. Is LEVERAGE set correctly?
3. Account balance matches what OANDA shows

---

## API Endpoints

### Check Bot Status

```bash
curl https://mambafx-forex-bot-production.up.railway.app/api/status
```

Response:
```json
{
  "isRunning": true,
  "accountBalance": 150.25,
  "openTrades": 2,
  "dailyPnL": 12.50,
  "botMode": "manual",
  "tradingPairs": ["EUR/USD", "GBP/USD", "AUD/USD", "USD/JPY", "NZD/USD", "XAU/USD"]
}
```

### Get Open Trades

```bash
curl https://mambafx-forex-bot-production.up.railway.app/api/trades
```

### Get Trade History

```bash
curl https://mambafx-forex-bot-production.up.railway.app/api/trades/history
```

### Approve Manual Trade

```bash
curl -X POST https://mambafx-forex-bot-production.up.railway.app/api/trades/approve \
  -H "Content-Type: application/json" \
  -d '{"symbol": "EUR/USD"}'
```

---

## Next Steps: Learning & Improving

### Continue Learning MambafX

1. Attend live MambafX trading sessions
2. Take notes on new strategies
3. Share feedback with me for bot improvements

### Potential Improvements

- Add more trading pairs
- Implement different timeframes (1H, 4H)
- Add support for pending orders
- Implement trailing stop-loss
- Add performance analytics

### Questions?

If you have issues or questions:
1. Check the bot logs on Railway
2. Verify OANDA credentials
3. Test with practice account first
4. Contact me with error messages

---

## Quick Reference

### Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| OANDA_ACCOUNT_ID | 123456789 | Your OANDA account ID |
| OANDA_API_TOKEN | abc123xyz | Your OANDA API token |
| OANDA_API_URL | https://api-fxpractice.oanda.com | OANDA API endpoint |
| BOT_MODE | manual | Trading mode (manual/semi-auto/full-auto) |
| TRADING_CAPITAL | 100 | Account balance in USD |
| LEVERAGE | 50 | Leverage multiplier |
| TRADING_PAIRS | EUR/USD,GBP/USD | Comma-separated pairs |

### Trading Pairs Supported

- **Majors**: EUR/USD, GBP/USD, USD/JPY, AUD/USD, NZD/USD
- **Commodities**: XAU/USD (Gold)
- **Add more**: EUR/GBP, GBP/JPY, etc. (via TRADING_PAIRS env var)

### Strategy Settings (Hard-coded)

- Min Confirmations: 3
- Risk/Reward Ratio: 1:7
- Position Size: 25% of capital
- Stop Loss: 30 pips
- Profit Target 1: 1:3 ratio (close 50%)
- Profit Target 2: 1:5 ratio (close 25%)
- Chop Exit: After 10 minutes

---

## Support

For issues or questions, check:
1. Railway logs: https://railway.app (your project)
2. OANDA account status
3. API token validity
4. Network connectivity

Good luck with your trading! 🚀
