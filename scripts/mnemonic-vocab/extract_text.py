"""Parse the PDF text into entries.json (+ image xref per entry). Classifies spans by font + colour."""
import fitz, json, re, os

PDF = r"C:\Users\madhu\Downloads\Mnemonic_Vocabulary_1-1018.pdf"
OUT = os.path.dirname(os.path.abspath(__file__))
HINDI_COLORS = {0xa8245a, 0x25336a, 0x5b2fa6, 0xb8500f, 0x1b7342, 0xb6e63, 0xa52727, 0x175c99}

doc = fitz.open(PDF)
entries = {}
anomalies = []


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


for pno in range(1, len(doc)):
    page = doc[pno]
    spans = []  # (y0, x0, span)
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                if s["text"].strip():
                    spans.append((l["bbox"][1], l["bbox"][0], s))
    heads = sorted((y, int(s["text"].strip())) for y, x, s in spans if s["color"] == 0x1d1f33 and re.fullmatch(r"\d+", s["text"].strip()))
    bands = []
    for i, (y, n) in enumerate(heads):
        bands.append((y - 14, (heads[i + 1][0] - 14) if i + 1 < len(heads) else 800, n))
    imgs = [i for i in page.get_image_info(xrefs=True) if not (i["width"] == 256 and i["height"] == 256)]

    for top, bottom, n in bands:
        mine = sorted([t for t in spans if top <= t[0] < bottom], key=lambda t: (round(t[0]), t[1]))
        e = {"n": n, "page": pno + 1, "word": "", "pron": "", "pos": "", "hindi": [], "meaning": [], "trick": [], "syn": [], "ant": [], "example": []}
        # label rows decide which row of chips is synonyms vs antonyms
        syn_y = ant_y = None
        for y, x, s in mine:
            if s["text"].strip() == "SYNONYMS":
                syn_y = y
            elif s["text"].strip() == "ANTONYMS":
                ant_y = y
        for y, x, s in mine:
            t = s["text"].strip()
            font, color = s["font"], s["color"]
            if t in ("TRICK", "SYNONYMS", "ANTONYMS", "EXAMPLE") and color == 0xffffff:
                continue
            if color == 0x1d1f33:
                continue  # card number
            if font == "Poppins-Bold" and color == 0xffffff:
                e["word"] += (" " if e["word"] else "") + t
            elif "Italic" in font and color == 0xffe7a3:
                e["pron"] += t
            elif "Medium" in font and color == 0xffffff:
                e["pos"] += t
            elif font == "Poppins-Bold" and color in HINDI_COLORS:
                e["hindi"].append(t)
            elif color == 0x363948:
                e["meaning"].append(t)
            elif color == 0x1f2130:
                e["trick"].append(t)
            elif color == 0x24263a:
                e["example"].append(t)
            elif color == 0x0e6539:
                e["syn"].append(t)
            elif color == 0x9e1f2e:
                e["ant"].append(t)
            elif color in (0x666673, 0x0d0d1a, 0x3f3f4c):
                pass  # watermark / footer
            else:
                anomalies.append((n, "unclassified", t, hex(color), font))
        for k in ("hindi", "meaning", "trick", "example"):
            e[k] = clean(" ".join(e[k]))
        e["pron"] = clean(e["pron"]).strip("/ ").strip()
        e["pos"] = clean(e["pos"])
        e["word"] = clean(e["word"])
        e["syn"] = [clean(x) for x in e["syn"]]
        e["ant"] = [clean(x) for x in e["ant"]]
        im = [i for i in imgs if top <= (i["bbox"][1] + i["bbox"][3]) / 2 < bottom]
        e["_xref"] = im[0]["xref"] if len(im) == 1 else None
        if len(im) != 1:
            anomalies.append((n, "image count", len(im)))
        if n in entries:
            anomalies.append((n, "duplicate number", pno + 1))
        entries[n] = e

print("entries:", len(entries), "min", min(entries), "max", max(entries))
print("missing numbers:", [i for i in range(1, 1019) if i not in entries])
for field in ("word", "pron", "pos", "hindi", "meaning", "trick", "example"):
    bad = [n for n, e in entries.items() if not e[field]]
    print(f"empty {field}: {len(bad)}", bad[:40])
for field in ("syn", "ant"):
    from collections import Counter
    print(field, "count distribution:", Counter(len(e[field]) for e in entries.values()))
    bad = [n for n, e in entries.items() if len(e[field]) < 2]
    print("  <2:", [(n, entries[n][field]) for n in bad[:10]])
print("anomalies:", len(anomalies), anomalies[:20])
with open(os.path.join(OUT, "entries.json"), "w", encoding="utf-8") as f:
    json.dump([entries[n] for n in sorted(entries)], f, ensure_ascii=False, indent=1)
