import React, { useState, useEffect } from 'react';

export default function Dashboard({ botStatus }) {
  const [openTrades, setOpenTrades] = useState([]);
  const [accountHistory, setAccountHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [tradesRes, historyRes] = await Promise.all([
        fetch('/api/trades/open'),
        fetch('/api/account/history?hours=24'),
      ]);

      const trades = await tradesRes.json();
      const history = await historyRes.json();

      setOpenTrades(trades);
      setAccountHistory(history);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Account Balance</div>
          <div className="text-3xl font-bold text-green-400 mt-2">
            ${botStatus?.accountBalance?.toFixed(2)}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Open Positions</div>
          <div className="text-3xl font-bold text-blue-400 mt-2">
            {botStatus?.openTrades || 0}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Daily P&L</div>
          <div className={`text-3xl font-bold mt-2 ${
            (botStatus?.dailyPnL || accountHistory[0]?.dailyPnL || 0) >= 0
              ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {(botStatus?.dailyPnL || accountHistory[0]?.dailyPnL || 0) >= 0 ? '+' : ''}
            ${Math.abs(botStatus?.dailyPnL || accountHistory[0]?.dailyPnL || 0).toFixed(2)}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Bot Mode</div>
          <div className="text-2xl font-bold text-purple-400 mt-2">
            {botStatus?.botMode?.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Open Trades */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-4">📊 Open Trades ({openTrades.length})</h2>

        {openTrades.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No open trades
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="text-left py-3 px-4">Symbol</th>
                  <th className="text-left py-3 px-4">Direction</th>
                  <th className="text-right py-3 px-4">Entry Price</th>
                    <th className="text-right py-3 px-4">Trailing Stop</th>
                  <th className="text-right py-3 px-4">P&L</th>
                  <th className="text-right py-3 px-4">Risk</th>
                  <th className="text-left py-3 px-4">Entry Time (ET)</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map(trade => (
                  <tr key={trade.tradeId} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-3 px-4 font-semibold">{trade.symbol}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        (trade.direction === 'BULLISH' || trade.direction === 'BUY')
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.direction === 'BULLISH' ? 'BUY' : trade.direction === 'BEARISH' ? 'SELL' : trade.direction}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">{trade.entryPrice?.toFixed(5)}</td>
                    <td className="py-3 px-4 text-right text-gray-300">
                      {trade.stopLoss != null && trade.stopLoss < 100
                        ? `${trade.stopLoss} pips`
                        : '20 pips'}
                    </td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      trade.profitLoss == null ? 'text-gray-400' :
                      trade.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {trade.profitLoss != null
                        ? `${trade.profitLoss >= 0 ? '+' : ''}$${trade.profitLoss.toFixed(2)}`
                        : <span className="text-gray-500 text-xs">updating...</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-yellow-400">
                      ${trade.riskAmount?.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      {new Date(trade.entryTime).toLocaleString('en-US', {
                        timeZone: 'America/New_York',
                        month: 'numeric', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit', hour12: true
                      })} ET
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trading Pairs */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-4">🌍 Trading Pairs</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {botStatus?.tradingPairs?.map(pair => (
            <div key={pair} className="bg-gray-700 p-3 rounded text-center font-semibold">
              {pair}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-4">📝 Recent Activity</h2>
        <div className="text-center py-8 text-gray-400">
          Monitor bot activity here
        </div>
      </div>
    </div>
  );
}
