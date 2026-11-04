# Curated English question bank - authoring conventions

Files: `content/english/<topic>-<difficulty>.json`, difficulty `medium` (IBPS/SBI Clerk) or `hard` (SBI/IBPS PO).
Topics: `rc`, `cloze`, `error-detection`, `para-jumble`, `fillers`, `word-swap`, `phrase-replacement`, `match-column`.
Each file is ONE JSON object (shown below per topic). Plain UTF-8 JSON, no comments, no trailing commas.

`npx tsx scripts/build-english-seed.ts` validates every item with the same validators the app uses and stops with a
`file:item` message for each problem. The app builds stems, shuffles options and writes explanations FOR YOU where noted -
so for several topics you only author the correct material and the key.

## Rules for ALL text

- English only; characters: Latin-1 plus curly quotes/dashes, bullets, the symbols `- ... ₹ → ∴`. No emoji, no markdown, no `*`,
  no backticks, no HTML, no `TODO`/`TBD`/placeholder text. Straight ASCII quotes are fine.
- Underscores appear ONLY as blanks written exactly `______` (six underscores).
- Original text. No real named people/companies/institutions, no real statistics or dates as facts, nothing political,
  violent or distressing.
- Exactly ONE defensible key. If a careful candidate could argue for a second option, rewrite the item.
- A different `explanation` per item, 1-3 sentences, naming the rule or quoting the evidence. Never cite option letters or
  numbers ("option C", "(b)" for options) - options are shuffled when a paper is built. (Where the app builds the explanation
  itself, yours is only checked for length: still write a good one, 8+ characters.)
- Vary subject matter, sentence openings and the grammar point tested. Spread keys: no more than 40% of the keys of a file may
  share one `correctIndex`, and the key must not be the longest option in more than 40% of the questions.
- `hard` = PO level: finer grammar, subtler collocations, abstract vocabulary, longer sentences, distractors that are tempting
  misreadings. `medium` = Clerk level: common rules, everyday/business vocabulary, direct logic.

## rc  (`rc-hard.json`, `rc-medium.json`)

```json
{"passages":[{"paragraphs":["Paragraph one ...","Paragraph two ..."],
  "questions":[{"kind":"inference","targetWord":"","stem":"Which of the following can be inferred from the passage?",
    "options":["a","b","c","d","e"],"correctIndex":2,"explanation":"..."}]}]}
```
- Passage: 2-4 `paragraphs`. Length: hard 380-450 words (accepted 250-560), medium 250-320 words (accepted 170-420).
- 8-10 questions per passage (max 12). `kind` is one of `main-idea`, `inference`, `true`, `not-true`, `tone`, `vocab-synonym`,
  `vocab-antonym`, `may-be-true`. Per passage: at least 1 `main-idea`, 2+ `inference`, 1 `true`, 1 `not-true` (stem contains
  NOT in capitals), 1 `tone`, 1 `vocab-synonym`, 1 `vocab-antonym`.
- Stems: a real question ending `?` or an unfinished sentence ending `:` - never a statement ending in a full stop.
- Exactly 5 distinct options, all of the same form and similar length (all full statements or all short phrases). Never
  `True`/`False`/`Yes`/`No` options, never "All of the above"/"None of these", never options that refer to other options.
- Never use a sentence of the passage as the stem. Distractors must be tempting misreadings (overstate, reverse, generalise),
  never absurd. `hard`: at least 2 inference questions that need TWO sentences.
- Vocabulary kinds: `targetWord` = one word exactly as written in the passage (case aside); the app writes the stem (put any
  text in `stem`, 20+ characters); the 5 options are single words or at most 3-word phrases and do not include the target.
  For non-vocabulary kinds `targetWord` is `""`.
- `correctIndex` 0-4 = position of the key in YOUR `options` array.

## cloze  (`cloze-hard.json`, `cloze-medium.json`)

