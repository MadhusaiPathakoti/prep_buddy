# The Hindu Vocabulary — how the bank was built

`src/data/hinduVocab.json` (1,787 words) was produced once from the "1700+ Power Words" PDF and is committed, so nothing
here needs re-running unless the source changes.

- `extract_pdf.py` — reads the PDF with PyMuPDF. Every span uses the same generic font, so fields are told apart by
  column (x position) and font size: number, word, part of speech, Hindi meaning, English meaning ("Refers to: …"),
  five synonyms, five antonyms and the example. Notes it works around:
  - the "STUDY TIP" boxes (size 7.6) sit in the synonym/antonym columns on some pages, so those columns match size 7.7 exactly;
  - the big "NB" watermark (Arial) is skipped;
  - Devanagari words arrive as touching pieces (`बि ं दु`), so Hindi spans are joined by x-gap instead of by spaces.
  It writes `entries.json` next to it.
- The PDF has one example sentence per word; the app shows two, so a second one was written separately for every word and
  merged in by number as `examples[1]`. The merge also title-cases the part of speech and drops the trailing full stop
  from the English meaning.

Run `npm run verify:hindu` to check the data (all fields, 5 + 5 synonyms/antonyms, two distinct examples) and every game question type.
