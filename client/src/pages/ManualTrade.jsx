import React, { useState } from 'react';

export default function ManualTrade() {
  const [formData, setFormData] = useState({
    symbol: '',
    direction: 'BULLISH',
    entryPrice: '',
    exitPrice: '',
    profitLoss: '',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/trades/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: formData.symbol,
          direction: formData.direction,
          entryPrice: parseFloat(formData.entryPrice),
          exitPrice: formData.exitPrice ? parseFloat(formData.exitPrice) : null,
          profitLoss: formData.profitLoss ? parseFloat(formData.profitLoss) : null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ Trade recorded: ${data.tradeId}`);
        setFormData({
          symbol: '',
          direction: 'BULLISH',
          entryPrice: '',
          exitPrice: '',
          profitLoss: '',
        });
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
        <h1 className="text-2xl font-bold mb-2">✍️ Manual Trade Entry</h1>
        <p className="text-gray-400 mb-6">Log your Robinhood or manual trades here for tracking and analysis</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Symbol */}
          <div>
            <label className="block text-sm font-semibold mb-2">Symbol *</label>
            <input
              type="text"
              name="symbol"
              value={formData.symbol}
              onChange={handleChange}
              placeholder="e.g., AAPL, SPY, QQQ"
              required
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Direction */}
          <div>
            <label className="block text-sm font-semibold mb-2">Direction *</label>
            <select
              name="direction"
              value={formData.direction}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
            >
              <option value="BULLISH">📈 BULLISH (BUY)</option>
              <option value="BEARISH">📉 BEARISH (SELL)</option>
            </select>
          </div>

          {/* Entry Price */}
          <div>
            <label className="block text-sm font-semibold mb-2">Entry Price *</label>
            <input
              type="number"
              name="entryPrice"
              value={formData.entryPrice}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              required
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Exit Price */}
          <div>
            <label className="block text-sm font-semibold mb-2">Exit Price (Optional)</label>
            <input
              type="number"
              name="exitPrice"
              value={formData.exitPrice}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Profit/Loss */}
          <div>
            <label className="block text-sm font-semibold mb-2">Profit/Loss (Optional)</label>
            <input
              type="number"
              name="profitLoss"
              value={formData.profitLoss}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
            <p className="text-sm text-gray-400 mt-1">Positive for profit, negative for loss</p>
          </div>

          {/* Message */}
          {message && (
            <div className={`p-4 rounded-lg text-sm font-semibold ${
              message.includes('✅')
                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                : 'bg-red-500/20 text-red-400 border border-red-500/50'
            }`}>
              {message}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Recording...' : '✅ Record Trade'}
          </button>
        </form>

        {/* Info Box */}
        <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h3 className="font-semibold text-blue-400 mb-2">💡 How to Use:</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Enter the symbol you traded (stock, option, etc.)</li>
            <li>• Select the direction (Buy/Sell)</li>
            <li>• Enter your entry price</li>
            <li>• If trade is closed, enter exit price and P&L</li>
            <li>• Click Record Trade to save to database</li>
            <li>• View all trades in the Trades tab</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
