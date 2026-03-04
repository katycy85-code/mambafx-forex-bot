# MambafX Bot - Quick Start Guide

## 5-Minute Setup

### 1. Get OANDA Credentials

1. Go to [OANDA](https://www.oanda.com)
2. Create a practice account (free)
3. Go to Account Settings → API Access
4. Create API token and note:
   - Account ID (e.g., `123456789`)
   - API Token (e.g., `abc123xyz`)

### 2. Configure on Railway

1. Go to your Railway project: https://railway.app
2. Click on your "mambafx-forex-bot" project
3. Go to Variables tab
4. Add these variables:

```
OANDA_ACCOUNT_ID = your_account_id
OANDA_API_TOKEN = your_api_token
OANDA_API_URL = https://api-fxpractice.oanda.com
BOT_MODE = manual
TRADING_CAPITAL = 100
```

5. Save and wait for redeploy (2-3 minutes)

### 3. Start Trading

1. Open dashboard: https://mambafx-forex-bot-production.up.railway.app
2. Bot will start analyzing markets
3. When it finds a trade setup, you'll get SMS (if configured) or see it on dashboard
4. Approve or reject trades

---

## What Happens Next

### Bot Workflow

```
1. Fetch 15M candles → Analyze trend bias
2. Fetch 5M candles → Look for volume spike
3. Detect entry signal → Check confirmations
4. Send SMS/notification → Wait for approval (manual mode)
5. Place trade on OANDA → Set TP/SL automatically
6. Monitor position → Close at profit target or stop-loss
```

### Example Trade

```
Signal: EUR/USD BUY
Entry: 1.0850
Stop Loss: 1.0820 (30 pips)
Target 1: 1.0920 (1:3 ratio) - Close 50%
Target 2: 1.0950 (1:5 ratio) - Close 25%
Risk: $1 (1% of $100 account)
```

---

## Bot Modes

### Manual Mode (Recommended for Beginners)

```
BOT_MODE = manual
```

- Bot detects signal
- Sends you SMS/notification
- You approve or reject
- **Best for**: Learning and testing

### Semi-Auto Mode

```
BOT_MODE = semi-auto
```

- First trade: Automatic
- Additional trades: Need approval
- **Best for**: Intermediate traders

### Full-Auto Mode

```
BOT_MODE = full-auto
```

- All trades: Automatic
- No approval needed
- **Use with caution!**

---

## Dashboard Features

### View Status
```
https://mambafx-forex-bot-production.up.railway.app
```

Shows:
- ✅ Bot running status
- 💵 Account balance (from OANDA)
- 📊 Open trades
- 📈 Daily P&L
- 🔔 Pending approvals

### Approve Trades
Click "Approve" button on pending trades

### View History
See all past trades with entry/exit prices and P&L

---

## Safety Checklist

- [ ] Using practice account (not real money)
- [ ] OANDA credentials are correct
- [ ] BOT_MODE is set to manual (for testing)
- [ ] TRADING_CAPITAL is small (e.g., $100)
- [ ] Dashboard is accessible
- [ ] SMS notifications working (optional)

---

## Common Issues

### Bot Not Trading

**Check:**
- Is OANDA_API_TOKEN set?
- Is account balance > $0?
- Is market open? (Forex trades 24/5)

**View logs:**
- Go to Railway → Logs tab
- Look for errors

### Wrong Position Size

**Check:**
- TRADING_CAPITAL is set correctly
- LEVERAGE is not too high
- Account balance on OANDA matches

### Trades Not Closing

**Check:**
- Are profit targets being hit?
- Is market moving in your direction?
- Check bot logs for errors

---

## Next Steps

1. ✅ Set up OANDA credentials
2. ✅ Configure Railway variables
3. ✅ Open dashboard and monitor
4. ✅ Approve first few trades manually
5. ✅ Review results after 24 hours
6. ✅ Adjust settings if needed
7. ✅ Consider switching to semi-auto or full-auto

---

## Support

- **Dashboard**: https://mambafx-forex-bot-production.up.railway.app
- **Railway Logs**: https://railway.app (your project)
- **OANDA Status**: https://www.oanda.com

---

## Pro Tips

1. **Start with manual mode** - Understand how bot works before automating
2. **Monitor first 10 trades** - Verify bot behavior is correct
3. **Use small position sizes** - Start with $100 trading capital
4. **Check logs daily** - Look for errors or warnings
5. **Keep OANDA credentials safe** - Don't share API token

---

Good luck! 🚀 Your bot is now live with real OANDA integration!
