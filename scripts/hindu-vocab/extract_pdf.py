"""Parse The Hindu 1700 Power Words PDF -> entries.json. Columns by x: #(~58) word(~84) pos(~90) meaning(~198) syn(~340) ant(~454) example(~57)."""
import fitz, json, re, os, collections

PDF = r"C:\Users\madhu\Downloads\The_Hindu_1700_Power_Words_Vocabulary_Book.pdf"
OUT = os.path.dirname(os.path.abspath(__file__))
doc = fitz.open(PDF)
entries = {}
anomalies = []


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


for pno in range(4, len(doc)):
    page = doc[pno]
    spans = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                if s["text"].strip():
                    spans.append((l["bbox"][1], s["bbox"][0], s))
    nums = sorted(
        (y, int(s["text"].strip()))
        for y, x, s in spans
        if s["font"] == "Poppins-Bold" and s["color"] == 0xFDE68A and re.fullmatch(r"\d+", s["text"].strip())
    )
    if not nums:
        continue
    for i, (y0, n) in enumerate(nums):
        top = y0 - 14
        bottom = (nums[i + 1][0] - 14) if i + 1 < len(nums) else 10_000
        mine = sorted([t for t in spans if top <= t[0] < bottom], key=lambda t: (round(t[0]), t[1]))
        e = {"n": n, "page": pno + 1, "word": [], "pos": [], "hindi": [], "meaning": [], "syn": [], "ant": [], "example": []}
        for y, x, s in mine:
            t = s["text"].strip()
            size = s["size"]
            font = s["font"]
            if font.startswith("Arial"):
                continue  # big NB watermark / footer logo
            if font == "Poppins-Bold" and s["color"] == 0xFDE68A:
                continue  # the row number
            if font == "Poppins-Bold" and size > 10 and 70 <= x < 190:
                e["word"].append(t)
            elif 70 <= x < 190 and size < 6.5 and size > 5:
                e["pos"].append(t)
            elif 190 <= x < 330 and size > 9:
                e["hindi"].append((y, s["bbox"][0], s["bbox"][2], t))
            elif 190 <= x < 330 and 6.8 < size < 7.36 and abs(size - 7.4) >= 0.06:
                e["meaning"].append(t)
            elif 330 <= x < 450 and abs(size - 7.7) < 0.05:
                e["syn"].append(t)
            elif x >= 450 and abs(size - 7.7) < 0.05:
                e["ant"].append(t)
            elif abs(size - 7.4) < 0.06:
                e["example"].append(t)
            elif size < 6.5 and t.rstrip(".") == "E.G":
                pass
            else:
                anomalies.append((n, "unclassified", t, round(x), round(y), round(size, 1), font))
        hp = []
        prev = None
        for y, x0, x1, t in e["hindi"]:
            if prev and abs(prev[0] - y) < 3 and x0 - prev[2] < 1.2:
                hp[-1] += t  # touching pieces of one Devanagari word
            else:
                hp.append(t)
            prev = (y, x0, x1)
        e["hindi"] = hp
        for k in ("word", "pos", "hindi", "meaning", "example"):
            e[k] = clean(" ".join(e[k]))
        e["meaning"] = re.sub(r"^Refers to:\s*", "", e["meaning"])
        e["syn"] = [clean(x) for x in " ".join(e["syn"]).split(",") if clean(x)]
        e["ant"] = [clean(x) for x in " ".join(e["ant"]).split(",") if clean(x)]
        if n in entries:
            anomalies.append((n, "duplicate", pno + 1))
        entries[n] = e

print("entries", len(entries), "min", min(entries), "max", max(entries))
print("missing:", [i for i in range(1, max(entries) + 1) if i not in entries][:40])
for f in ("word", "pos", "hindi", "meaning", "example"):
    bad = [n for n, e in entries.items() if not e[f]]
    print("empty", f, len(bad), bad[:20])
for f in ("syn", "ant"):
    print(f, collections.Counter(len(e[f]) for e in entries.values()))
print("POS values:", collections.Counter(e["pos"] for e in entries.values()).most_common(25))
print("anomalies", len(anomalies))
for a in anomalies[:25]:
    print("  ", a)
json.dump([entries[n] for n in sorted(entries)], open(os.path.join(OUT, "entries.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("hindi with stray marks:", [(n, e["hindi"]) for n, e in entries.items() if re.search(r"\s[ऀ-ःऺ-ॏ]", e["hindi"])][:10])
print("hindi containing latin:", [(n, e["hindi"]) for n, e in entries.items() if re.search(r"[A-Za-z]", e["hindi"])][:10])
print("odd syn:", [(n, e["word"], e["syn"]) for n, e in entries.items() if len(e["syn"]) != 5][:8])
print("odd ant:", [(n, e["word"], e["ant"]) for n, e in entries.items() if len(e["ant"]) != 5][:8])
for n in (1, 1787, 203):
    print(json.dumps(entries[n], ensure_ascii=False))
