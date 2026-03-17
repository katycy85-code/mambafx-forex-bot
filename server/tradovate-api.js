const fetch = require("node-fetch");

class TradovateAPI {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
    this.mdAccessToken = null;
    this.expirationTime = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.expirationTime && new Date() < new Date(this.expirationTime)) {
      return this.accessToken;
    }

    const body = {
      name: this.config.username,
      password: this.config.password,
      appId: "MambaFX Bot",
      appVersion: "1.0",
      cid: this.config.cid,
      sec: this.config.sec,
      deviceId: this.config.deviceId,
    };

    const response = await fetch(`${this.config.apiUrl}/v1/auth/accesstokenrequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (json.accessToken) {
      this.accessToken = json.accessToken;
      this.mdAccessToken = json.mdAccessToken;
      this.expirationTime = json.expirationTime;
      return this.accessToken;
    } else {
      throw new Error("Failed to get Tradovate access token");
    }
  }

  async getMarketData(symbol) {
    // Implementation for fetching market data will go here
  }

  async placeOrder(order) {
    // Implementation for placing an order will go here
  }
}

module.exports = TradovateAPI;
