/**
 * Estimated next-draw jackpot, scraped from euro-millions.com.
 *
 * The site renders e.g. <... class="jackpot">&pound;34 Million<...> in the
 * server-rendered HTML, preceded by "Friday's estimated EuroMillions jackpot:"
 * (or Tuesday's). We pull both and return a small JSON payload with the same
 * cache_until contract as /api/draws.
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
  return new Date(from.getTime() + 4 * 24 * 60 * 60 * 1000);
}

function decodeEntities(s) {
  return s
    .replace(/&pound;/gi, '£')
    .replace(/&euro;/gi, '€')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
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

// "€40 Million" -> {n: 40, unit: 'Million'}
function parseAmount(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(Million|Billion)?/i);
  if (!m) return null;
  return { n: Number(m[1]), unit: m[2] || '' };
}

export default async function handler(req, res) {
  try {
    const response = await fetch('https://www.euro-millions.com/', {
      headers: {
        'Accept': 'text/html',
        'User-Agent':
          'Mozilla/5.0 (compatible; EuroMillionsPWA/1.0; +https://euromillions-nu.vercel.app)',
      },
    });

    if (!response.ok) {
      throw new Error(`euro-millions.com responded with status ${response.status}`);
    }

    const html = await response.text();

    // Prefer a £ figure if the source served one to us; otherwise convert EUR->GBP
    // using the live frankfurter.dev rate. (euro-millions.com geo-localises currency
    // by request IP — Vercel's region usually sees €, the user wants £.)
    const allJackpots = [...html.matchAll(/class="jackpot"[^>]*>([^<]+)</gi)]
      .map(m => decodeEntities(m[1]).trim())
      .filter(Boolean);
    if (!allJackpots.length) {
      throw new Error('Could not find jackpot figure in source HTML');
    }
    const gbpDirect = allJackpots.find(s => s.includes('£'));
    let amount = gbpDirect || allJackpots[0];

    if (!gbpDirect && amount.includes('€')) {
      const parsed = parseAmount(amount);
      const rate = await fetchEurGbpRate();
      if (parsed && rate) {
        const gbp = parsed.n * rate;
        // Round headline to nearest whole million for legibility (matches the
        // site convention).
        const rounded = parsed.unit ? Math.round(gbp) : Math.round(gbp);
        amount = `£${rounded}${parsed.unit ? ' ' + parsed.unit : ''}`;
      }
    }

    // "Friday's estimated EuroMillions jackpot" or "Tuesday's ..."
    const dayMatch = html.match(/(Tuesday|Friday)'s estimated EuroMillions jackpot/i);
    const day = dayMatch ? dayMatch[1] : null;

    const cacheUntil = nextFreshResultsTime();
    const ttl = Math.max(300, Math.floor((cacheUntil - new Date()) / 1000));

    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=60`);
    res.status(200).json({
      amount,
      day,
      source: 'euro-millions.com',
      cache_until: cacheUntil.toISOString(),
    });
  } catch (error) {
    console.error('Jackpot proxy error:', error.message);
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: error.message });
  }
}