```json
{"passages":[{"text":"The firm (1) ______ its loans last year, but (2) ______ ...",
  "blanks":[{"n":1,"options":["a","b","c","d","e"],"correctIndex":0,"explanation":"..."}]}]}
```
- One passage per entry of 120-220 words, 5 blanks (3-10 allowed). Blanks written exactly `(1) ______`, `(2) ______` ... numbered
  1..N in order of appearance, each blank once. Paragraph breaks = `\n` inside `text`.
- `blanks` has one entry per blank with the same `n`. 5 distinct options, each a single word or a fixed 2-3 word phrase.
- The key must be the ONLY option that fits by grammar, collocation AND meaning; distractors must be definitely wrong in that slot
  (wrong form, wrong collocation, contradicts the sense) - not near-synonyms that also fit.

## error-detection  (`error-detection-hard.json`, `error-detection-medium.json`)

```json
{"items":[
 {"variant":"parts","parts":["The committee has decided","to postpone the meeting","due to the lack of","a quorum this week."],
  "errorPartIndex":null,"explanation":"All four parts are correct."},
 {"variant":"parts","parts":["Neither the manager","nor his assistants was","aware of the new rule","issued last month."],
  "errorPartIndex":1,"explanation":"Verb agrees with the nearer subject: 'were'."},
 {"variant":"sentences","sentences":["s1 ...","s2 ...","s3 ...","s4 ...","s5 ..."],"correctIndex":3,"explanation":"..."}]}
```
- `parts` variant: 4 consecutive parts (each 2+ words) that join with single spaces into ONE natural sentence of 12-60 words that
  starts with a capital letter and whose LAST part ends with the full stop. The error (if any) lies inside exactly one part and is
  a grammar rule (agreement, tense, preposition, article, pronoun, parallelism, comparison, modifiers) - never style, spelling or
  punctuation, never a point where authorities differ. The other three parts are flawless.
- CONVENTION for "No error": `"errorPartIndex": null`. Otherwise 0-3 = the part (a)-(d). The app shows
  `(a) ... (b) ... (c) ... (d) ...` and the fixed options `(a) (b) (c) (d) No error`.
- Share of `null` ("No error") items: at most about 1 in 6 per file.
- `sentences` variant: exactly 5 full sentences (6-40 words) on the same idea; exactly ONE is grammatically correct (`correctIndex`
  0-4), each of the other four has a different clear error.

## para-jumble  (`para-jumble-hard.json`, `para-jumble-medium.json`)

```json
{"items":[{"sentences":["Opening sentence.","Second sentence that refers back.","Third.","Fourth.","Fifth."],
  "explanation":"..."}]}
```
- `sentences`: 5 or 6 sentences IN THE CORRECT ORDER (the app shuffles and labels them A-F and builds the options).
- Sentence 1 stands alone (no antecedent: must not start with This/Such/These/However/Moreover/But/Thus/He/She/They...). Every
  later sentence depends on what precedes it (pronoun / "this" reference / connector / time order) so exactly ONE order is coherent;
  include at least one mandatory adjacent pair. Each sentence 5-45 words, ends with `.` `!` or `?`, no "A."/"1." labels.

## fillers  (`fillers-hard.json`, `fillers-medium.json`)

```json
{"items":[
 {"type":"single","sentence":"The audit revealed ______ in the accounts.","options":["a","b","c","d","e"],"correctIndex":1,"explanation":"..."},
 {"type":"double","sentence":"The (A) ______ policy failed to (B) ______ inflation.",
  "options":[["w1a","w1b"],["w2a","w2b"],["w3a","w3b"],["w4a","w4b"],["w5a","w5b"]],"correctIndex":3,"explanation":"..."}]}
```
- `single`: exactly one `______`; 5 distinct options, each 1-3 words, no commas.
- `double`: blanks written `(A) ______` and `(B) ______` in that order; 5 distinct `[wordForA, wordForB]` pairs; no pair repeats the
  same word twice; every single word must look plausible in its slot.
- Sentence of 8+ words (hard: 25-40 words). Exactly ONE option/pair makes the sentence correct, natural and meaningful; every other
  one is definitely wrong (not just weaker). If several phrasal verbs or synonyms would all work, rewrite.

