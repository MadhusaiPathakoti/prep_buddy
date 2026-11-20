"""Extract one image per entry as a compact WebP. Reads xrefs by re-running band logic (kept in sync with parse_text.py)."""
import fitz, json, re, os, sys
from PIL import Image

PDF = r"C:\Users\madhu\Downloads\Mnemonic_Vocabulary_1-1018.pdf"
OUT = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(OUT, "imgs")
os.makedirs(IMG_DIR, exist_ok=True)
WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 480
QUALITY = int(sys.argv[2]) if len(sys.argv) > 2 else 72

doc = fitz.open(PDF)
total = 0
count = 0
bad = []
for pno in range(1, len(doc)):
    page = doc[pno]
    heads = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            for s in l["spans"]:
                if s["color"] == 0x1d1f33 and re.fullmatch(r"\d+", s["text"].strip()):
                    heads.append((l["bbox"][1], int(s["text"].strip())))
    heads.sort()
    imgs = [i for i in page.get_image_info(xrefs=True) if not (i["width"] == 256 and i["height"] == 256)]
    for i, (y, n) in enumerate(heads):
        top = y - 14
        bottom = (heads[i + 1][0] - 14) if i + 1 < len(heads) else 800
        mine = [im for im in imgs if top <= (im["bbox"][1] + im["bbox"][3]) / 2 < bottom]
        if len(mine) != 1:
            bad.append(n)
            continue
        xref = mine[0]["xref"]
        pix = fitz.Pixmap(doc, xref)
        info = doc.extract_image(xref)
        if info.get("smask"):
            pix = fitz.Pixmap(pix, fitz.Pixmap(doc, info["smask"]))
        if pix.colorspace is None or pix.colorspace.n != 3 or pix.alpha:
            base = fitz.Pixmap(fitz.csRGB, pix) if not pix.alpha else pix
            pix = fitz.Pixmap(fitz.csRGB, base) if base.n != 3 else base
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        if img.width > WIDTH:
            img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
        path = os.path.join(IMG_DIR, f"{n}.webp")
        img.save(path, "WEBP", quality=QUALITY, method=6)
        total += os.path.getsize(path)
        count += 1
print("saved", count, "total MB", round(total / 1e6, 1), "avg KB", round(total / max(count, 1) / 1024, 1), "bad", bad)
