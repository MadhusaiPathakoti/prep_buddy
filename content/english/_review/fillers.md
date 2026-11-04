# Fillers review (fillers-hard.json, fillers-medium.json)

Method: blind solve of every option / word-pair from the blind views first (scratch notes outside the repo), then comparison with the authors' keys.

Result of blind pass: my single best answer agreed with the authors' key on all 36 items. No item had a second acceptable option or no acceptable option on a strict reading. Several items were softened or hardened below because a hostile challenger could argue a distractor.

## Defects / risks and actions

| File | Item | Problem | Action |
|---|---|---|---|
| fillers-hard | 8 (milder, consequently) | Distractor "milder, nevertheless" was arguable: "milder than feared" could still be read as high inflation, so a contrastive link could be defended. Weak but real challenge risk. | Fixed: added "which eased pressure on household budgets" after the first clause, so a contrastive link and "harsher" are both clearly wrong. All five pairs re-tested. |
| fillers-hard | 18 (hailed, argued) | Distractor "hailed, denied" relied on a double negative ("denied that it had settled none"), which is confusing and arguable; "lamented as a vindication" was wrong mainly on idiom. | Fixed: sentence now reads "...hailed as a complete vindication of the company by those who had defended it, though its critics argued that the underlying questions remained unanswered." Every other pair is now clearly absurd (defenders cannot lament their own vindication; critics do not deny/boast). Explanation rewritten. All five pairs re-tested. |
| fillers-medium | 7 (good, relax) | Distractor "good, relaxing" ("helps relaxing the mind") is wrong in standard English but "help + -ing" appears in some informal usage, so a challenger could argue it. | Fixed: replaced the pair with "good, relaxed" (clearly ungrammatical). Key unchanged. |

## Items checked and found sound (no change)
- hard 1-7, 9-17: single best answer matches key; every distractor definitely wrong by sense, idiom or grammar. Hard 11 (ease, compound) and hard 5 (familiarity, offset) re-tested pair by pair: airtight.
- hard 13 (assumption): airtight but a word-form item, easier than typical PO level. Kept.
- medium 2 (record, uncertain): airtight (a bright/secure/certain future gives no reason to withhold a bonus).
- medium 12 (reduces, provides): airtight; no other pair has both consistent agreement and sense, so even the plural-subject objection cannot be raised.
- medium 1, 3-6, 8-11, 13-18: airtight; several are very easy (Clerk level), not defects.

## Totals
- Items reviewed: 36 (hard 18, medium 18)
- Key disagreements with the authors: 0
- Items with a defensible-distractor risk found: 3
- Fixed: 3. Deleted: 0. Replacements written: 0.
- Final counts: hard 18 (11 single / 7 double), medium 18 (11 single / 7 double). Authored correctIndex spread 4/4/4/3/3 and 4/5/3/3/3.
- `npx tsx scripts/build-english-seed.ts --blind`: no errors for either file. Note: the "key positions" column printed by the builder (after the app's shuffle) shows 8 of 18 keys on one letter for each file; that is the app's shuffle output, authored indexes are well spread.

## Confidence
About 95% that the remaining items are flawless (single defensible key). Residual risk is limited to the unavoidable chance that a challenger disputes the idiom in hard 15 ("lip service") or the banking sense of "sanction" in medium 11, both of which are standard and I judge indisputable.
