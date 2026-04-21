/**
 * CORS for the AA2000 portal (Vercel + local dev) calling your API on another host
 * (e.g. Tailscale *.ts.net). Browsers send a preflight OPTIONS when the request uses
 * custom headers like `X-Session-Id` — your server must allow that header explicitly.
 *
 *   npm install cors
 *
 * Use early in your Express app (before routes):
 *
 *   const { applyPortalCors } = require('./cors-for-portal')
 *   applyPortalCors(app)
 */

/**
 * @param {import('express').Express} app
 * @param {{ extraOrigins?: string[] }} [opts]
 */
function applyPortalCors(app, opts = {}) {
  let cors
  try {
    cors = require('cors')
  } catch {
    console.error('[cors-for-portal] Install dependency: npm install cors')
    throw new Error('Missing npm package "cors"')
  }

  const defaultOrigins = [
    'https://aa2000portal.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
  ]
  const allowList = new Set([...defaultOrigins, ...(opts.extraOrigins ?? [])])

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true)
        if (allowList.has(origin)) return cb(null, true)
        return cb(null, false)
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      optionsSuccessStatus: 204,
    })
  )
}

module.exports = { applyPortalCors }

/*
 * Manual alternative (no `cors` package) — run before your routes:
 *
 * app.use((req, res, next) => {
 *   const origin = req.headers.origin
 *   const allowed = ['https://aa2000portal.vercel.app', 'http://localhost:5173', 'http://localhost:5174']
 *   if (origin && allowed.includes(origin)) {
 *     res.setHeader('Access-Control-Allow-Origin', origin)
 *     res.setHeader('Access-Control-Allow-Credentials', 'true')
 *   }
 *   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id')
 *   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
 *   if (req.method === 'OPTIONS') return res.sendStatus(204)
 *   next()
 * })
 */
