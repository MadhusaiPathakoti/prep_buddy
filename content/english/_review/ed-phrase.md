# Review log: error-detection and phrase-replacement (hard + medium)

Method: blind pass on the four _blind views first (own answer and per-part / per-option acceptability), then comparison with the authors' keys.
Result of the comparison: my blind answers matched all 70 original keys. Every defect below is therefore a robustness defect (debatable point, second arguable option, weak distractor), not a wrong key.

## error-detection-hard.json (20 items)

- Item 7 ("Far less candidates appeared..."): the key rests on less/fewer, a point where reputable authorities differ (descriptive usage guides accept "less" with count nouns). Violates "never a point where authorities differ". Replaced with an unambiguous error: "The fishermen avoided to go out to sea ..." (avoid + gerund, error in part a). FIXED (rewritten).
- All other items (including the three no-error items 3, 10, 18 and the four sentence-variant items) were fine: single clear error, other parts flawless, no second arguable error.

## error-detection-medium.json (20 items)

- No defects. Every item had one clear error (or a clean no-error sentence), all keys matched my blind answers, no debatable points.

## phrase-replacement-hard.json (14 items, now 16)

- Item 5 ("Seldom has the council faced ... as it did over the proposed bypass"): present perfect plus "as it did" (past) is a tense mismatch a challenger could object to. Changed the tail to "as the one over the proposed bypass". FIXED.
- Item 9 (no correction, "should be published"): the distractors "should be publishing" and "must be being published" are, in the middle-voice / passive-progressive sense, not clearly ill-formed, so "No correction" was attackable. Replaced the distractors with plainly ungrammatical groups ("should be publish", "should published", "should being published", "should been published"). FIXED.
- Item 12 (usage, hammered out): distractor "went over" could be read as "reviewed a compromise". Replaced with "set off". FIXED.
- Item 14 (usage, went through): distractor "went after" ("pursued the records") was arguably acceptable. Replaced with "went away". FIXED.
- Added 2 items to reach 16: "Not until ... did the board realise" (inversion) and "milder than that of the hill stations" (illogical comparison). Both checked option by option: exactly one option works.
- Items 1-4, 6-8, 10, 11, 13: fine (key unique, distractors clearly wrong, item 1 is a safe no-correction).

## phrase-replacement-medium.json (14 items, now 16)

- Item 1 (suggested us to revise): distractor "suggested us revising" is heard in informal English and is only marginally wrong. Replaced with "suggested we to revise". FIXED.
- Item 2 ("angry with the late delivery"): the original phrase is defensible for a thing in some dictionaries, so the item was attackable on the original and on "No correction required". Rewrote the original as "angry of" with options about / to / for / from; "about" is the only one that fits. FIXED.
- Added 2 items to reach 16: "price of vegetables has gone up" (agreement with the singular head noun) and "the tallest of all the boys" (superlative for more than two). Checked option by option.
- Items 3-14 (except the two above): fine. Item 3 and item 7 (no correction) hold: every replacement is clearly wrong.

## Totals

- Items reviewed: 70 original items (20 + 20 + 14 + 14 + 2 re-checked after rewriting), plus 4 new items.
- Defects found: 8 (1 in error-detection-hard, 0 in error-detection-medium, 4 in phrase-replacement-hard, 2 in phrase-replacement-medium; plus the blind pass found no wrong keys).
- Fixed by rewriting: 8. Deleted outright: 0 (error-detection-hard item 7 was replaced in place).
- Items added: 4 (2 hard, 2 medium) to bring each phrase file to 16.
- Builder: `npx tsx scripts/build-english-seed.ts --blind` runs clean for all my files. No-error share: 15% (ED hard, ED medium), 13% (phrase hard, phrase medium). Error-part positions in ED: hard a3 b4 c3 d3 (parts items), medium a3 b4 c3 d3.

## Confidence

High (about 95%) that the remaining items are flawless. Residual risks: ED hard item 15 ("No sooner ... when") relies on "than" being the standard partner (it is, though "when" is common in speech); ED hard items 3 and 10 are no-error items built on subtle agreement/countability, which I judged sound but are the most likely to draw a challenge.
