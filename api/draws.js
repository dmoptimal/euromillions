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

async function fetchEurGbpRate() {
  try {
    const r = await fetch(
      'https://api.frankfurter.dev/v1/latest?from=EUR&to=GBP',
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const rate = j && j.rates && Number(j.rates.GBP);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const [drawsRes, gbpRate] = await Promise.all([
      fetch('https://euromillions.api.pedromealha.dev/v1/draws', {
        headers: { Accept: 'application/json' },
      }),
      fetchEurGbpRate(),
    ]);

    if (!drawsRes.ok) {
      throw new Error(`EuroMillions API responded with status ${drawsRes.status}`);
    }

    const data = await drawsRes.json();
    // Upstream returns either an array or an object map keyed by index, including
    // every draw since 2004 (~2MB). Slice to the most recent 5 before responding.
    const all = Array.isArray(data) ? data : Object.values(data);
    const draws = all
      .filter(d => d && d.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    const cacheUntil = nextFreshResultsTime();
    const ttl = Math.max(300, Math.floor((cacheUntil - new Date()) / 1000));

    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=60`);
    res.status(200).json({
      draws,
      gbp_rate: gbpRate, // null if FX lookup failed; client falls back to EUR
      cache_until: cacheUntil.toISOString(),
    });

  } catch (error) {
    console.error('EuroMillions proxy error:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: error.message });
  }
}
