/**
 * MambafX History Sync Script
 * Pulls the latest 500 closed trades from OANDA and imports them into the bot's database
 */

import OandaAPI from './oanda-api.js';
import * as db from './db.js';

async function syncHistory() {
  console.log('🔄 Starting full OANDA history sync...');
  
  // Initialize database
  await db.initializeDatabase();

  const oandaAccountId = process.env.OANDA_ACCOUNT_ID || '001-001-17887452-001';
  const oandaApiToken = process.env.OANDA_API_TOKEN || 'd1613cf312d0d35c93db8b37f2a1d48f-4cae4dcbb78257d569421fcfb4046bd0';
  const oandaApiUrl = process.env.OANDA_API_URL || 'https://api-fxtrade.oanda.com';

  const oanda = new OandaAPI(oandaAccountId, oandaApiToken, oandaApiUrl);

  try {
    // Fetch the last 500 closed trades (OANDA limit is usually 500 per request)
    const closedTrades = await oanda.getRecentClosedTrades(500);
    console.log(`📊 Fetched ${closedTrades.length} closed trades from OANDA.`);

    let imported = 0;
    let skipped = 0;

    for (const ct of closedTrades) {
      try {
        // Save as a closed trade — ignore duplicates silently
        await db.saveClosedTrade({
          tradeId: `oanda-${ct.tradeId}`,
          symbol: ct.instrument,
          direction: ct.direction,
          entryPrice: ct.entryPrice,
          exitPrice: ct.exitPrice,
          stopLoss: 15, // Placeholder
          positionSize: ct.units,
          riskAmount: ct.units * 0.0001 * 15, // Placeholder
          profitLoss: ct.realizedPL,
          entryTime: ct.openTime ? new Date(ct.openTime).toISOString() : new Date().toISOString(),
          exitTime: ct.closeTime ? new Date(ct.closeTime).toISOString() : new Date().toISOString(),
        });
        imported++;
      } catch (err) {
        if (err.message?.includes('UNIQUE')) {
          skipped++;
        } else {
          console.error(`❌ Failed to import trade ${ct.tradeId}:`, err.message);
        }
      }
    }

    console.log(`✅ Sync complete!`);
    console.log(`📈 Imported: ${imported}`);
    console.log(`⏭️  Skipped (already in DB): ${skipped}`);

    // Update the bot's internal balance to match OANDA's NAV
    const accountDetails = await oanda.getAccountDetails();
    await db.saveBotSetting('accountBalance', accountDetails.balance);
    console.log(`💵 Dashboard balance calibrated to OANDA NAV: $${accountDetails.balance}`);

  } catch (error) {
    console.error('❌ Sync failed:', error.message);
  } finally {
    process.exit(0);
  }
}

syncHistory();
