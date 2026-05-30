// Server-side AI proxy. Keeps DEEPSEEK_API_KEY off the client bundle.
// Used by both the Vite dev/preview middleware and serverless deploys
// (Vercel-style default export: handler(req, res)).
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body // pre-parsed (serverless)
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Method not allowed' }))
  }
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'AI proxy not configured' }))
  }
  try {
    const { model, messages, response_format } = await readBody(req)
    const upstream = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, response_format }),
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch (err) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: `AI proxy failed: ${err.message}` }))
  }
}
