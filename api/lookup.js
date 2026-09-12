// Vercel serverless function (Node runtime). Keeps the Gemini API key server-side —
// it must never be shipped to the browser, unlike the public Firebase config.
//
// Set GEMINI_API_KEY in the Vercel project's Environment Variables (Settings -> Environment
// Variables), then redeploy. Get a free key at https://aistudio.google.com/apikey.
// Optionally set GEMINI_MODEL to override the default model.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const term = typeof req.query.term === 'string' ? req.query.term.trim() : ''
  if (!term || term.length > 200) {
    res.status(400).json({ error: 'Missing or invalid "term" query parameter.' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' })
    return
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
  const prompt = `You are a dictionary for a competitive-exam English study app. Define the English word, idiom, or phrase: "${term}".
Respond with ONLY a JSON object (no markdown fences, no extra text) in exactly this shape:
{"meaning": "a single clear one-sentence definition", "example": "one natural sentence that uses the exact phrase \\"${term}\\"", "partOfSpeech": "noun, verb, adjective, or adverb - or an empty string if it's an idiom or multi-word phrase with no single part of speech"}
If "${term}" is not a real, recognizable English word, idiom, or phrase, respond with exactly: {"error": "not found"}`

  let geminiRes
  try {
    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    })
  } catch {
    res.status(502).json({ error: 'Could not reach Gemini.' })
    return
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '')
    res.status(502).json({ error: `Gemini request failed (${geminiRes.status}).`, detail: detail.slice(0, 500) })
    return
  }

  const data = await geminiRes.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    res.status(502).json({ error: 'Gemini returned no content.' })
    return
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    res.status(502).json({ error: 'Gemini returned malformed JSON.' })
    return
  }

  if (parsed.error || typeof parsed.meaning !== 'string' || typeof parsed.example !== 'string' || !parsed.meaning || !parsed.example) {
    res.status(404).json({ error: 'not found' })
    return
  }

  res.status(200).json({
    meaning: parsed.meaning.slice(0, 500),
    example: parsed.example.slice(0, 500),
    partOfSpeech: typeof parsed.partOfSpeech === 'string' ? parsed.partOfSpeech.slice(0, 30) : '',
  })
}
