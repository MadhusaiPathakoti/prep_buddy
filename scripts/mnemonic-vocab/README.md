# Mnemonic Vocabulary — how the bank was built

`src/data/mnemonicVocab.json` (1,018 words) and `public/mnemonic/img/<n>.webp` (one cartoon per word) were produced
once from the "Mnemonic Vocabulary 1-1018" PDF. They are committed, so nothing here needs re-running unless the source changes.

- `extract_text.py` — reads the PDF with PyMuPDF and classifies every text span by font + colour (word, respelling,
  part of speech, Hindi gloss, English meaning, trick, synonyms, antonyms, example). Writes `entries.json` next to it.
  Font sizes shrink on long entries, so colour — not size — is the reliable key.
- `extract_images.py [width] [quality]` — saves each card's picture (skipping the repeated watermark/logo) as WebP
  (we used 480 px, quality 72: about 5 KB each, 5 MB for all).
- The PDF has one example sentence per word; the app shows two, so a second one was written separately for every word
  and merged in by number as `examples[1]`.
- The PDF's text layer doubles some Devanagari vowel signs (e.g. `अस्थाायी`); the merge step collapses repeats with
  `re.sub(r'([\u093E-\u094C])\1+', r'\1', text)`.

Run `npm run verify:mnemonic` to check the data (all fields present, two distinct examples, picture on disk) and the game logic.
