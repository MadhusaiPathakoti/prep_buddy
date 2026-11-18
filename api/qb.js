// One Vercel serverless function for everything the Quant question bank needs from the server. The free (Hobby)
// plan caps how many functions a project can have, so features share this single route and are picked with `?action=`.
// The code for each action lives in api/_lib/ (the leading underscore keeps those files from becoming routes).
//
//   POST /api/qb?action=sync   favourites + recently played, synced for a signed-in user (see _lib/qbSync.js)

import handleSync from './_lib/qbSync.js'

export default async function handler(req, res) {
  const action = typeof req.query?.action === 'string' ? req.query.action : ''
  if (action === 'sync') return handleSync(req, res)
  res.setHeader('Cache-Control', 'no-store')
  res.status(404).json({ error: 'Unknown action.' })
}
