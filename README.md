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
         // only the difficulty may change (the Library's "change difficulty" control)
         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['difficulty'])
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow delete: if true;
       }
       match /vocabularyHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /vocabularyDifficultyOverrides/{wordId} {
         allow read: if true;
         allow create, update: if request.resource.data.keys().hasOnly(['difficulty', 'updatedAt'])
                               && request.resource.data.keys().hasAll(['difficulty', 'updatedAt'])
                               && request.resource.data.difficulty in ['easy', 'medium', 'hard']
                               && request.resource.data.updatedAt is number;
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
         // only the difficulty may change (the Library's "change difficulty" control)
         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['difficulty'])
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow delete: if true;
       }
       match /idiomsHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /idiomsDifficultyOverrides/{wordId} {
         allow read: if true;
         allow create, update: if request.resource.data.keys().hasOnly(['difficulty', 'updatedAt'])
                               && request.resource.data.keys().hasAll(['difficulty', 'updatedAt'])
                               && request.resource.data.difficulty in ['easy', 'medium', 'hard']
                               && request.resource.data.updatedAt is number;
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
         // only the difficulty may change (the Library's "change difficulty" control)
         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['difficulty'])
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow delete: if true;
       }
       match /oneWordSubstitutionHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /oneWordSubstitutionDifficultyOverrides/{wordId} {
         allow read: if true;
         allow create, update: if request.resource.data.keys().hasOnly(['difficulty', 'updatedAt'])
                               && request.resource.data.keys().hasAll(['difficulty', 'updatedAt'])
                               && request.resource.data.difficulty in ['easy', 'medium', 'hard']
                               && request.resource.data.updatedAt is number;
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
         // only the difficulty may change (the Library's "change difficulty" control)
         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['difficulty'])
                       && request.resource.data.difficulty in ['easy', 'medium', 'hard'];
         allow delete: if true;
       }
       match /wordBankHiddenSeedWords/{wordId} {
         allow read: if true;
         allow create: if true;
         allow update: if false;
         allow delete: if false;
       }
       match /wordBankDifficultyOverrides/{wordId} {
         allow read: if true;
         allow create, update: if request.resource.data.keys().hasOnly(['difficulty', 'updatedAt'])
                               && request.resource.data.keys().hasAll(['difficulty', 'updatedAt'])
                               && request.resource.data.difficulty in ['easy', 'medium', 'hard']
                               && request.resource.data.updatedAt is number;
         allow delete: if false;
       }
     }
   }
   ```

   Changing a word's difficulty from a Library works two ways: a user-added entry's `difficulty` field is updated in place (the `allow update` rule on the `*CustomWords` collections permits that field and nothing else), while a built-in entry can't be edited, so the choice is saved as a tiny override document in the matching `*DifficultyOverrides` collection (`{ difficulty, updatedAt }`, written with `setDoc` and layered over the bundled data on every read). Without these rules the Library's difficulty control fails with "Missing or insufficient permissions". Phrasal Verbs has no difficulty editing, so its collections are unchanged.

   The `synonymsCustomWords`, `synonymsHiddenSeedWords`, `antonymsCustomWords`, and `antonymsHiddenSeedWords` collections/rules from the old separate Synonyms/Antonyms banks are no longer read or written by the app (superseded by `wordBank*` above) — safe to delete from your rules whenever convenient, or just leave them as harmless dead rules.

4. Project settings → Your apps → add a Web app → copy the `firebaseConfig` object into `src/lib/firebase.ts` (this config is safe to commit; it's not a secret — access is controlled by the rules above, not by hiding these values).

There are no accounts in this app, so with no login system these rules intentionally allow anyone to add or delete any entry. That's a deliberate trade-off for a fully static, backend-free deploy — don't reuse this Firebase project for anything that needs real access control.

### AI-assisted lookups (Gemini)

Every "Add" flow looks up its word/idiom/phrase via `lookupWord()` in `src/lib/dictionaryApi.ts`, which tries a Gemini-backed serverless function (`api/lookup.js`) **first**, since Gemini reliably returns both a meaning and a natural example together. Wiktionary's free REST API is the fallback — used only if Gemini is unavailable (no key configured, network error) or genuinely finds nothing — since on its own it has real gaps: it only matches exact page titles (missing many real idioms and loosely-worded phrases) and, even when it finds a definition, often has no example sentence for that particular sense. This benefits every bank that shares `lookupWord()`: Vocabulary, Idioms, One Word Substitution, Phrasal Verbs, and the word half of Synonyms/Antonyms.

The Gemini API key must **never** be shipped to the browser (unlike the Firebase config above, it's a real secret), so the call happens server-side in a Vercel serverless function rather than directly from the React app:

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. In the Vercel project, go to Settings → Environment Variables and add `GEMINI_API_KEY` (all environments), then redeploy.
3. By default `api/lookup.js` tries `gemini-3.5-flash` first, then falls back to `gemini-3.5-flash-lite` if that call errors, times out, comes back malformed, or says "not found" — the fuller model handles trickier inputs better (e.g. an idiom with a pronoun swapped or verb conjugated, like "cash in one's chips" typed as "cashed in his chips"), and the second model is a real second opinion rather than just a health check. Optional: set `GEMINI_MODEL` to pin a single specific model instead (skips the fallback entirely) — useful if Google renames or deprecates one of the two; check [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) if lookups start failing.

Without this env var configured, `api/lookup.js` returns a clear 500 error and every "Add" flow transparently falls back to Wiktionary (and from there to the original "No definition found" message if that fails too) — nothing breaks, Gemini is just skipped. Note that `api/lookup.js` only runs as a real serverless function once deployed on Vercel; `npm run dev` (Vite) serves it as a static file instead, so only the Wiktionary path can be exercised locally without the Vercel CLI (`vercel dev`).

## Mocks module

SBI/IBPS **PO (hard)** and **Clerk (medium)** prelims mocks at `/mocks`, in an exam window modelled on the TCS/NTA software (question palette with the five status shapes, per-section clocks, Mark for Review, Clear Response, Save & Next, Question Paper / Instructions, text-size control, submit summary, autosave/resume after a refresh). Three kinds per exam:

- **Full-length** — 100 questions, 60 minutes: English 30, Quant 35, Reasoning 35, 20 minutes per section. As in the real exam, sections are locked: you can't return to one after submitting it or when its time ends. +1 / −0.25.
- **Sectional** — one section at its real question count and time (English 30/20 min, Quant 35/20 min, Reasoning 35/20 min).
- **Topic-wise** — one topic, with your own question count (5–40) and 30–60 seconds per question.

The pattern and the per-section topic mix are in `src/lib/mocks/blueprints.ts` (taken from the 2025 IBPS PO, IBPS Clerk and SBI PO prelims shift analyses: puzzles/seating dominate Reasoning; DI + arithmetic + approximation/series dominate Quant; RC, cloze, error detection, para jumbles and fillers make up English). Some 2025 SBI PO shifts were reported with a 40/30/30 English/Reasoning/Quant split, but the coaching sources contradict each other, so the widely documented 30/35/35 is used for both exams — change the blueprint if you disagree.

**Where the questions come from, and how they are checked**

- **Quant** (`src/lib/mocks/quant`, 22 topics) — generated in code, designed backwards from clean numbers. Every generator cross-checks its key with a second method and throws if they disagree.
- **Reasoning** (`src/lib/mocks/reasoning`, 15 topics) — puzzles, seating, comparison and ranking are generated from a hidden arrangement and accepted only if an exhaustive solver finds exactly one solution; syllogism and inequality are decided by exhaustive model/assignment enumeration.
- **English** (8 topics) — comes from a **curated bank shipped with the app** by default (`content/english/*.json` → built into `src/lib/mocks/english/seed.generated.json`, ~300 questions: reading comprehension, cloze, error detection, para jumble, fillers, word swap, phrase replacement, match the column; PO = hard, Clerk = medium). It loads instantly, needs no internet or API keys, never repeats a question inside a paper, and prefers questions you haven't seen yet (tracked in the browser; repeats only start once a topic's pool is used up). Every item was written to a strict brief, then solved **blind by an independent reviewer** who fixed or deleted anything with a second defensible answer (logs in `content/english/_review/`). Several types are correct by construction: a word-swap's faulty sentence is derived from the authored correct one, para-jumble and match-the-column keys come from the authored order.
  - **Adding questions:** write items in `content/english/<topic>-<hard|medium>.json` (schemas and conventions in `content/english/README.md`), then `npx tsx scripts/build-english-seed.ts --blind` validates them (fails loudly with file/item-precise errors, proves the by-construction keys, rejects duplicates and skewed answer positions) and rewrites the seed; the `--blind` views in `content/english/_blind/` (git-ignored, no keys) are for a second person to solve before you trust the new items.
  - **Optional "Fresh AI questions"** (a switch on the launch page): written by an LLM, then solved blind by a second pass (a different provider/model where one is available) that must agree and judge exactly one option acceptable. It needs keys — set any of `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` (in `.env.local` for `npm run dev`, or as Vercel environment variables); chains can be overridden with `MOCK_ENGLISH_GENERATE_MODELS` / `MOCK_ENGLISH_SOLVE_MODELS` (`provider/model,…`). Models that are out of quota, removed or overloaded are skipped and remembered in the browser; verified AI questions are banked in the browser so "Try again" resumes; and anything the AI can't fill is taken from the curated bank, so this mode never leaves a mock unable to start. AI questions can't be proven correct, only filtered — the curated bank is the one to trust for serious practice.

  **Free-tier reality (AI mode only):** a full mock's English needs roughly 15–40 model calls. Gemini's free tier gives about 20 requests per day per model and Groq's about 8,000 tokens per minute per model, so on free keys only a few mocks a day are possible and a preparation may need a "Try again" after a minute. More providers (Mistral's free plan is the most generous) or billing on one key remove most of that friction. `npx tsx --env-file=.env.local scripts/probe-llm-models.ts` shows which models your keys can use right now and their limits; `scripts/verify-mocks-english.ts --live-paper` / `--live-review` time and dump a real section (they spend your quota).

`npm run verify:mocks` runs all four test harnesses (engine/timers/scoring/PDF, Quant, Reasoning, English with a stubbed Gemini; the Quant and Reasoning ones generate tens of thousands of questions). Once you have a key, `npx tsx scripts/verify-mocks-english.ts --live 10` measures how often the live model's questions are filtered out.

**Question Paper → Download PDF** — the exam window's Question Paper dialog can save the current section as a printable practice copy (questions and each set's passage/data, no answer key — so it can't be used to peek ahead in a locked full mock). Check your answers afterwards in the result's solution analysis.

**Result report** — overview, rank predictor, performance breakdown, sectional summary, compare-with-topper, topic analysis and the full question-by-question solution analysis, on screen and as a downloadable PDF (`src/lib/mocks/pdf.ts`, lazy-loaded). There are no other test-takers, so **rank, percentile, topper and average are estimates against a simulated cohort of 2,000** (`src/lib/mocks/cohort.ts`) and are labelled that way in the app and the PDF. Finished attempts are kept in the browser (last 12) and can be re-attempted.

To run the Gemini-backed functions under `npm run dev`, put `GEMINI_API_KEY=...` in `.env.local`; `vite.config.ts` serves `/api/*` locally (it never reaches the browser bundle).

## Daily Dose of Practice

One fixed SBI PO-level quiz per section per day at `/daily`: **Quant (25)**, **Reasoning (25)** and **English (45)**, with no time limit. The paper is a pure function of the date (`src/lib/daily/compose.ts`), and it is cached the first time it is opened, so it is identical on every visit that day, on any device. Reopening a finished section shows the summary, and **Re-attempt** starts a new attempt on the same paper.

- **Quant / Reasoning** come from the mock generators (hard level) seeded from the date: Quant follows the reference practice sheet (simplification, approximation, arithmetic, quadratics, wrong/missing series, one DI set); Reasoning has a seating set, a puzzle set, syllogism, inequality, blood relations, direction, coding and ranking.
- **English** follows the "English Daily Checklist": 10 error detection, 5 RC, 5 para jumble, 5 cloze, 5 sentence improvement, 5 vocabulary, 3 idioms, 3 phrasal verbs, 4 one-word substitutes. It uses the curated mock bank plus the built-in word banks and needs no network. Each topic walks its pool in a fixed shuffled order, so nothing repeats until the pool is used up (error detection after 4 days, RC and cloze after 8). Add questions to `content/english/` to lengthen the cycle.
- **Results** reuse the mock result page (score, rank/percentile estimates, breakdown, topic analysis, solution analysis). Daily attempts are kept in their own store (last 45) so they never push full-mock results out.
- **Download paper (PDF)** — the whole paper with the questions first, then an `Answers:` key and step-by-step `Solutions:`; every page carries the PrepBuddy header, watermark and footer (`src/lib/daily/pdf.ts`).

`npm run verify:daily` builds 40 days of every section and checks counts, determinism, day-to-day variety, validity and the PDF.

## Development

```bash
npm install
npm run dev
```

## Deployment

Hosted on [Vercel](https://vercel.com) (free Hobby plan): import this GitHub repo at [vercel.com/new](https://vercel.com/new), it auto-detects Vite (build command `npm run build`, output `dist`) — no extra config needed. Every push to `main` redeploys automatically; every other branch/PR gets its own preview URL.