## word-swap  (`word-swap-hard.json`, `word-swap-medium.json`)

```json
{"items":[
 {"tokens":["The","government","has","launched","a","new","scheme","to","support","small","farmers."],
  "marked":["government","launched","new","scheme"],"swap":[1,3],"explanation":"..."},
 {"tokens":["..."],"marked":["w1","w2","w3","w4"],"swap":null,"explanation":"..."}]}
```
- `tokens`: the CORRECT sentence split into words, punctuation attached to the word it follows (`"farmers."`), 8-42 tokens, first token
  capitalised. Never put spaces inside a token.
- `marked`: 4 DISTINCT plain lowercase words (letters, `'` or `-`, 2-21 characters) taken from `tokens`, in order of appearance, never
  the first token and never a token with attached punctuation.
- `swap`: `[a, b]` = two positions (0-3) inside `marked` whose words the app INTERCHANGES to make the faulty sentence shown to
  students (above: swapping "launched" and "scheme" gives the faulty sentence). The result must be clearly ungrammatical or
  nonsensical, putting them back must be the ONLY single interchange of two marked words that gives a correct sentence, and the two
  words must differ. CONVENTION for "No interchange required": `"swap": null` (the correct sentence is shown as it is). At most
  about 1 in 7 items per file.

## phrase-replacement  (`phrase-replacement-hard.json`, `phrase-replacement-medium.json`)

```json
{"items":[
 {"variant":"replace","before":"The minister said that the scheme","phrase":"will be launching","after":"next month.",
  "options":["will launch","would have launched","is to launch","had launched"],"correctIndex":0,"explanation":"..."},
 {"variant":"replace","before":"...","phrase":"...","after":"...","options":["a","b","c","d"],"correctIndex":null,"explanation":"..."},
 {"variant":"usage","sentence":"She decided to ______ her studies despite the delay.","options":["a","b","c","d","e"],"correctIndex":2,"explanation":"..."}]}
```
- `replace`: `before + phrase + after` (joined by spaces) is the sentence; the app shows the phrase in CAPITALS and adds the fixed fifth option
  "No correction required". `phrase` = 1-9 words; `after` carries the closing punctuation and is never empty. EXACTLY 4 distinct
  replacement `options`, none equal to the original phrase and none "No correction required".
- CONVENTION for "No correction required": `"correctIndex": null` - the original phrase is already correct and ALL four options are wrong
  or clearly worse. Otherwise `correctIndex` 0-3 = the one replacement that makes the whole sentence correct (others leave it wrong).
  At most about 1 in 6 items per file may be `null`.
- `usage`: a sentence with exactly one `______`; 5 distinct phrases (phrasal verbs / fixed expressions), exactly one fits by meaning and
  grammar; `correctIndex` 0-4. Use for about 1 in 5 items.

## match-column  (`match-column-hard.json`, `match-column-medium.json`)

```json
{"items":[{"pairs":[{"begin":"Although prices rose sharply","end":"demand remained strong."},
  {"begin":"...","end":"..."},{"begin":"...","end":"..."},{"begin":"...","end":"..."}],"explanation":"..."}]}
```
- EXACTLY 4 pairs; each is one sentence split in two: `begin` (3-18 words, no end punctuation) + `end` (2-20 words, finishes with a full
  stop). The app shuffles the endings into Column II (A-D) and builds the 5 matchings.
- Each beginning is completable ONLY by its own ending (tense, number, conjunction, voice and meaning); each ending is clearly
  unsuitable for the other three beginnings. The four sentences are about different things; no two beginnings start with the same two words.

## Checking your file

`npx tsx scripts/build-english-seed.ts` (writes `src/lib/mocks/english/seed.generated.json` only when every file is valid) and
`npx tsx scripts/build-english-seed.ts --blind` (writes `content/english/_blind/<topic>-<difficulty>.txt`: every question with options
but WITHOUT keys or explanations, for blind solving by a reviewer).
