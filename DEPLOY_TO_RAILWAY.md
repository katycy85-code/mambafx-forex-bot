# Deploy MambafX Bot to Railway - EASIEST WAY

## Step 1: Go to Railway Dashboard
https://railway.app/dashboard

## Step 2: Select Your Project
Click on your **"thorough-spirit"** project

## Step 3: Add Docker Service
1. Click **"New"** button
2. Select **"Docker Image"**
3. Use this image: `node:22-alpine`

## Step 4: Add Environment Variables
Click the **"Variables"** tab and add these:

```
NODE_ENV=production
PORT=3000
TWILIO_ACCOUNT_SID=US51086caee5617fb19454ad5bb228d18c
TWILIO_AUTH_TOKEN=df934059d3b2fec4c2eb0bbaf140acf3
TWILIO_PHONE_NUMBER=+18448210798
USER_PHONE_NUMBER=917-972-1327
OANDA_ACCOUNT_ID=001-001-17887452-001
OANDA_API_KEY=YOUR_OANDA_API_KEY_HERE
BOT_MODE=live
TRADING_CAPITAL=100
LEVERAGE=50
TRADING_PAIRS=EUR/USD,GBP/USD,AUD/USD
TRADING_TIMEFRAMES=15m,5m
TRADING_HOURS=NY_OPEN
POSITION_SIZE_PERCENT=25
RISK_PER_TRADE=1
```

## Step 5: Configure Build
1. Go to **"Settings"** tab
2. Set **Build Command**: `npm ci --only=production`
3. Set **Start Command**: `node server/index.js`

## Step 6: Deploy
Click **"Deploy"** button

## Step 7: Add OANDA API Key
After deployment:
1. Go back to Variables
2. Add your OANDA API Key
3. Bot will restart automatically

## That's It!
Your bot is now running 24/7 on Railway! 🚀

## Get Your Bot URL
In Railway dashboard, you'll see a URL like:
`https://mambafx-forex-bot-production.up.railway.app`

This is where your dashboard will be accessible!

## Monitor Your Bot
- Check logs in Railway dashboard
- You'll receive SMS alerts to 917-972-1327
- Dashboard shows all trades in real-time
