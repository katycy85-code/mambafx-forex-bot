# 🚀 Railway Deployment Guide

This guide walks you through deploying the MambafX Forex Bot to Railway.

## Prerequisites

1. **Railway Account** - Sign up at https://railway.app
2. **GitHub Account** - For connecting your repository
3. **Environment Variables** - API keys and credentials

## Step 1: Prepare Your Repository

### 1.1 Initialize Git (if not already done)

```bash
cd /home/ubuntu/mambafx-forex-bot
git init
git add .
git commit -m "Initial commit: MambafX Forex Bot"
```

### 1.2 Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository (e.g., `mambafx-forex-bot`)
3. Push your code:

```bash
git remote add origin https://github.com/YOUR_USERNAME/mambafx-forex-bot.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Railway

### 2.1 Connect Railway to GitHub

1. Go to https://railway.app/dashboard
2. Click **New Project**
3. Select **Deploy from GitHub**
4. Authorize Railway to access your GitHub account
5. Select your `mambafx-forex-bot` repository

### 2.2 Configure Environment Variables

After selecting your repository, Railway will show the **Environment** tab.

Add these environment variables:

```
NODE_ENV=production
PORT=3000

# FXOpen API (add after you get your credentials)
FXOPEN_API_KEY=your_key_here
FXOPEN_API_SECRET=your_secret_here
FXOPEN_ACCOUNT_ID=your_account_id_here

# Twilio (for SMS notifications)
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# User Phone Number
USER_PHONE_NUMBER=+19179721327

# Bot Configuration
BOT_MODE=manual
TRADING_CAPITAL=200
LEVERAGE=100
TRADING_PAIRS=EUR/USD,GBP/USD,AUD/USD,USD/JPY,NZD/USD
```

### 2.3 Deploy

1. Click **Deploy** button
2. Railway will build and deploy your app
3. Wait for deployment to complete (usually 2-5 minutes)
4. Get your live URL from the Railway dashboard

## Step 3: Add API Credentials Later

You can update environment variables anytime:

1. Go to your Railway project dashboard
2. Click **Variables**
3. Add or update the FXOpen API credentials
4. Railway will automatically redeploy with new variables

## Step 4: Monitor Your Deployment

### View Logs

```
Railway Dashboard → Your Project → Logs
```

### Check Status

```
https://your-railway-url/api/health
```

### Access Dashboard

```
https://your-railway-url
```

## Troubleshooting

### Build Fails

**Error:** `npm ERR! code ENOENT`

**Solution:** Make sure `package.json` exists and all dependencies are listed.

### App Crashes on Startup

**Error:** `Cannot find module`

**Solution:** 
1. Check that all dependencies are in `package.json`
2. Run `npm install` locally to verify
3. Commit and push changes
4. Railway will rebuild

### SMS Notifications Not Working

**Error:** Twilio errors in logs

**Solution:**
1. Verify Twilio credentials in Railway environment
2. Check phone number format: `+1234567890`
3. Ensure Twilio account has credits

### FXOpen Connection Fails

**Error:** `API connection timeout`

**Solution:**
1. Verify FXOpen API credentials
2. Check if FXOpen API is accessible from Railway IP
3. Try connecting from local machine first to verify credentials

## Database Persistence

Railway provides persistent storage. Your SQLite database will be stored at:

```
/app/data/bot.db
```

This persists across deployments.

## Custom Domain

To add a custom domain:

1. Go to Railway project settings
2. Click **Domains**
3. Add your custom domain
4. Update DNS records as instructed

## Scaling

To handle more traffic:

1. Go to **Deployments** tab
2. Increase **CPU** and **Memory**
3. Increase **Replicas** for load balancing

## Cost Estimation

Railway pricing (as of 2024):
- **Free tier:** $5 credit/month
- **Usage-based:** $0.000463/hour per GB RAM
- **Typical bot:** ~$10-20/month

## Updating Your Code

To update the bot:

1. Make changes locally
2. Commit and push to GitHub:

```bash
git add .
git commit -m "Update: your changes"
git push origin main
```

3. Railway automatically rebuilds and deploys

## Rollback

If something goes wrong:

1. Go to Railway dashboard
2. Click **Deployments**
3. Select previous deployment
4. Click **Rollback**

## Support

- Railway Docs: https://docs.railway.app
- Railway Support: https://railway.app/support
- MambafX Bot Issues: Check GitHub issues

---

**Your bot is now live on Railway!** 🎉

Access it at: `https://your-railway-url`
