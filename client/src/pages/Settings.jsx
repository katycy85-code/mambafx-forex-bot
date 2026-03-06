import React, { useState } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState({
    botMode: 'manual',
    maxDailyLoss: 5,
    maxDrawdown: 15,
    positionSizePercent: 25,
    trailingStopPips: 20,
    userPhoneNumber: '+19179721327',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: isNaN(value) ? value : parseFloat(value),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const responses = await Promise.all([
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'botMode', value: settings.botMode }),
        }),
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'maxDailyLoss', value: settings.maxDailyLoss, type: 'number' }),
        }),
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'maxDrawdown', value: settings.maxDrawdown, type: 'number' }),
        }),
      ]);

      const allSuccess = responses.every(r => r.ok);
      if (allSuccess) {
        setMessage('✅ Settings saved successfully');
      } else {
        setMessage('❌ Error saving settings');
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Bot Configuration */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
        <h2 className="text-2xl font-bold mb-6">⚙️ Bot Configuration</h2>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Bot Mode */}
          <div>
            <label className="block text-sm font-semibold mb-2">Bot Mode</label>
            <select
              name="botMode"
              value={settings.botMode}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
            >
              <option value="manual">🔔 Manual (Requires Approval)</option>
              <option value="semi-auto">🤖 Semi-Auto (1st Trade Auto)</option>
              <option value="full-auto">🚀 Full Auto (All Auto)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Manual: Get SMS alert, approve before trade. Semi-Auto: First trade executes automatically. Full-Auto: All trades execute automatically.
            </p>
          </div>

          {/* Max Daily Loss */}
          <div>
            <label className="block text-sm font-semibold mb-2">Max Daily Loss (%)</label>
            <input
              type="number"
              name="maxDailyLoss"
              value={settings.maxDailyLoss}
              onChange={handleChange}
              min="1"
              max="50"
              step="0.5"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Bot stops trading if daily loss exceeds this percentage of account balance
            </p>
          </div>

          {/* Max Drawdown */}
          <div>
            <label className="block text-sm font-semibold mb-2">Max Drawdown (%)</label>
            <input
              type="number"
              name="maxDrawdown"
              value={settings.maxDrawdown}
              onChange={handleChange}
              min="1"
              max="50"
              step="0.5"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Maximum allowed drawdown from account peak
            </p>
          </div>

          {/* Trailing Stop */}
          <div>
            <label className="block text-sm font-semibold mb-2">Trailing Stop Distance (pips)</label>
            <input
              type="number"
              name="trailingStopPips"
              value={settings.trailingStopPips}
              onChange={handleChange}
              min="10"
              max="50"
              step="1"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Distance the trailing stop follows behind price. 20 pips recommended — 10 pips is too tight and causes premature stop-outs.
            </p>
          </div>

          {/* Position Size */}
          <div>
            <label className="block text-sm font-semibold mb-2">Position Size (% of Account)</label>
            <input
              type="number"
              name="positionSizePercent"
              value={settings.positionSizePercent}
              onChange={handleChange}
              min="5"
              max="50"
              step="1"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Risk per trade as percentage of account balance (currently set to 25%)
            </p>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-semibold mb-2">Phone Number for SMS Alerts</label>
            <input
              type="tel"
              name="userPhoneNumber"
              value={settings.userPhoneNumber}
              onChange={handleChange}
              placeholder="+1234567890"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Format: +1 followed by 10-digit number (e.g., +19179721327)
            </p>
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

          {/* Save Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : '💾 Save Settings'}
          </button>
        </form>
      </div>

      {/* Information Box */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
        <h3 className="font-semibold text-blue-400 mb-3">ℹ️ Important Information</h3>
        <ul className="text-sm text-gray-300 space-y-2">
          <li>• <strong>Manual Mode:</strong> Recommended for beginners. You approve each trade.</li>
          <li>• <strong>Semi-Auto:</strong> First trade executes automatically, rest require approval.</li>
          <li>• <strong>Full Auto:</strong> All trades execute automatically. Use with caution!</li>
          <li>• <strong>Position Size:</strong> Currently set to 25% risk per trade (as per MambafX strategy)</li>
          <li>• <strong>SMS Alerts:</strong> Receive notifications for trades, errors, and daily summaries</li>
          <li>• <strong>Daily Loss Limit:</strong> Bot stops trading if daily loss exceeds threshold</li>
        </ul>
      </div>

      {/* API Configuration */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h3 className="font-semibold mb-3">🔑 API Configuration</h3>
        <p className="text-sm text-gray-400 mb-4">
          API keys are configured via environment variables. Do not share your keys!
        </p>
        <div className="bg-gray-700 p-4 rounded text-xs font-mono text-gray-300">
          <p>FXOPEN_API_KEY: ••••••••••••••••</p>
          <p>TWILIO_ACCOUNT_SID: ••••••••••••••••</p>
          <p>USER_PHONE_NUMBER: {settings.userPhoneNumber}</p>
        </div>
      </div>
    </div>
  );
}
