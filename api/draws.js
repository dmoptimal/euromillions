/**
 * Proxy for the EuroMillions API.
 *
 * Cache-Control strategy:
 *   - s-maxage = seconds until the next time fresh draw results are available
 *     (Tuesday/Friday at ~20:30 UTC -- 15 min after the draw ends)
 *   - stale-while-revalidate = 60s so the CDN can serve instantly while revalidating
 *
 * The response also includes a `cache_until` ISO timestamp so the client-side
 * localStorage cache knows exactly when to expire too.
 */

const DRAW_DAYS = [2, 5]; // Tuesday=2, Friday=5
const RESULTS_HOUR_UTC = 20;
const RESULTS_MIN_UTC = 30;

function nextFreshResultsTime(from = new Date()) {
  for (let i = 0; i <= 8; i++) {
    const d = new Date(from);
    d.setUTCDate(from.getUTCDate() + i);
    d.setUTCHours(RESULTS_HOUR_UTC, RESULTS_MIN_UTC, 0, 0);
    if (DRAW_DAYS.includes(d.getUTCDay()) && d > from) {
      return d;
    }
  }
  // Fallback: 4 days from now
  return new Date(from.getTime() + 4 * 24 * 60 * 60 * 1000);
}

export default async function handler(req, res) {
  try {
    const response = await fetch(
      'https://euromillions.api.pedromealha.dev/v1/draws?page=1&per_page=5',
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`EuroMillions API responded with status ${response.status}`);
    }

    const data = await response.json();
    const cacheUntil = nextFreshResultsTime();
    const ttl = Math.max(300, Math.floor((cacheUntil - new Date()) / 1000));

    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=60`);
    res.status(200).json({ ...data, cache_until: cacheUntil.toISOString() });

  } catch (error) {
    console.error('EuroMillions proxy error:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: error.message });
  }
}
