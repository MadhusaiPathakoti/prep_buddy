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

- **Vocabulary, Idioms, One Word Substitution, Phrasal Verbs** — anyone can add an entry (looked up via Wiktionary's free API); it's saved to Firestore and visible to every visitor. Deleting an entry (built-in or user-added) is permanent and global. One Word Substitution's add flow takes just the single word and swaps the looked-up fields, since that bank stores the phrase as `term` and the word as `meaning` (reversed from the others, to match the real exam format) — its security rule's size limits are swapped to match (`term` gets the generous 2000-char cap since it holds the full descriptive phrase, `meaning` gets the tight 100-char cap since it's just the one word).
- **Vocabulary, Idioms, One Word Substitution, and Phrasal Verbs** all carry an optional `createdAt` ISO timestamp on every `BankEntry` (all seed entries are backdated to `2026-01-01`, new entries get the real add time). Their quiz setup screens show a **Freshness** filter (Any time / Days / Weeks / Months, with preset amounts like "Last 7 days") that restricts the question pool to entries added within that window — `BankQuiz` shows this section automatically whenever the bank it's given has `createdAt` on at least one entry, so any other bank can opt in later just by setting the field. Entries without `createdAt` are treated as "not recent" once a specific window is selected.
- **Synonyms, Antonyms** — these two games share a single **word bank** (`src/data/wordBank.ts`, `src/lib/wordBankStore.ts`) rather than each having its own: one entry per word carries its own meaning/example/part of speech *and* a full list of synonyms *and* a full list of antonyms (`WordEntry` in `src/lib/types.ts`), so the Synonyms and Antonyms games are just two different quizzes over the same underlying data. Anyone can add a word — the add flow looks up the word's own meaning, part of speech, and example automatically, and the user types the synonym/antonym lists by hand (comma-separated) since Wiktionary/Gemini can't be relied on to enumerate them. Those typed lists aren't trusted verbatim: `lookupWordBankEntry()` (`src/lib/dictionaryApi.ts`) asks Gemini to verify them in the same call — dropping words that don't actually belong (including one listed under the wrong side, or under both, like "increase" as both a synonym and antonym of "abate"), fixing obvious misspellings, and topping up a thin list with well-known correct words — and the add screen shows exactly what changed, if anything. Without Gemini available, it falls back to just removing any word listed as both a synonym and an antonym (the one check that needs no AI). A new word is starred as a favourite automatically. Deleting an entry is permanent and global. `WordEntry.createdAt` is always set (not optional), so their quiz setup screens (`WordBankQuiz`) always show the same **Freshness** filter described above.

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
                       && request.resource.data.term is string && request.resource.data.term.size() > 0 && request.resource.data.term.size() < 2000
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() > 0 && request.resource.data.meaning.size() < 100
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
       match /wordBankCustomWords/{wordId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['id', 'word', 'partOfSpeech', 'meaning', 'example', 'synonyms', 'antonyms', 'difficulty', 'createdAt'])
                       && request.resource.data.word is string && request.resource.data.word.size() > 0 && request.resource.data.word.size() < 100
                       && request.resource.data.meaning is string && request.resource.data.meaning.size() < 2000
                       && request.resource.data.example is string && request.resource.data.example.size() < 2000
                       && request.resource.data.partOfSpeech is string && request.resource.data.partOfSpeech.size() < 30
                       && request.resource.data.synonyms is list && request.resource.data.synonyms.size() < 20
                       && request.resource.data.antonyms is list && request.resource.data.antonyms.size() < 20
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard']
                       && request.resource.data.createdAt is string;
         allow update: if false;
         allow delete: if true;
       }
       match /wordBankHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
     }
   }
   ```

   The `synonymsCustomWords`, `synonymsHiddenSeedWords`, `antonymsCustomWords`, and `antonymsHiddenSeedWords` collections/rules from the old separate Synonyms/Antonyms banks are no longer read or written by the app (superseded by `wordBank*` above) — safe to delete from your rules whenever convenient, or just leave them as harmless dead rules.

4. Project settings → Your apps → add a Web app → copy the `firebaseConfig` object into `src/lib/firebase.ts` (this config is safe to commit; it's not a secret — access is controlled by the rules above, not by hiding these values).

There are no accounts in this app, so with no login system these rules intentionally allow anyone to add or delete any entry. That's a deliberate trade-off for a fully static, backend-free deploy — don't reuse this Firebase project for anything that needs real access control.

### AI-assisted lookups (Gemini)

Every "Add" flow looks up its word/idiom/phrase via `lookupWord()` in `src/lib/dictionaryApi.ts`, which tries a Gemini-backed serverless function (`api/lookup.js`) **first**, since Gemini reliably returns both a meaning and a natural example together. Wiktionary's free REST API is the fallback — used only if Gemini is unavailable (no key configured, network error) or genuinely finds nothing — since on its own it has real gaps: it only matches exact page titles (missing many real idioms and loosely-worded phrases) and, even when it finds a definition, often has no example sentence for that particular sense. This benefits every bank that shares `lookupWord()`: Vocabulary, Idioms, One Word Substitution, Phrasal Verbs, and the word half of Synonyms/Antonyms.

The Gemini API key must **never** be shipped to the browser (unlike the Firebase config above, it's a real secret), so the call happens server-side in a Vercel serverless function rather than directly from the React app:

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Vercel project, go to Settings → Environment Variables and add `GEMINI_API_KEY` (all environments), then redeploy.
3. Optional: set `GEMINI_MODEL` to override the default (`gemini-3.5-flash-lite`) if Google renames or deprecates it — Google retires Gemini model names fairly often, so check [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) if lookups start failing.

Without this env var configured, `api/lookup.js` returns a clear 500 error and every "Add" flow transparently falls back to Wiktionary (and from there to the original "No definition found" message if that fails too) — nothing breaks, Gemini is just skipped. Note that `api/lookup.js` only runs as a real serverless function once deployed on Vercel; `npm run dev` (Vite) serves it as a static file instead, so only the Wiktionary path can be exercised locally without the Vercel CLI (`vercel dev`).

## Development

```bash
npm install
npm run dev
```

## Deployment

Hosted on [Vercel](https://vercel.com) (free Hobby plan): import this GitHub repo at [vercel.com/new](https://vercel.com/new), it auto-detects Vite (build command `npm run build`, output `dist`) — no extra config needed. Every push to `main` redeploys automatically; every other branch/PR gets its own preview URL.
