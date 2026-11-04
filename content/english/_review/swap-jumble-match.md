# Review log: word-swap, para-jumble, match-column (hard + medium)

Method: blind pass first (every question solved from the blind views, all 16 begin/end combinations tested for match-column, every pair swap tested for word-swap, alternative orders and every possible asked position tested for para-jumble), then compared with the authors' keys.

Important finding about the app: para-jumble distractor orders are one-move perturbations of the key (adjacent swaps, moves, reversed pairs) and the asked position in position-variant questions is random (any of 1-5 / 1,3,4,5,6), so EVERY sentence must be locked in place. An adjacent pair that merely reads "better" one way is a defect even if the order option happens to be absent from one particular build.

## Blind-pass agreement

All 76 keys (16+16 word-swap, 14+14 para-jumble, 8+8 match-column) matched my independent answers; no key was wrong. Defects are therefore about second defensible answers (para-jumble) and naturalness (two word-swap items), not wrong keys.

## Defects found and fixes

### word-swap-hard.json
- Item 12: "its proportions had been resolved with great care" after "restraint with which" gave a clumsy double "with" and a debatable use of "resolved". Rewrote to "restraint of its proportions, which had been calculated with great care" (marked word now "calculated"). Re-checked: the only single interchange restoring it is lay/calculated.
- Item 16: "a cost far greater than that of honesty in the first place" was loose ("cost of honesty"). Changed the noun to "vigilance" (marked word updated, explanation updated).
- All other items: key unique, no other pair swap or no-interchange gives a correct sentence. Items 4 and 9 (no interchange) verified flawless.

### word-swap-medium.json
- No defects. Items 3 and 6 (no interchange) verified: every other pair swap yields nonsense or a contradiction.

### para-jumble-hard.json (all 14 authors' orders were my orders; the defects were competing orders)
- Item 1: "such authorities" in the last sentence could attach to the opening sentence, allowing F B C D A E. Changed to "such teachers" (only the teacher sentence supplies it).
- Item 2: opener could be the definition sentence, and the "concept" sentence could precede it. Definition now says "best alternative thus forgone ... that decision" (needs the opener); "The concept" became "This true price" (needs the definition).
- Item 3: B ("disappearance of one modest predator thus unravels ...") could precede the "forests reduced to bare rock" sentence (ADFBEC). B now ends "of its shelter", which only reads after the sentence about forests sheltering fish.
- Item 4: "The workers who gained were, however ..." could precede the looms sentence and the retraining sentence could precede the "mismatch" sentence. Gave them "gained from this growth" and "tackle this cause of hardship" so each depends on its predecessor.
- Item 5: the "by contrast" sentence could directly follow the premise (A D B C E) and the example sentence could open the paragraph. Added "for instance", "by contrast with such a vaccinated population" and "such traceable recoveries".
- Item 6: the "format of assessment is therefore ..." sentence could directly follow the opener (C E D B A) and D/B could be reordered around it. Now "Either way, ..." (needs both illustrations), D reads "Where they reward ..." (needs "Examinations"), and the last sentence says "that format".
- Item 7: second sentence could open (B C D E A), the later-change sentence could precede it (C D B E A), and the conclusion could precede the "older view" sentence (C B D A E). Added "by contrast" to the ancient-writers sentence, "abandon that backward gaze" to the later-change sentence, and "the return of the older view" to the conclusion.
- Item 8: "The outcome is not the result of individual wickedness ..." could precede the "no single member ever intended it" sentence (A F B C E D), and the herder example could follow the conclusion. Now "That lack of intent is no accident; ..." and "In a common pasture, for instance, ...".
- Item 9: the comparison sentence could attach to the second sentence only loosely and the "narrowed" sentence could precede the "works less well" sentence. Now "This comparison works well ..." and "users ... may therefore find ...".
- Item 10: the "decline is disguised" sentence could be second or fourth, the fisherman sentence could open, and the records sentence could precede it. Added "for instance", "neither the fisherman nor ..." (later reworded to "the poorer sea inherited at each stage"), and "the comparison that such disguised decline removes". All asked positions are now determined.
- Item 11: the traveller sentence could open or follow later; "They are also fragile" had an ambiguous "They". Added "for example" and "That cooperation is also fragile".
- Item 12: the conclusion could slot in before the patterns sentences. Conclusion now "since new theories and new notation advanced hand in hand".
- Item 13: survivors/"repeated exposure" and "misuse"/"prescribing" pairs could each be swapped (e.g. F D A, B D). Now "selects for that resistance", "accelerates this selection" and "the remedy for such misuse".
- Item 14: encounters/density sentences could swap (C F D B E A). The density sentence now says "sets cities apart from such isolated places".

### para-jumble-medium.json
- Item 5 (sleep): "Over a longer period ... lack of sleep can also weaken" could precede the "fewer hours" sentence. Now "such a shortage of sleep".
- Item 8 (onions): the traders sentence could precede the family sentence. Now "... fallen as more households cut back in the same way".
- Item 9 (forecasts): storm-warning sentence could precede the farmers sentence. Now "Beyond this routine planning, ...".
- Item 10 (rainwater): "Therefore, experts urge ..." could be placed before the water-uses sentences. Now "... following the example of those societies".
- Item 11 (hand washing): advice sentence could precede the soap sentence (C D A B E). Advice now ends "so that the soap has time to do this work".
- Item 12 (translation): "To overcome this difficulty" could precede the "Such words" sentence. Now "this difficulty of neat translation".
- Item 14 (online lessons): "Teachers who have tried this arrangement" could precede the pupils-watch sentence. Now "seen pupils use the recordings in this way".
- Items 1, 2, 3, 4, 6, 7, 13: checked every adjacent pair and every asked position; no change needed.

### match-column-hard.json
- Item 8: two of the four sentences were about the new phone (reviews / battery), against the "different things" rule. Reviews ending changed to "the new novel was sold out in every bookshop." Matching still unique (battery "Provided ... charged overnight" needs the present-tense phone ending).
- All 16 combinations tested for items 1-7: unique complete matching. No change.

### match-column-medium.json
- No defects. All eight items have a unique complete matching (they are easy, which suits Clerk).

## Totals

- Items reviewed: 76 (word-swap 32, para-jumble 28, match-column 16).
- Items with a defect: 24 (word-swap 2, para-jumble 21 [hard 14 of 14, medium 7 of 14], match-column 1). Wrong keys: 0 (the para-jumble defects were second defensible orders/positions, not wrong keys).
- Fixed by rewriting: 24. Deleted: 0.
- Counts after edits: word-swap 16/16 (min 12), para-jumble 14/14 (min 10), match-column 8/8 (min 6).
- build-english-seed.ts --blind: clean for these files (only the standing warning that match-column files have under 10 questions, so key-position rules are not enforced; the build currently puts the hard match-column key on E for 5 of 8 items, which is app-built, not authored).

## Confidence

- Word-swap: very high (96%+). Each item's reversal is the only interchange that gives a fully correct sentence; no-interchange items were tested against every pair.
- Match-column: very high (97%+). Complete matchings are forced by structure (inversion, lest, the more ... the more, tense/number).
- Para-jumble: high (about 90%). Every sentence now carries an explicit dependency on its predecessor, but para-jumble is inherently the most open to a determined challenger, especially hard items 3, 8 and 10, which I would re-read once more if time allows.
