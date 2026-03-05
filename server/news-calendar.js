/**
 * News Calendar Module
 * Fetches high-impact economic events from OANDA
 * Prevents trading 30 minutes before and after major news
 */

import fetch from 'node-fetch';

export class NewsCalendar {
  constructor(oandaApi) {
    this.oandaApi = oandaApi;
    this.cachedEvents = [];
    this.lastFetchTime = 0;
    this.cacheDuration = 3600000; // 1 hour cache
    
    // High-impact news keywords
    this.highImpactKeywords = [
      'NFP',
      'Non-Farm Payroll',
      'CPI',
      'Consumer Price Index',
      'Fed',
      'Federal Reserve',
      'Interest Rate',
      'FOMC',
      'ECB',
      'European Central Bank',
      'GDP',
      'Gross Domestic Product',
      'Unemployment',
      'Inflation',
      'Retail Sales',
      'ISM',
      'Manufacturing',
      'Services',
      'PMI',
      'Purchasing Managers',
    ];
  }

  /**
   * Check if there's high-impact news in the next 30 minutes
   */
  async isNewsWindowActive(currencyPair = null) {
    const now = new Date();
    const events = await this.getUpcomingEvents();
    
    if (!events || events.length === 0) {
      return { active: false, reason: 'No events found' };
    }

    for (const event of events) {
      const eventTime = new Date(event.timestamp);
      const timeDiff = eventTime.getTime() - now.getTime();
      
      // Check if event is within 30 min before or after
      const thirtyMinMs = 30 * 60 * 1000;
      
      if (timeDiff >= -thirtyMinMs && timeDiff <= thirtyMinMs) {
        // Check if event affects this currency pair
        if (currencyPair && !this.affectsPair(event, currencyPair)) {
          continue;
        }
        
        return {
          active: true,
          event: event.title,
          impact: event.impact,
          timeUntil: timeDiff,
          timestamp: event.timestamp,
          reason: `High-impact news: ${event.title}`,
        };
      }
    }

    return { active: false, reason: 'No high-impact news in next 30 min' };
  }

  /**
   * Get upcoming high-impact events
   */
  async getUpcomingEvents() {
    const now = Date.now();
    
    // Return cached events if still fresh
    if (this.cachedEvents.length > 0 && (now - this.lastFetchTime) < this.cacheDuration) {
      return this.cachedEvents;
    }

    try {
      // Try to fetch from OANDA economic calendar
      const events = await this.fetchOandaCalendar();
      
      if (events && events.length > 0) {
        this.cachedEvents = events;
        this.lastFetchTime = now;
        return events;
      }
    } catch (error) {
      console.error('Error fetching OANDA calendar:', error.message);
    }

    // Fallback: return empty array (no news data available)
    return [];
  }

  /**
   * Fetch economic calendar from OANDA
   */
  async fetchOandaCalendar() {
    try {
      // OANDA doesn't have a direct economic calendar API
      // This is a placeholder for when/if they add it
      // For now, we'll use a fallback approach
      
      console.log('📅 Attempting to fetch OANDA economic calendar...');
      
      // Placeholder: OANDA economic calendar endpoint (if available)
      const response = await fetch('https://api-fxtrade.oanda.com/v3/economics/calendar', {
        headers: {
          'Authorization': `Bearer ${this.oandaApi.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`Calendar API returned ${response.status} - using fallback`);
        return this.getFallbackCalendar();
      }

      const data = await response.json();
      return this.parseCalendarEvents(data);
    } catch (error) {
      console.error('Calendar fetch failed:', error.message);
      return this.getFallbackCalendar();
    }
  }

  /**
   * Fallback: Use known high-impact news schedule based on common recurring events
   * Returns events that are scheduled for today/tomorrow based on day-of-week patterns
   */
  getFallbackCalendar() {
    const now = new Date();
    const events = [];

    // Major recurring events (times in UTC)
    // These are approximate - the real calendar should be used in production
    const majorEvents = [
      { name: 'US Non-Farm Payrolls', country: 'US', dayOfWeek: 5, hour: 13, minute: 30, impact: 'HIGH' },
      { name: 'US CPI', country: 'US', dayOfWeek: 3, hour: 13, minute: 30, impact: 'HIGH' },
      { name: 'FOMC Rate Decision', country: 'US', dayOfWeek: 3, hour: 19, minute: 0, impact: 'HIGH' },
      { name: 'ECB Rate Decision', country: 'EU', dayOfWeek: 4, hour: 12, minute: 15, impact: 'HIGH' },
      { name: 'US GDP', country: 'US', dayOfWeek: 4, hour: 13, minute: 30, impact: 'HIGH' },
      { name: 'US Retail Sales', country: 'US', dayOfWeek: 3, hour: 13, minute: 30, impact: 'HIGH' },
      { name: 'BOE Rate Decision', country: 'GB', dayOfWeek: 4, hour: 12, minute: 0, impact: 'HIGH' },
      { name: 'BOJ Rate Decision', country: 'JP', dayOfWeek: 2, hour: 3, minute: 0, impact: 'HIGH' },
    ];

    // Generate events for today and the next 2 days
    for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + dayOffset);
      const dayOfWeek = checkDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

      for (const event of majorEvents) {
        if (event.dayOfWeek === dayOfWeek) {
          const eventDate = new Date(checkDate);
          eventDate.setUTCHours(event.hour, event.minute, 0, 0);
          events.push({
            title: event.name,
            timestamp: eventDate.toISOString(),
            country: event.country,
            impact: event.impact,
          });
        }
      }
    }

    console.log(`📅 Fallback calendar: ${events.length} events found for next 2 days`);
    return events;
  }

  /**
   * Parse calendar events from API response
   */
  parseCalendarEvents(data) {
    if (!data || !data.events) return [];

    return data.events
      .filter(event => this.isHighImpact(event))
      .map(event => ({
        title: event.title,
        timestamp: event.timestamp,
        country: event.country,
        impact: event.impact,
        forecast: event.forecast,
        previous: event.previous,
      }));
  }

  /**
   * Check if event is high-impact
   */
  isHighImpact(event) {
    if (event.impact !== 'HIGH') return false;

    // Check if title contains high-impact keywords
    const title = event.title.toUpperCase();
    return this.highImpactKeywords.some(keyword => title.includes(keyword.toUpperCase()));
  }

  /**
   * Check if event affects a specific currency pair
   */
  affectsPair(event, pair) {
    const pairUpper = pair.toUpperCase();
    const countryCode = event.country;

    // Map country codes to currencies
    const countryToCurrency = {
      'US': 'USD',
      'EU': 'EUR',
      'GB': 'GBP',
      'JP': 'JPY',
      'AU': 'AUD',
      'NZ': 'NZD',
      'CA': 'CAD',
    };

    const currency = countryToCurrency[countryCode];
    if (!currency) return false;

    return pairUpper.includes(currency);
  }

  /**
   * Get time until next high-impact event
   */
  async getTimeToNextEvent() {
    const events = await this.getUpcomingEvents();
    if (events.length === 0) return null;

    const now = Date.now();
    const nextEvent = events[0];
    const eventTime = new Date(nextEvent.timestamp).getTime();
    
    return {
      event: nextEvent.title,
      timeMs: eventTime - now,
      timestamp: nextEvent.timestamp,
    };
  }

  /**
   * Format time difference for logging
   */
  formatTimeDiff(ms) {
    const minutes = Math.floor(Math.abs(ms) / 60000);
    const direction = ms < 0 ? 'ago' : 'in';
    return `${minutes} min ${direction}`;
  }
}
