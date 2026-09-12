# PrepBuddy

A practice web app for competitive exam aspirants. Each module contains small games designed to build calculation speed and accuracy.

## Speed Math module

- **Tables Practice** — multiplication drills across any combination of tables from 1 to 30 (e.g. `28 × 17`). Pick which tables to drill, get instant right/wrong feedback, and skip a question you don't know.
- **Squares & Cubes** — squares and cubes of 1 to 30, in squares-only, cubes-only, or mixed mode.
- **Ratios to Percentage** — convert fractions to percentages to two decimal places (e.g. `1/9 = 11.11`), with a basic (1/n) and advanced (n/d) difficulty.

Every game auto-advances on a correct answer, clears the box for another try on a wrong one, and tracks accuracy, time, and mistakes per session. Session history is stored locally in the browser (no account or server needed).

## Tech

Vite + React + TypeScript + Tailwind CSS. Routing uses `HashRouter` so it works on any static host without server-side rewrite rules. Most game data is bundled statically with no backend; Vocabulary and Idioms are the exceptions — see below.

### Shared banks (Firebase Firestore)

All six English games are backed by [Firebase Firestore](https://firebase.google.com) instead of static data, via the generic helper in `src/lib/sharedBank.ts`:

- **Vocabulary, Idioms, One Word Substitution, Phrasal Verbs** — anyone can add an entry (looked up via Wiktionary's free API); it's saved to Firestore and visible to every visitor. Deleting an entry (built-in or user-added) is permanent and global. One Word Substitution's add flow takes just the single word and swaps the looked-up fields, since that bank stores the phrase as `term` and the word as `meaning` (reversed from the others, to match the real exam format).
- **Synonyms, Antonyms** — anyone can add a word + its synonym/antonym pair. Since Wiktionary's API can't look up synonyms or antonyms directly, the add flow looks up only the word's own definition (stored as `definition`) and the user types the matching synonym/antonym word by hand (stored as `meaning`, same convention as the other banks' answer field). Deleting an entry is permanent and global.

This needs a free Firebase project of your own:

1. Create a project at the [Firebase Console](https://console.firebase.google.com) (free Spark plan, no card required).
2. Build → Firestore Database → Create database → start in **production mode**.
3. In the Rules tab, paste:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /vocabularyCustomWords/{wordId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['id', 'term', 'meaning', 'difficulty', 'hint', 'example'])
                       && request.resource.data.term is string && request.resource.data.term.size() > 0 && request.resource.data.term.size() < 100
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() < 2000
                       && request.resource.data.example is string && request.resource.data.example.size() < 2000
                       && request.resource.data.hint is string && request.resource.data.hint.size() < 300
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow update: if false;
         allow delete: if true;
       }
       match /vocabularyHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /idiomsCustomWords/{wordId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['id', 'term', 'meaning', 'difficulty', 'hint', 'example'])
                       && request.resource.data.term is string && request.resource.data.term.size() > 0 && request.resource.data.term.size() < 100
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() < 2000
                       && request.resource.data.example is string && request.resource.data.example.size() < 2000
                       && request.resource.data.hint is string && request.resource.data.hint.size() < 300
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow update: if false;
         allow delete: if true;
       }
       match /idiomsHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /oneWordSubstitutionCustomWords/{wordId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['id', 'term', 'meaning', 'difficulty', 'hint', 'example'])
                       && request.resource.data.term is string && request.resource.data.term.size() > 0 && request.resource.data.term.size() < 100
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() < 2000
                       && request.resource.data.example is string && request.resource.data.example.size() < 2000
                       && request.resource.data.hint is string && request.resource.data.hint.size() < 300
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow update: if false;
         allow delete: if true;
       }
       match /oneWordSubstitutionHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /phrasalVerbsCustomWords/{wordId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['id', 'term', 'meaning', 'difficulty', 'hint', 'example'])
                       && request.resource.data.term is string && request.resource.data.term.size() > 0 && request.resource.data.term.size() < 100
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() < 2000
                       && request.resource.data.example is string && request.resource.data.example.size() < 2000
                       && request.resource.data.hint is string && request.resource.data.hint.size() < 300
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow update: if false;
         allow delete: if true;
       }
       match /phrasalVerbsHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /synonymsCustomWords/{wordId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['id', 'term', 'meaning', 'difficulty', 'hint', 'example'])
                       && request.resource.data.term is string && request.resource.data.term.size() > 0 && request.resource.data.term.size() < 100
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() < 2000
                       && request.resource.data.example is string && request.resource.data.example.size() < 2000
                       && request.resource.data.hint is string && request.resource.data.hint.size() < 300
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow update: if false;
         allow delete: if true;
       }
       match /synonymsHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /antonymsCustomWords/{wordId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['id', 'term', 'meaning', 'difficulty', 'hint', 'example'])
                       && request.resource.data.term is string && request.resource.data.term.size() > 0 && request.resource.data.term.size() < 100
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() < 2000
                       && request.resource.data.example is string && request.resource.data.example.size() < 2000
                       && request.resource.data.hint is string && request.resource.data.hint.size() < 300
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow update: if false;
         allow delete: if true;
       }
       match /antonymsHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
     }
   }
   ```

4. Project settings → Your apps → add a Web app → copy the `firebaseConfig` object into `src/lib/firebase.ts` (this config is safe to commit; it's not a secret — access is controlled by the rules above, not by hiding these values).

There are no accounts in this app, so with no login system these rules intentionally allow anyone to add or delete any entry. That's a deliberate trade-off for a fully static, backend-free deploy — don't reuse this Firebase project for anything that needs real access control.

### AI-assisted lookup fallback (Gemini)

Wiktionary only matches exact page titles, so it misses plenty of real idioms and loosely-worded phrases (e.g. it has no page for some valid idiom phrasings even though a general web search would explain them). When Wiktionary finds nothing at all, every "Add" flow now falls back to a small serverless function — `api/lookup.js` — that asks Google's Gemini API for the definition instead. This applies wherever `lookupWord()` is used: Vocabulary, Idioms, One Word Substitution, Phrasal Verbs, and the word half of Synonyms/Antonyms.

The Gemini API key must **never** be shipped to the browser (unlike the Firebase config above, it's a real secret), so the call happens server-side in a Vercel serverless function rather than directly from the React app:

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Vercel project, go to Settings → Environment Variables and add `GEMINI_API_KEY` (all environments), then redeploy.
3. Optional: set `GEMINI_MODEL` to override the default (`gemini-2.0-flash`) if Google renames or deprecates it.

Without this env var configured, `api/lookup.js` returns a clear 500 error and every "Add" flow simply falls back to the original "No definition found" message — nothing breaks, the fallback is just inactive. Note that `api/lookup.js` only runs as a real serverless function once deployed on Vercel; `npm run dev` (Vite) serves it as a static file instead, so the fallback can't be exercised locally without the Vercel CLI (`vercel dev`).

## Development

```bash
npm install
npm run dev
```

## Deployment

Hosted on [Vercel](https://vercel.com) (free Hobby plan): import this GitHub repo at [vercel.com/new](https://vercel.com/new), it auto-detects Vite (build command `npm run build`, output `dist`) — no extra config needed. Every push to `main` redeploys automatically; every other branch/PR gets its own preview URL.
