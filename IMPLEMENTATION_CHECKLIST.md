# MambafX Bot - Implementation Checklist

## Phase 1: Deployment & Setup ✅

- [x] OANDA API integration implemented
- [x] Real-time candle fetching added
- [x] Real-time price updates added
- [x] Trade execution on OANDA implemented
- [x] Trade closing/management implemented
- [x] Account balance syncing added
- [x] node-fetch dependency added to package.json
- [x] Code pushed to GitHub
- [x] Railway auto-deployment triggered

## Phase 2: Testing (In Progress)

### Pre-Deployment Tests

- [ ] Verify Railway deployment successful
- [ ] Check bot logs for errors
- [ ] Confirm OANDA API connection working
- [ ] Test candle fetching for each trading pair
- [ ] Test price fetching for each trading pair

### Dashboard Tests

- [ ] Dashboard loads without errors
- [ ] Bot status shows as "running"
- [ ] Account balance displays correctly
- [ ] Can view open trades (if any)
- [ ] Can view trade history

### Strategy Tests

- [ ] Bot analyzes 15M candles for bias
- [ ] Bot analyzes 5M candles for entry signals
- [ ] Volume filter working correctly
- [ ] Chop detection working correctly
- [ ] Entry signals generated (or skip reasons logged)

### Trade Execution Tests (Manual Mode)

- [ ] Entry signal triggers notification
- [ ] Can approve trade via dashboard
- [ ] Trade placed on OANDA with correct units
- [ ] Stop-loss set correctly
- [ ] Take-profit targets set correctly
- [ ] Trade appears in open trades list

### Trade Management Tests

- [ ] Bot monitors open trades
- [ ] Profit targets close partial positions
- [ ] Stop-loss closes position if hit
- [ ] Chop exit closes position after 10 min
- [ ] Trade history updates correctly

### Account Tests

- [ ] Account balance updates from OANDA
- [ ] Daily P&L calculated correctly
- [ ] Daily loss limit enforced
- [ ] Margin calculations correct

## Phase 3: Safety Validation

- [ ] Using practice account (not real money)
- [ ] Position sizes are small
- [ ] Stop-losses are set on all trades
- [ ] Daily loss limits are enforced
- [ ] Manual mode is enabled for approval
- [ ] SMS notifications working (optional)
- [ ] Bot logs are accessible
- [ ] Error handling is working

## Phase 4: Production Readiness

- [ ] All tests passed
- [ ] No errors in bot logs
- [ ] Trades executing correctly
- [ ] Account balance syncing correctly
- [ ] Dashboard fully functional
- [ ] Documentation complete
- [ ] User trained on bot operation
- [ ] Emergency stop procedure documented

## Phase 5: Live Trading Preparation

- [ ] User understands bot modes
- [ ] User knows how to approve trades
- [ ] User knows how to stop bot
- [ ] User knows how to check logs
- [ ] User has OANDA account set up
- [ ] User has API credentials configured
- [ ] User has tested with practice account
- [ ] User is ready for live trading

---

## Testing Procedure

### Step 1: Verify Deployment

```bash
# Check if bot is running
curl https://mambafx-forex-bot-production.up.railway.app/api/status

# Expected response:
{
  "isRunning": true,
  "accountBalance": 150.25,
  "openTrades": 0,
  "dailyPnL": 0,
  "botMode": "manual",
  "tradingPairs": ["EUR/USD", "GBP/USD", "AUD/USD", "USD/JPY", "NZD/USD", "XAU/USD"]
}
```

### Step 2: Monitor Bot Logs

Go to Railway dashboard and check logs for:
- ✅ OANDA API initialized
- ✅ Database initialized
- ✅ Bot engine initialized
- ✅ Strategy configuration logged
- ❌ No error messages

### Step 3: Test Candle Fetching

Bot should log:
```
✅ OANDA API initialized
📊 Fetching candles for EUR/USD (15M, 50 candles)
📊 Fetching candles for EUR/USD (5M, 100 candles)
```

