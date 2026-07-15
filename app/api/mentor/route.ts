/**
 * AI mentor — server-side proxy to the Anthropic Messages API.
 *
 * The browser (the mentor chat, the Finance tile's screenshot import) posts a
 * Messages API body here; this route adds the API key and forwards it. The key
 * resolves in order:
 *   1. ANTHROPIC_API_KEY from the environment (.env.local locally, Vercel env
 *      in prod) — preferred: the key never exists in the browser at all.
 *   2. The `x-user-key` header — a key the user pasted into the dashboard's
 *      settings, held in THEIR browser's localStorage (never in a tile store,
 *      never synced to Supabase, never in git). Lets the deployed site work
 *      from a phone without touching env vars.
 * Neither is ever echoed back or logged.
 *
 * GET reports only whether a server-side key is configured, so the UI knows
 * whether to ask the user for one.
 */
export async function GET(): Promise<Response> {
  return Response.json({ env: !!process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: Request): Promise<Response> {
  const key = process.env.ANTHROPIC_API_KEY || req.headers.get('x-user-key') || ''
  if (!key.trim()) return Response.json({ error: 'no_key' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 })
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    return Response.json(data, { status: r.status })
  } catch {
    return Response.json({ error: 'fetch_failed' }, { status: 502 })
  }
}
