import { NextResponse } from 'next/server';
import { fetchFxRates } from '@/lib/market/fx';

export const revalidate = 21600; // 6 hours

// Fallback used only when the FX provider is unreachable; flagged to the UI.
const FALLBACK = { USD: 0.75, EUR: 0.85 };

export async function GET() {
  try {
    const { rates, asOf } = await fetchFxRates();
    return NextResponse.json({ rates, asOf, source: 'ECB via Frankfurter', fallback: false });
  } catch {
    return NextResponse.json({ rates: FALLBACK, asOf: null, source: 'Built-in approximate rates', fallback: true });
  }
}
