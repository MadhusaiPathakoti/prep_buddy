# Review log: rc-hard, rc-medium, cloze-hard, cloze-medium

Method: blind pass first (answers and per-option acceptability written before opening the JSON), then comparison with the authors' keys, then edits, then `build-english-seed.ts --blind` (clean).

## Totals
- Questions reviewed: 121 (rc-hard 37, rc-medium 36, cloze-hard 24, cloze-medium 24)
- Key disagreements between my blind answers and the authors' keys: 0
- Items where I judged two options acceptable or none: 0 (one near-miss noted below)
- Soft defects found (wording/ambiguity risks, none changing a key): 6
- Items fixed: 6 (all rewrites of a distractor or passage word; keys unchanged)
- Items deleted: 0

## Defects and actions
1. rc-hard.json, passage 3 (rebound), NOT-true question: option "A partial rebound still leaves a net gain in resource use overall" could be misread as "use increases", which would make a true statement look false (or, to a careless reader, a second NOT-true candidate). Rewrote to "a net saving of the resource overall". Key unchanged.
2. rc-hard.json, passage 4 (payments), last paragraph: "Critics will object that they undermine ..." had an unclear antecedent for "they". Changed to "such features undermine". No question affected.
3. rc-medium.json, passage 1 (money habits), TRUE question: distractor "Credit cards charge interest only when a payment is more than a month late" was arguably consistent with "repaid within a month" and "interest on unpaid balances", so a careful candidate could hesitate over it. Replaced by a distractor that plainly contradicts "high interest" (cards "charge only modest interest"). Key unchanged.
4. rc-medium.json, passage 3 (heat island), NOT-true question: two true options added words not in the passage ("from the harsh summer sun", "during the hot summer months"), inviting a challenge that they are "not stated". Trimmed both to what the passage says. Key unchanged.
5. cloze-medium.json, passage 3, blank 5: distractor "separate" could be defended by a hostile reader as an adjective ("tracks separate from the road"), although "by a low wall" requires the participle. Replaced the distractor with "separates" (clearly ungrammatical). Key ("separated") unchanged.
6. (Counted with 1-5) No other edits.

## Items I hesitated over and kept (judged fine)
- cloze-hard-003 blank 5: "however" vs "therefore"/"otherwise". "Therefore" does not follow from the preceding sentence and "otherwise" is ungrammatical with "unless", so one answer stands.
- cloze-hard-004 blank 5: "weary" is grammatical with "of" but means "tired of", which contradicts the sense; only "wary" fits.
- rc-hard-003 Q on weakest rebound (workshop lighting): inference by analogy with the passage's "room already at a comfortable temperature" example; every other option describes a case of expanding demand, so the key is unique.
- rc-hard-002 inference on early years: distractor "gains usually larger than in later years" has no passage support; "genuine gains" key is stated in the text.
- rc-hard-001 may-be-true question: key (honest classification may show lower profits for a time) follows from "recognising a bad loan means admitting a loss"; every other option is unsupported or absolute.

## Checks that passed
- Every vocabulary target word appears in its passage and is not among its options; antonym lists contain no synonym of the target that could also pass.
- NOT-true stems keep NOT in capitals; no option cites other options; no real people, companies or statistics.
- Hard passages 390-404 words, medium 264-302 words; every passage has 9-10 questions.
- Key positions and key-is-longest shares within limits (builder output: longest-option share 8-17%).
- Explanations do not cite option letters and agree with the keys.

## Confidence
High (about 93-95 percent) that no remaining question has a wrong or ambiguous key. The authors' keys matched my independent blind answers on all 121 questions, and the six edits only removed wording risks. Residual risk is concentrated in the hard cloze connectors/adjectives noted above and in the three "most likely"/analogy inference items, which are defensible but are the places a challenger would try first. Hard cloze distractors are mostly easy to eliminate (low difficulty rather than a correctness risk).
