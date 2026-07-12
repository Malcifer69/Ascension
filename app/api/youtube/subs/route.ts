/**
 * YouTube subscriber lookup — server-side so the API KEY never reaches the
 * browser. TikTok is keyless (tikwm); YouTube is not, so this route reads
 * YOUTUBE_API_KEY from the environment (.env.local locally, Vercel env in
 * prod) and returns only a subscriber COUNT. No key set → { error: 'no_key' }
 * so the tile can tell the user to add one. The brand tile calls this through
 * the host bridge (window.Vitality.youtube) — a sealed tile can't fetch.
 */
export async function GET(req: Request): Promise<Response> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return Response.json({ error: 'no_key' })

  const handle = (new URL(req.url).searchParams.get('handle') || '').replace(/^@+/, '').trim()
  if (!handle) return Response.json({ error: 'no_handle' })

  try {
    const api =
      'https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=' +
      encodeURIComponent(handle) +
      '&key=' +
      encodeURIComponent(key)
    const r = await fetch(api)
    const j = await r.json()
    const stats = j?.items?.[0]?.statistics
    if (stats?.hiddenSubscriberCount) return Response.json({ error: 'hidden' })
    const n = stats?.subscriberCount != null ? Number(stats.subscriberCount) : null
    if (n != null && Number.isFinite(n)) return Response.json({ count: n })
    return Response.json({ error: 'not_found' })
  } catch {
    return Response.json({ error: 'fetch_failed' })
  }
}
