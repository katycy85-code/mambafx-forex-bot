import React, { useState, useEffect } from 'react';

export default function Trades() {
  const [trades, setTrades] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchTrades = async () => {
    try {
      let url = '/api/trades';
      if (filter === 'open') url = '/api/trades/open';
      if (filter === 'closed') url = '/api/trades/closed';

      const response = await fetch(url);
      const data = await response.json();
      setTrades(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching trades:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading trades...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filter Buttons */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'All Trades' },
          { id: 'open', label: 'Open' },
          { id: 'closed', label: 'Closed' },
        ].map(btn => (
          <button
            key={btn.id}
            onClick={() => setFilter(btn.id)}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filter === btn.id
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Trades Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        {trades.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No {filter} trades found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="text-left py-3 px-4">Symbol</th>
                  <th className="text-left py-3 px-4">Direction</th>
                  <th className="text-right py-3 px-4">Entry</th>
                  <th className="text-right py-3 px-4">Exit</th>
                  <th className="text-right py-3 px-4">Stop Loss</th>
                  <th className="text-right py-3 px-4">P&L</th>
                  <th className="text-right py-3 px-4">P&L %</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Entry Time</th>
                </tr>
              </thead>
              <tbody>
                {trades.map(trade => (
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
                    <td className="py-3 px-4 text-right">
                      {trade.exitPrice ? trade.exitPrice.toFixed(5) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">{trade.stopLoss?.toFixed(5)}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      trade.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      ${trade.profitLoss?.toFixed(2) || '-'}
                    </td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      trade.profitLossPercent >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {trade.profitLossPercent?.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        trade.status === 'OPEN'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">
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
    </div>
  );
}
