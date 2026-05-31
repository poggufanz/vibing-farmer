// Server-side AI proxy. Keeps DEEPSEEK_API_KEY off the client bundle.
// Used by both the Vite dev/preview middleware and serverless deploys
// (Vercel-style default export: handler(req, res)).
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  // Add your Vercel domain after deploy:
  // 'https://yield-vibing.vercel.app',
  ...(process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim()) : []),
].filter(Boolean)

const ALLOWED_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash',
]

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

  // 1. CORS origin allowlist check
  const origin = req.headers.origin || ''
  if (!ALLOWED_ORIGINS.includes(origin)) {
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Forbidden' }))
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: 'AI proxy not configured' }))
  }
  try {
    const { model, messages, response_format } = await readBody(req)

    // 2. Model allowlist check
    if (!ALLOWED_MODELS.includes(model)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ error: 'Model not allowed' }))
    }

    // 3. Message validation (length cap and format validation to prevent injection)
    if (!Array.isArray(messages) || messages.length > 10) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ error: 'Invalid messages' }))
    }
    for (const msg of messages) {
      if (typeof msg.content === 'string' && msg.content.length > 100000) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ error: 'Message too long' }))
      }
    }

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

