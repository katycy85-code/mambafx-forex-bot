# Railway Deployment Setup Guide

## Environment Variables to Configure in Railway

After deploying to Railway, add these environment variables in the Railway dashboard:

### Required Variables

```
NODE_ENV=production
PORT=3000

# Twilio Configuration
TWILIO_ACCOUNT_SID=US51086caee5617fb19454ad5bb228d18c
TWILIO_AUTH_TOKEN=df934059d3b2fec4c2eb0bbaf140acf3
TWILIO_PHONE_NUMBER=+18448210798
USER_PHONE_NUMBER=917-972-1327

# OANDA Configuration
OANDA_ACCOUNT_ID=001-001-17887452-001
OANDA_API_KEY=<YOUR_OANDA_API_KEY_HERE>

# Bot Configuration
BOT_MODE=live
TRADING_CAPITAL=100
LEVERAGE=50
TRADING_PAIRS=EUR/USD,GBP/USD,AUD/USD
TRADING_TIMEFRAMES=15m,5m
TRADING_HOURS=NY_OPEN
POSITION_SIZE_PERCENT=25
RISK_PER_TRADE=1
```

## Steps to Deploy

1. Go to https://railway.app
2. Select your empty project
3. Click "New" → "GitHub Repo"
4. Connect this repository
5. Add environment variables in the Variables tab
6. Deploy!

## After Deployment

- Bot will start automatically
- You'll receive SMS alerts to 917-972-1327
- Dashboard available at: https://<your-railway-domain>
- Check logs in Railway dashboard for any errors

## Getting OANDA API Key

1. Log in to OANDA: https://www.oanda.com
2. Go to Account Settings
3. Find "API Access" or "API Tokens"
4. Generate new API key
5. Add to Railway environment variables