### Step 4: Test Entry Signals

Bot should log for each pair:
```
✅ Bias: BULLISH (15M chart)
✅ Volume filter: PASS (volume 25% above average)
✅ Entry signal: BUY at 1.0850
```

Or skip reasons:
```
⏭️ Skipping EUR/USD: Consolidation detected
⏭️ Skipping GBP/USD: Low volume
⏭️ Skipping AUD/USD: No clear bias
```

### Step 5: Test Trade Execution

When trade is approved:
```
✅ Trade placed on OANDA for EUR/USD: 100 units at 1.0850
📊 Stop Loss: 1.0820 (30 pips)
📊 Target 1: 1.0920 (1:3 ratio)
📊 Target 2: 1.0950 (1:5 ratio)
```

### Step 6: Test Trade Management

While trade is open:
```
📊 Checking open trades...
💰 EUR/USD: +15 pips (unrealized P&L: +$15)
```

When profit target hit:
```
✅ Partial close: EUR/USD at 1.0920 (50% position)
💰 Profit: +$50
```

---

## Common Issues & Solutions

### Issue: Bot Not Starting

**Logs show:** `Cannot find package 'node-fetch'`

**Solution:**
1. Check package.json has node-fetch dependency
2. Push to GitHub
3. Wait for Railway redeploy
4. Check logs again

### Issue: OANDA Connection Failed

**Logs show:** `Error fetching account details from OANDA`

**Solution:**
1. Verify OANDA_ACCOUNT_ID is correct
2. Verify OANDA_API_TOKEN is correct
3. Verify OANDA_API_URL is correct
4. Check OANDA account status (not locked/suspended)
5. Check internet connectivity

### Issue: No Entry Signals

**Logs show:** `Skipping all pairs: Consolidation detected`

**Solution:**
1. This is normal during low-volume periods
2. Bot will continue scanning
3. Check if market is open
4. Verify volume filter settings
5. Check if pairs have enough volume

### Issue: Wrong Position Sizes

**Logs show:** `Position size: 50 units (expected 100)`

**Solution:**
1. Check TRADING_CAPITAL is set correctly
2. Check LEVERAGE is set correctly
3. Verify account balance on OANDA
4. Check position sizing formula in code

### Issue: Trades Not Closing

**Logs show:** `Checking open trades... (no closes)`

**Solution:**
1. Check if profit targets are being hit
2. Verify price is moving in correct direction
3. Check if stop-loss was hit (trade should close)
4. Review trade history for closed trades
5. Check bot logs for error messages

---

## Success Criteria

### Bot is working correctly when:

1. ✅ Dashboard loads and shows correct status
2. ✅ Bot fetches real candles from OANDA
3. ✅ Bot analyzes charts and generates signals
4. ✅ Entry signals trigger notifications (or skip with reason)
5. ✅ Trades execute on OANDA with correct parameters
6. ✅ Trades close at profit targets or stop-loss
7. ✅ Account balance updates from OANDA
8. ✅ No errors in bot logs
9. ✅ Dashboard shows all trades correctly
10. ✅ User can approve/reject trades in manual mode

---

## Next Steps After Verification

1. **Monitor first 10 trades** - Verify bot behavior is correct
2. **Review P&L** - Check if strategy is profitable
3. **Adjust settings if needed** - Change position sizes, leverage, etc.
4. **Switch to semi-auto mode** - If comfortable with bot behavior
5. **Eventually full-auto mode** - When confident in strategy
6. **Add new strategies** - As you learn from MambafX sessions

---

## Documentation Files

- **QUICK_START.md** - 5-minute setup guide
- **OANDA_INTEGRATION_GUIDE.md** - Detailed integration guide
- **IMPLEMENTATION_CHECKLIST.md** - This file
- **README.md** - General project information

---

## Contact & Support

If you encounter issues:

1. Check bot logs on Railway
2. Verify OANDA credentials
3. Test with practice account
4. Review this checklist
5. Contact support with error messages

Good luck! 🚀
