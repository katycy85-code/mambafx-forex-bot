/**
 * News Calendar Module
 * Fetches high-impact economic events from ForexFactory's public calendar feed
 * Prevents trading 30 minutes before and after major news events
 *
 * Data source: https://nfs.faireconomy.media/ff_calendar_thisweek.json
 * (Free public ForexFactory calendar - no API key required)
 */

import fetch from 'node-fetch';

export class NewsCalendar {
  constructor() {
    this.cachedEvents = [];
    this.lastFetchTime = 0;
    this.cacheDuration = 3600000; // 1 hour cache

    // Currencies we trade - only block on news for these
    this.tradedCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
  }

  /**
   * Check if there's high-impact news in the blackout window for a given pair
   * @param {string} currencyPair - e.g. 'EUR/USD'
   * @param {number} blackoutMinutes - minutes before/after news to block (default 30)
   * @returns {{ active: boolean, event?: string, timeUntil?: number, reason?: string }}
   */
  async isNewsWindowActive(currencyPair = null, blackoutMinutes = 30) {
    const now = new Date();
    const events = await this.getUpcomingEvents();

    if (!events || events.length === 0) {
      return { active: false, reason: 'No events found' };
    }

    const blackoutMs = blackoutMinutes * 60 * 1000;

    for (const event of events) {
      const eventTime = new Date(event.timestamp);
      const timeDiff = eventTime.getTime() - now.getTime();

      // Check if event is within the blackout window (before OR after)
      if (timeDiff >= -blackoutMs && timeDiff <= blackoutMs) {
        // Check if event affects this currency pair
        if (currencyPair && !this.affectsPair(event, currencyPair)) {
          continue;
        }

        const minutesAway = Math.round(Math.abs(timeDiff) / 60000);
        const direction = timeDiff > 0 ? 'in' : 'ago';

        return {
          active: true,
          event: event.title,
          impact: event.impact,
          country: event.country,
          timeUntil: timeDiff,
          timestamp: event.timestamp,
          reason: `High-impact news: "${event.title}" (${event.country}) ${minutesAway}min ${direction}`,
        };
      }
    }

    return { active: false, reason: 'No high-impact news in blackout window' };
  }

  /**
   * Get upcoming high-impact events (cached for 1 hour)
   */
  async getUpcomingEvents() {
    const now = Date.now();

    // Return cached events if still fresh
    if (this.cachedEvents.length > 0 && (now - this.lastFetchTime) < this.cacheDuration) {
      return this.cachedEvents;
    }

    try {
      const events = await this.fetchForexFactoryCalendar();
      if (events && events.length > 0) {
        this.cachedEvents = events;
        this.lastFetchTime = now;
        console.log(`📅 News calendar updated: ${events.length} high-impact events loaded`);
        return events;
      }
    } catch (error) {
      console.error('Error fetching ForexFactory calendar:', error.message);
    }

    // If fetch failed but we have stale cache, use it
    if (this.cachedEvents.length > 0) {
      console.warn('⚠️  Using stale news calendar cache');
      return this.cachedEvents;
    }

    // Last resort: use built-in fallback schedule
    console.warn('⚠️  Using built-in fallback news schedule');
    return this.getFallbackCalendar();
  }

  /**
   * Fetch this week's high-impact events from ForexFactory public JSON feed
   */
  async fetchForexFactoryCalendar() {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MambafX-Bot/1.0',
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`ForexFactory calendar returned ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Unexpected ForexFactory response format');
    }

    // Filter to only HIGH impact events for currencies we trade
    const highImpact = data.filter(event => {
      if (event.impact !== 'High') return false;
      return this.tradedCurrencies.includes(event.country);
    });

    // Map to our internal format
    return highImpact.map(event => ({
      title: event.title,
      timestamp: event.date, // ISO 8601 with timezone offset
      country: event.country,
      impact: event.impact,
      forecast: event.forecast || null,
      previous: event.previous || null,
    }));
  }

  /**
   * Check if an event affects a specific currency pair
   */
  affectsPair(event, pair) {
    const pairUpper = pair.toUpperCase().replace('/', '');
    const currency = event.country; // ForexFactory uses currency codes directly (USD, EUR, etc.)
    return pairUpper.includes(currency);
  }

  /**
   * Fallback: Built-in recurring high-impact event schedule (UTC times)
   * Used only when ForexFactory feed is unavailable
   */
  getFallbackCalendar() {
    const now = new Date();
    const events = [];

    const majorEvents = [
      { name: 'US Non-Farm Payrolls',    country: 'USD', dayOfWeek: 5, hour: 13, minute: 30 },
      { name: 'US CPI',                  country: 'USD', dayOfWeek: 3, hour: 13, minute: 30 },
      { name: 'FOMC Rate Decision',      country: 'USD', dayOfWeek: 3, hour: 19, minute: 0  },
      { name: 'ECB Rate Decision',       country: 'EUR', dayOfWeek: 4, hour: 12, minute: 15 },
      { name: 'US GDP',                  country: 'USD', dayOfWeek: 4, hour: 13, minute: 30 },
      { name: 'US Retail Sales',         country: 'USD', dayOfWeek: 3, hour: 13, minute: 30 },
      { name: 'BOE Rate Decision',       country: 'GBP', dayOfWeek: 4, hour: 12, minute: 0  },
      { name: 'BOJ Rate Decision',       country: 'JPY', dayOfWeek: 2, hour: 3,  minute: 0  },
      { name: 'RBA Rate Decision',       country: 'AUD', dayOfWeek: 2, hour: 3,  minute: 30 },
      { name: 'US Unemployment Claims',  country: 'USD', dayOfWeek: 4, hour: 13, minute: 30 },
      { name: 'US ISM Manufacturing',    country: 'USD', dayOfWeek: 1, hour: 15, minute: 0  },
      { name: 'US ADP Employment',       country: 'USD', dayOfWeek: 3, hour: 13, minute: 15 },
    ];

    for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + dayOffset);
      const dayOfWeek = checkDate.getDay();

      for (const event of majorEvents) {
        if (event.dayOfWeek === dayOfWeek) {
          const eventDate = new Date(checkDate);
          eventDate.setUTCHours(event.hour, event.minute, 0, 0);
          events.push({
            title: event.name,
            timestamp: eventDate.toISOString(),
            country: event.country,
            impact: 'High',
          });
        }
      }
    }

    console.log(`📅 Fallback calendar: ${events.length} events for next 2 days`);
    return events;
  }

  /**
   * Get a summary of upcoming events (for logging/status)
   */
  async getUpcomingEventsSummary() {
    const events = await this.getUpcomingEvents();
    const now = Date.now();
    const next24h = events.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t > now && t < now + 24 * 60 * 60 * 1000;
    });
    return next24h.map(e => {
      const mins = Math.round((new Date(e.timestamp).getTime() - now) / 60000);
      return `${e.country} ${e.title} (in ${mins}min)`;
    });
  }
}
