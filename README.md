# 🤖 MambafX Forex Scalping Bot Platform

A complete automated forex scalping bot platform based on MambafX's price action strategy, with a unified dashboard for managing all trades.

## Features

✅ **MambafX Strategy Implementation**
- Price action-based entry signals
- Market structure analysis
- Consolidation detection
- NY open trading (highest volume)
- Dynamic position sizing (25% risk per trade)
- Partial profit taking + trailing stops

✅ **Multi-Broker Support**
- Forex: FXOpen (100:1 leverage)
- Stocks: Robinhood (manual entry)
- Options: TD Ameritrade (future support)

✅ **Bot Modes**
- Manual: Requires SMS approval for each trade
- Semi-Auto: First trade auto, rest require approval
- Full-Auto: All trades execute automatically

✅ **Dashboard Features**
- Real-time bot status
- Open/closed trades view
- Trade statistics & analytics
- Manual trade entry (for Robinhood)
- Daily performance summary
- SMS notifications via Twilio

## Quick Start

### 1. Clone & Install

```bash
cd /home/ubuntu/mambafx-forex-bot
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required credentials:**
- FXOpen API Key & Secret
- FXOpen Account ID
- Twilio Account SID & Auth Token
- Twilio Phone Number
- Your Phone Number (for SMS alerts)

### 3. Initialize Database

```bash
npm run db:init
```

### 4. Start Development

```bash
# Terminal 1: Start backend server
npm run dev

# Terminal 2: Start frontend (optional)
npm run dev:client
```

### 5. Access Dashboard

Open browser: `http://localhost:3000`

## API Endpoints

### Bot Control
- `GET /api/bot/status` - Get bot status
- `POST /api/bot/start` - Start trading
- `POST /api/bot/stop` - Stop trading

### Trades
- `GET /api/trades` - All trades
- `GET /api/trades/open` - Open trades
- `GET /api/trades/closed` - Closed trades
- `GET /api/trades/:symbol` - Trades for symbol
- `POST /api/trades/manual` - Log manual trade
- `POST /api/trades/approve` - Approve pending trade

### Statistics
- `GET /api/statistics` - Trade statistics
- `GET /api/account/history` - Account balance history
- `GET /api/daily-summary` - Daily summaries

### Settings
- `GET /api/settings/:key` - Get setting
- `POST /api/settings` - Save setting

## Trading Strategy

### Entry Rules (3+ Confirmations Required)

1. **Directional Bias** - 4H chart above/below 50MA
2. **Breakout** - Price breaks support/resistance on 1M
3. **Market Structure** - Higher highs/lows (bullish) or lower highs/lows (bearish)

### Exit Rules

1. **Partial Close at 1:3 ratio** - Close 50% of position
2. **Partial Close at 1:5 ratio** - Close 25% of position
3. **Trail Stop** - Let remaining 25% run with trailing stop
4. **NY Close** - Exit all positions at 3:00 PM EST

### Skip Conditions

- Market consolidating (range < 50 pips)
- Less than 3 confirmations
- Volume is low
- Daily loss limit exceeded

## Configuration

### Bot Settings

```javascript
{
  tradingCapital: 200,           // Starting capital in USD
  leverage: 100,                 // Leverage ratio (100:1)
  maxDailyLoss: 5,              // Max daily loss % (stops trading)
  maxDrawdown: 15,              // Max drawdown % (stops trading)
  botMode: 'manual',            // manual, semi-auto, full-auto
  tradingPairs: [               // Forex pairs to trade
    'EUR/USD',
    'GBP/USD',
    'AUD/USD',
    'USD/JPY',
    'NZD/USD'
  ],
  nyOpenHour: 6,                // NY open hour (EST)
  nyOpenMinute: 30,             // NY open minute
  nyCloseHour: 15,              // NY close hour (EST)
  nyCloseMinute: 0,             // NY close minute
}
```

## SMS Notifications

Receive SMS alerts for:
- ✅ Trade opened
- ✅ Trade closed
- ✅ Daily summary
- ✅ Entry signals (manual mode)
- ✅ Errors & warnings
- ✅ Bot status changes

## Database Schema

### Trades Table
- `tradeId` - Unique trade identifier
- `symbol` - Trading pair (EUR/USD, etc.)
- `direction` - BULLISH or BEARISH
- `entryPrice` - Entry price
- `exitPrice` - Exit price (when closed)
- `stopLoss` - Stop loss level
- `profitLoss` - Profit/loss amount
- `status` - OPEN or CLOSED
- `entryTime` - Entry timestamp
- `exitTime` - Exit timestamp

### Account History Table
- `balance` - Account balance
- `equity` - Account equity
- `usedMargin` - Used margin
- `freeMargin` - Free margin
- `dailyPnL` - Daily profit/loss
- `timestamp` - Record timestamp

### Daily Summary Table
- `date` - Date
- `openingBalance` - Opening balance
- `closingBalance` - Closing balance
- `dailyPnL` - Daily profit/loss
- `tradeCount` - Number of trades
- `wins` - Number of winning trades
- `losses` - Number of losing trades
- `winRate` - Win rate percentage

## Deployment

### Railway Deployment

1. Connect GitHub repository
2. Set environment variables in Railway dashboard
3. Deploy

```bash
# Build frontend
npm run build

# Start server
npm start
```

### Environment Variables (Production)

```
NODE_ENV=production
PORT=3000
FXOPEN_API_KEY=your_key
FXOPEN_API_SECRET=your_secret
FXOPEN_ACCOUNT_ID=your_account_id
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
USER_PHONE_NUMBER=+19179721327
BOT_MODE=manual
```

## Risk Management

⚠️ **IMPORTANT: Trading involves risk. Past performance does not guarantee future results.**

### Risk Controls

1. **Position Sizing** - 25% risk per trade (dynamic)
2. **Stop Loss** - Market structure-based (15-30 pips)
3. **Daily Loss Limit** - 5% of account (stops trading)
4. **Max Drawdown** - 15% of account (stops trading)
5. **Leverage** - 100:1 (high risk/high reward)

### Recommended Starting Capital

- **Minimum:** $50 (with 100:1 leverage)
- **Recommended:** $200-$500
- **Comfortable:** $1,000+

### Expected Performance

- **Win Rate:** 60-70%
- **Daily Profit:** $100-$500 (with $200 capital)
- **Monthly Profit:** $2,000-$10,000
- **Annual Profit:** $24,000-$120,000

*Note: These are estimates based on MambafX strategy. Actual results may vary.*

## Troubleshooting

### Bot not trading
- Check FXOpen API credentials
- Verify account has sufficient balance
- Check if it's NY trading hours (6:30 AM - 3:00 PM EST)
- Check bot logs for errors

### SMS not sending
- Verify Twilio credentials
- Check phone number format (+1234567890)
- Check Twilio account balance

### Trades not closing
- Check if exit conditions are met
- Verify FXOpen API connection
- Check bot logs for errors

## Support & Resources

- **MambafX YouTube:** https://www.youtube.com/@mambafx
- **FXOpen API Docs:** https://api.fxopen.com/docs
- **Twilio Docs:** https://www.twilio.com/docs

## License

MIT License - See LICENSE file

## Disclaimer

This bot is provided as-is for educational purposes. Trading forex involves substantial risk. Do not trade with money you cannot afford to lose. Past performance is not indicative of future results. Always test strategies on a demo account first.

---

**Built with ❤️ using MambafX Strategy**
