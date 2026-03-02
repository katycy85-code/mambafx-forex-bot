import React, { useState, useEffect } from 'react';

export default function CoveredCalls() {
  const [positions, setPositions] = useState([]);
  const [stats, setStats] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    symbol: '',
    stockPrice: '',
    callStrike: '',
    callExpiration: '',
    callPremium: '',
    sharesQuantity: 100,
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [posRes, statsRes] = await Promise.all([
        fetch('/api/covered-calls/positions'),
        fetch('/api/covered-calls/portfolio/stats'),
      ]);

      const positions = await posRes.json();
      const stats = await statsRes.json();

      setPositions(positions);
      setStats(stats);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching covered calls data:', error);
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: isNaN(value) ? value : parseFloat(value),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/covered-calls/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({
          symbol: '',
          stockPrice: '',
          callStrike: '',
          callExpiration: '',
          callPremium: '',
          sharesQuantity: 100,
        });
        setShowForm(false);
        await fetchData();
      }
    } catch (error) {
      console.error('Error creating position:', error);
    }
  };

  const handleClosePosition = async (positionId) => {
    const exitStockPrice = prompt('Enter exit stock price:');
    const exitCallPrice = prompt('Enter exit call price:');

    if (!exitStockPrice || !exitCallPrice) return;

    try {
      const response = await fetch(`/api/covered-calls/positions/${positionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exitStockPrice: parseFloat(exitStockPrice),
          exitCallPrice: parseFloat(exitCallPrice),
        }),
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error closing position:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading covered calls...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Portfolio Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm">Total Capital Deployed</div>
            <div className="text-3xl font-bold text-blue-400 mt-2">
              ${stats.totalCapitalDeployed?.toFixed(2)}
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm">Open Positions</div>
            <div className="text-3xl font-bold text-green-400 mt-2">
              {stats.totalPositions}
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm">Monthly Income</div>
            <div className="text-3xl font-bold text-yellow-400 mt-2">
              ${stats.totalMonthlyIncome?.toFixed(2)}
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm">Monthly Return %</div>
            <div className="text-3xl font-bold text-purple-400 mt-2">
              {stats.totalMonthlyIncomePercent}%
            </div>
          </div>
        </div>
      )}

      {/* New Position Button */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
      >
        {showForm ? '✕ Cancel' : '+ New Covered Call Position'}
      </button>

      {/* New Position Form */}
      {showForm && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-bold mb-4">Create Covered Call Position</h2>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Symbol *</label>
              <input
                type="text"
                name="symbol"
                value={formData.symbol}
                onChange={handleFormChange}
                placeholder="e.g., QQQ, SPY"
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Stock Price *</label>
              <input
                type="number"
                name="stockPrice"
                value={formData.stockPrice}
                onChange={handleFormChange}
                placeholder="0.00"
                step="0.01"
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Call Strike *</label>
              <input
                type="number"
                name="callStrike"
                value={formData.callStrike}
                onChange={handleFormChange}
                placeholder="0.00"
                step="0.01"
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Expiration Date *</label>
              <input
                type="date"
                name="callExpiration"
                value={formData.callExpiration}
                onChange={handleFormChange}
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Call Premium *</label>
              <input
                type="number"
                name="callPremium"
                value={formData.callPremium}
                onChange={handleFormChange}
                placeholder="0.00"
                step="0.01"
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Shares Quantity</label>
              <input
                type="number"
                name="sharesQuantity"
                value={formData.sharesQuantity}
                onChange={handleFormChange}
                min="100"
                step="100"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
              />
            </div>

            <button
              type="submit"
              className="md:col-span-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              ✅ Create Position
            </button>
          </form>
        </div>
      )}

      {/* Positions Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold">📊 Covered Call Positions</h2>
        </div>

        {positions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No covered call positions yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="text-left py-3 px-4">Symbol</th>
                  <th className="text-right py-3 px-4">Stock Price</th>
                  <th className="text-right py-3 px-4">Call Strike</th>
                  <th className="text-right py-3 px-4">Premium</th>
                  <th className="text-right py-3 px-4">Weekly %</th>
                  <th className="text-right py-3 px-4">Monthly Income</th>
                  <th className="text-left py-3 px-4">Expiration</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-center py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(pos => (
                  <tr key={pos.positionId} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-3 px-4 font-semibold">{pos.symbol}</td>
                    <td className="py-3 px-4 text-right">${pos.entryStockPrice?.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">${pos.strikePrice?.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">${pos.entryCallPrice?.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-green-400 font-semibold">
                      {pos.weeklyReturn}%
                    </td>
                    <td className="py-3 px-4 text-right text-yellow-400 font-semibold">
                      ${pos.monthlyIncome}
                    </td>
                    <td className="py-3 px-4">{pos.expirationDate}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        pos.status === 'OPEN'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {pos.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {pos.status === 'OPEN' && (
                        <button
                          onClick={() => handleClosePosition(pos.positionId)}
                          className="text-red-400 hover:text-red-300 font-semibold"
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
        <h3 className="font-semibold text-blue-400 mb-3">💡 Covered Calls Strategy</h3>
        <ul className="text-sm text-gray-300 space-y-2">
          <li>• <strong>Own 100 shares</strong> of a stock (or multiple of 100)</li>
          <li>• <strong>Sell call options</strong> (OTM) to generate income</li>
          <li>• <strong>Target:</strong> 0.3-0.5% weekly income (1.5-2.5% monthly)</li>
          <li>• <strong>Strike selection:</strong> 5-10% OTM (out of the money)</li>
          <li>• <strong>Expiration:</strong> Weekly or monthly options</li>
          <li>• <strong>Best for:</strong> QQQ, SPY, IWM, and other liquid stocks</li>
        </ul>
      </div>
    </div>
  );
}
