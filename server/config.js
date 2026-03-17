export const botConfig = {
  botMode: 'full-auto', // 'signal-only' or 'full-auto'
  tradingCapital: 500, // Your starting capital
  leverage: 1, // Futures don't use leverage in the same way as Forex
  maxDailyLoss: 50, // Max loss in dollars
  maxDrawdown: 100, // Max drawdown in dollars
  tradingPairs: ['MNQ', 'MYM', 'MGC'], // Micro futures contracts
  // Session times in UTC
  nyOpenHour: 13, // 9:30 AM EST
  nyOpenMinute: 30,
  nyCloseHour: 17, // 1:30 PM EST
  asiaOpenHour: 0, // 8:00 PM EST
  asiaCloseHour: 2, // 10:00 PM EST
  newsFilterEnabled: false, // News filter is less relevant for futures
  trailingStopEnabled: true,
};
