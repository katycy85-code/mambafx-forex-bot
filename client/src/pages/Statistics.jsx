import React, { useState, useEffect } from 'react';

export default function Statistics() {
  const [stats, setStats] = useState(null);
  const [dailySummary, setDailySummary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
    const interval = setInterval(fetchStatistics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatistics = async () => {
    try {
      const [statsRes, summaryRes] = await Promise.all([
        fetch('/api/statistics?days=30'),
        fetch('/api/daily-summary?days=30'),
      ]);

      const statsData = await statsRes.json();
      const summaryData = await summaryRes.json();

      setStats(statsData);
      setDailySummary(summaryData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching statistics:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading statistics...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Total Trades</div>
          <div className="text-3xl font-bold text-blue-400 mt-2">
            {stats?.totalTrades || 0}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Win Rate</div>
          <div className="text-3xl font-bold text-green-400 mt-2">
            {stats?.winRate || 0}%
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {stats?.wins || 0} wins / {stats?.losses || 0} losses
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Total P&L</div>
          <div className={`text-3xl font-bold mt-2 ${
            (stats?.totalPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            ${(stats?.totalPnL || 0).toFixed(2)}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Average P&L</div>
          <div className={`text-3xl font-bold mt-2 ${
            (stats?.avgPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            ${(stats?.avgPnL || 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Best and Worst Trades */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Best Trade</div>
          <div className="text-2xl font-bold text-green-400 mt-2">
            ${(stats?.bestTrade || 0).toFixed(2)}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <div className="text-gray-400 text-sm">Worst Trade</div>
          <div className="text-2xl font-bold text-red-400 mt-2">
            ${(stats?.worstTrade || 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Daily Summary */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-4">📅 Daily Summary</h2>

        {dailySummary.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            No daily summaries available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-right py-3 px-4">Opening</th>
                  <th className="text-right py-3 px-4">Closing</th>
                  <th className="text-right py-3 px-4">Daily P&L</th>
                  <th className="text-right py-3 px-4">P&L %</th>
                  <th className="text-right py-3 px-4">Trades</th>
                  <th className="text-right py-3 px-4">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {dailySummary.map(day => (
                  <tr key={day.date} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-3 px-4 font-semibold">{day.date}</td>
                    <td className="py-3 px-4 text-right">${day.openingBalance?.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">${day.closingBalance?.toFixed(2)}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      day.dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      ${day.dailyPnL?.toFixed(2)}
                    </td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      day.dailyPnLPercent >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {day.dailyPnLPercent?.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-right">{day.tradeCount}</td>
                    <td className="py-3 px-4 text-right">{day.winRate?.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
