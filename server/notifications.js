/**
 * SMS Notifications Service
 * Sends SMS alerts via Twilio
 */

import twilio from 'twilio';

export class NotificationService {
  constructor(accountSid, authToken, fromNumber) {
    // Validate credentials
    if (!accountSid || !authToken || !fromNumber) {
      console.error('Missing Twilio credentials:', {
        accountSid: accountSid ? 'provided' : 'MISSING',
        authToken: authToken ? 'provided' : 'MISSING',
        fromNumber: fromNumber ? 'provided' : 'MISSING',
      });
      throw new Error(`Twilio credentials missing: accountSid=${!!accountSid}, authToken=${!!authToken}, fromNumber=${!!fromNumber}`);
    }
    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
  }

  /**
   * Send trade opened notification
   */
  async notifyTradeOpened(toNumber, tradeData) {
    const message = `
🤖 TRADE OPENED
Symbol: ${tradeData.symbol}
Direction: ${tradeData.direction}
Entry: ${tradeData.entryPrice.toFixed(5)}
Stop Loss: ${tradeData.stopLoss.toFixed(5)}
Risk: ${tradeData.riskAmount.toFixed(2)} USD
Position: ${tradeData.positionSize.toFixed(2)} lots
Time: ${new Date().toLocaleString()}
    `.trim();

    return this.sendSMS(toNumber, message);
  }

  /**
   * Send trade closed notification
   */
  async notifyTradeClosed(toNumber, tradeData) {
    const profitLoss = tradeData.profitLoss;
    const profitLossPercent = ((profitLoss / tradeData.riskAmount) * 100).toFixed(2);
    const emoji = profitLoss >= 0 ? '✅' : '❌';

    const message = `
${emoji} TRADE CLOSED
Symbol: ${tradeData.symbol}
Direction: ${tradeData.direction}
Entry: ${tradeData.entryPrice.toFixed(5)}
Exit: ${tradeData.exitPrice.toFixed(5)}
Profit/Loss: ${profitLoss.toFixed(2)} USD (${profitLossPercent}%)
Time: ${new Date().toLocaleString()}
    `.trim();

    return this.sendSMS(toNumber, message);
  }

  /**
   * Send daily summary notification
   */
  async notifyDailySummary(toNumber, summaryData) {
    const dailyPnL = summaryData.dailyPnL;
    const dailyPnLPercent = ((dailyPnL / summaryData.accountBalance) * 100).toFixed(2);
    const emoji = dailyPnL >= 0 ? '📈' : '📉';

    const message = `
${emoji} DAILY SUMMARY
Account: ${summaryData.accountBalance.toFixed(2)} USD
Daily P&L: ${dailyPnL.toFixed(2)} USD (${dailyPnLPercent}%)
Trades: ${summaryData.tradeCount}
Wins: ${summaryData.wins}
Losses: ${summaryData.losses}
Win Rate: ${summaryData.winRate.toFixed(1)}%
Time: ${new Date().toLocaleString()}
    `.trim();

    return this.sendSMS(toNumber, message);
  }

  /**
   * Send entry signal notification (for manual approval)
   */
  async notifyEntrySignal(toNumber, signalData) {
    const message = `
🎯 ENTRY SIGNAL
Symbol: ${signalData.symbol}
Direction: ${signalData.direction}
Entry Price: ${signalData.entryPrice.toFixed(5)}
Stop Loss: ${signalData.stopLoss.toFixed(5)}
Risk/Reward: 1:${signalData.riskRewardRatio}
Confirmations: ${signalData.confirmationCount}/3
Action: APPROVE or SKIP
    `.trim();

    return this.sendSMS(toNumber, message);
  }

  /**
   * Send error notification
   */
  async notifyError(toNumber, errorData) {
    const message = `
⚠️ BOT ERROR
Symbol: ${errorData.symbol || 'N/A'}
Error: ${errorData.message}
Time: ${new Date().toLocaleString()}
Action: Check dashboard immediately
    `.trim();

    return this.sendSMS(toNumber, message);
  }

  /**
   * Send bot status notification
   */
  async notifyBotStatus(toNumber, statusData) {
    const status = statusData.isRunning ? '🟢 RUNNING' : '🔴 STOPPED';

    const message = `
${status}
Account Balance: ${statusData.accountBalance.toFixed(2)} USD
Open Positions: ${statusData.openPositions}
Daily P&L: ${statusData.dailyPnL.toFixed(2)} USD
Time: ${new Date().toLocaleString()}
    `.trim();

    return this.sendSMS(toNumber, message);
  }

  /**
   * Send generic SMS
   */
  async sendSMS(toNumber, message) {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: toNumber,
      });

      return {
        success: true,
        messageSid: result.sid,
        message,
      };
    } catch (error) {
      console.error('SMS Error:', error);
      return {
        success: false,
        error: error.message,
        message,
      };
    }
  }

  /**
   * Send multiple SMS (batch)
   */
  async sendBatch(toNumbers, message) {
    const results = [];

    for (const toNumber of toNumbers) {
      const result = await this.sendSMS(toNumber, message);
      results.push(result);
    }

    return results;
  }
}

export default NotificationService;
