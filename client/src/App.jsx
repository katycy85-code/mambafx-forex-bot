import React, { useState, useEffect } from 'react';
import './index.css';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import ManualTrade from './pages/ManualTrade';
import CoveredCalls from './pages/CoveredCalls';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [botStatus, setBotStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchBotStatus = async () => {
    try {
      const response = await fetch('/api/bot/status');
      const data = await response.json();
      setBotStatus(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bot status:', error);
      setLoading(false);
    }
  };

  const startBot = async () => {
    try {
      const response = await fetch('/api/bot/start', { method: 'POST' });
      const data = await response.json();
      setBotStatus(data.status);
    } catch (error) {
      console.error('Error starting bot:', error);
    }
  };

  const stopBot = async () => {
    try {
      const response = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await response.json();
      setBotStatus(data.status);
    } catch (error) {
      console.error('Error stopping bot:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-white">Loading MambafX Bot...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold">🤖 MambafX Bot</div>
            <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
              botStatus?.isRunning 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {botStatus?.isRunning ? '🟢 RUNNING' : '🔴 STOPPED'}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-400">Account Balance</div>
              <div className="text-2xl font-bold text-green-400">
                ${botStatus?.accountBalance?.toFixed(2)}
              </div>
            </div>

            <button
              onClick={botStatus?.isRunning ? stopBot : startBot}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                botStatus?.isRunning
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {botStatus?.isRunning ? 'STOP BOT' : 'START BOT'}
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {[
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'trades', label: '💹 Trades' },
            { id: 'covered-calls', label: '📞 Covered Calls' },
            { id: 'manual', label: '✍️ Manual Trade' },
            { id: 'statistics', label: '📈 Statistics' },
            { id: 'settings', label: '⚙️ Settings' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`px-4 py-3 font-semibold transition-colors border-b-2 ${
                currentPage === item.id
                  ? 'border-green-500 text-green-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentPage === 'dashboard' && <Dashboard botStatus={botStatus} />}
        {currentPage === 'trades' && <Trades />}
        {currentPage === 'covered-calls' && <CoveredCalls />}
        {currentPage === 'manual' && <ManualTrade />}
        {currentPage === 'statistics' && <Statistics />}
        {currentPage === 'settings' && <Settings />}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-400">
          <p>MambafX Forex Scalping Bot Platform | Powered by MambafX Strategy</p>
          <p className="text-sm mt-2">⚠️ Trading involves risk. Past performance does not guarantee future results.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
