#!/usr/bin/env python3
# 增量处理：raw_cards/card_*.png -> clean/card_*.jpg（方图、240px、q82）
import os, glob
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "assets", "raw_cards")
OUT = os.path.join(HERE, "assets", "clean")
os.makedirs(OUT, exist_ok=True)
SIZE = 240

files = sorted(glob.glob(os.path.join(RAW, "card_*.png")))
n = 0
for f in files:
    key = os.path.splitext(os.path.basename(f))[0]  # card_70 / card_ruby_orevein
    im = Image.open(f).convert("RGB")
    w, h = im.size
    # 去掉右下角「AI生成」水印带：裁掉底部 10%
    im = im.crop((0, 0, w, int(h * 0.90)))
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(os.path.join(OUT, key + ".jpg"), "JPEG", quality=82, optimize=True)
    n += 1
print(f"processed {n} card images -> {OUT} ({SIZE}px q82)")
