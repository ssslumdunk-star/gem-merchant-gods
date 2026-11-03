#!/usr/bin/env python3
# 幂等注入：把 assets/clean/card_*.jpg 以 base64 加进 index.html 的 ASSET_IMG 对象
import os, glob, base64, re

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "index.html")
CLEAN = os.path.join(HERE, "assets", "clean")

src = open(HTML, encoding="utf-8").read()
start = src.index("const ASSET_IMG={")
end = src.index("};", start)  # base64 无 }，首个 }; 即对象闭合
obj = src[start:end]

# 清掉旧的 card_ 条目（幂等）
obj = re.sub(r",?card_[A-Za-z0-9_]+:'data:image/jpeg;base64,[^']*'", "", obj)

entries = []
for f in sorted(glob.glob(os.path.join(CLEAN, "card_*.jpg"))):
    key = os.path.splitext(os.path.basename(f))[0]
    b64 = base64.b64encode(open(f, "rb").read()).decode()
    entries.append(f",{key}:'data:image/jpeg;base64,{b64}'")

new_obj = obj + "".join(entries)
src = src[:start] + new_obj + src[end:]
open(HTML, "w", encoding="utf-8").write(src)
print(f"injected {len(entries)} card images into ASSET_IMG")
