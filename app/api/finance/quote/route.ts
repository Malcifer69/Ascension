/**
 * Stock quote — server-side so the Finnhub API key never reaches the browser.
 * Reads FINNHUB_API_KEY (.env.local locally, Vercel env in prod) and returns
 * only the latest price for one symbol. No key → { error: 'no_key' } so the
 * finance tile can tell the user to add a free one. The tile calls this through
 * the host bridge (window.Vitality.stock) — a sealed tile can't fetch.
 */
export async function GET(req: Request): Promise<Response> {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return Response.json({ error: 'no_key' })

  const symbol = (new URL(req.url).searchParams.get('symbol') || '').toUpperCase().trim()
  if (!symbol) return Response.json({ error: 'no_symbol' })

  try {
    const api =
      'https://finnhub.io/api/v1/quote?symbol=' +
      encodeURIComponent(symbol) +
      '&token=' +
      encodeURIComponent(key)
    const r = await fetch(api)
    const j = await r.json()
    const price = j?.c // Finnhub 'c' = current price; 0 means unknown/invalid symbol
    if (typeof price === 'number' && price > 0) return Response.json({ price })
    return Response.json({ error: 'not_found' })
  } catch {
    return Response.json({ error: 'fetch_failed' })
  }
}
