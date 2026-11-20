// One Vercel serverless function for everything the Quant question bank needs from the server. The free (Hobby)
// plan caps how many functions a project can have, so features share this single route and are picked with `?action=`.
// The code for each action lives in api/_lib/ (the leading underscore keeps those files from becoming routes).
// Long-running actions (add: two AI solvers) get their time budget from the `functions` entry for this file in vercel.json.
//
//   POST /api/qb?action=sync       favourites + recently played, synced for a signed-in user      (_lib/qbSync.js)
//   POST /api/qb?action=usersync  everything else a signed-in user saves (favourites in every bank,   (_lib/userSync.js)
//                                 learned words, game history and bests, grammar mastery)
//   POST /api/qb?action=add        add a question: duplicate checks, AI solve + verify, publish   (_lib/qbAdd.js)
//   POST /api/qb?action=addquad    add a quadratic-equations question from its two equations: exact solver, no AI  (_lib/qbAddQuadratic.js)
//   POST /api/qb?action=ocr        read a screenshot of a question into text (nothing is stored)  (_lib/qbOcr.js)
//   POST /api/qb?action=options    suggest 5 answer options for a question typed without any       (_lib/qbOptions.js)
//   POST /api/qb?action=delete-start / delete   delete a question you added, after a small sum  (_lib/qbDelete.js)
//   GET  /api/qb?action=index     the list of questions people have added                       (_lib/qbRead.js)
//   GET  /api/qb?action=question   one added question in full                                    (_lib/qbRead.js)

import handleAdd from './_lib/qbAdd.js'
import handleAddQuadratic from './_lib/qbAddQuadratic.js'
import handleDelete from './_lib/qbDelete.js'
import handleOcr from './_lib/qbOcr.js'
import { handleSuggestOptions } from './_lib/qbOptions.js'
import { handleIndex, handleQuestion } from './_lib/qbRead.js'
import handleSync from './_lib/qbSync.js'
import handleUserSync from './_lib/userSync.js'

const ACTIONS = { sync: handleSync, usersync: handleUserSync, add: handleAdd, addquad: handleAddQuadratic, ocr: handleOcr, options: handleSuggestOptions, index: handleIndex, question: handleQuestion, 'delete-start': handleDelete, delete: handleDelete }

export default async function handler(req, res) {
  const action = typeof req.query?.action === 'string' ? req.query.action : ''
  const run = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null
  if (run) return run(req, res)
  res.setHeader('Cache-Control', 'no-store')
  res.status(404).json({ error: 'Unknown action.' })
}
