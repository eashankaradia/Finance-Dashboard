// Market data service — isolated from the rest of the app.
// Swap the provider class below without touching any other file.
//
// Future providers to implement:
//   Twelve Data  — https://twelvedata.com      (VITE_TWELVE_DATA_KEY)
//   Alpha Vantage — https://alphavantage.co    (VITE_ALPHA_VANTAGE_KEY)
//   Finnhub      — https://finnhub.io          (VITE_FINNHUB_KEY)
//   Polygon      — https://polygon.io          (VITE_POLYGON_KEY)

import { MarketQuote } from '../types';

interface MarketDataProvider {
  getQuote(ticker: string): Promise<MarketQuote | null>;
}

// --- Mock provider ---
// Returns static prices. Replace with a real provider when you have an API key.
class MockMarketDataProvider implements MarketDataProvider {
  private static prices: Record<string, { price: number; change: number; changePercent: number }> = {
    LLOY: { price: 0.5724, change: 0.0034, changePercent: 0.6 },
  };

  async getQuote(ticker: string): Promise<MarketQuote | null> {
    const data = MockMarketDataProvider.prices[ticker.toUpperCase()];
    if (!data) return null;
    return {
      ticker: ticker.toUpperCase(),
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      lastUpdated: new Date().toISOString(),
    };
  }
}

// --- Example: Twelve Data provider ---
// Uncomment and set VITE_TWELVE_DATA_KEY in .env to use real prices.
//
// class TwelveDataProvider implements MarketDataProvider {
//   private apiKey = import.meta.env.VITE_TWELVE_DATA_KEY as string;
//   async getQuote(ticker: string): Promise<MarketQuote | null> {
//     const res = await fetch(
//       `https://api.twelvedata.com/quote?symbol=${ticker}&apikey=${this.apiKey}`
//     );
//     const d = await res.json();
//     if (d.status === 'error') return null;
//     return {
//       ticker,
//       price: parseFloat(d.close),
//       change: parseFloat(d.change),
//       changePercent: parseFloat(d.percent_change),
//       lastUpdated: new Date().toISOString(),
//     };
//   }
// }

const provider: MarketDataProvider = new MockMarketDataProvider();

export const marketDataService = {
  async getQuote(ticker: string): Promise<MarketQuote | null> {
    try {
      return await provider.getQuote(ticker);
    } catch {
      // Market data failures must not break the app
      return null;
    }
  },

  async getQuotes(tickers: string[]): Promise<Record<string, MarketQuote>> {
    const results: Record<string, MarketQuote> = {};
    await Promise.allSettled(
      tickers.map(async (ticker) => {
        const quote = await this.getQuote(ticker);
        if (quote) results[ticker] = quote;
      })
    );
    return results;
  },
};
