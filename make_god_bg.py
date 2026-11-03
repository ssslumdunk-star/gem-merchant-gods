#!/usr/bin/env python3
"""把 AI 生成的神祇背景图裁水印 + 压成 webp + 内联进 index.html 的 ASSET_IMG。

用法:
  python3 make_god_bg.py <god_id> <源图片路径>

例如:
  python3 make_god_bg.py zeus assets/god_bg_raw/Epic_...png

处理:
  1) 裁掉底部 90px(去掉右下角「AI生成」水印), 画面缩放成 1536x934 (与 bg_hall 同画幅)
  2) 存成 assets/god_bg/<god_id>.webp (quality 自动降到 <190KB)
  3) 以 data URI 形式插入 index.html 的 ASSET_IMG, 键名 bg_<god_id>
"""
import base64
import os
import re
import sys

from PIL import Image

W, H = 1536, 934          # 与 bg_hall 同画幅
CROP_BOTTOM = 90          # 去掉右下角水印所在的底部条
MAX_KB = 190              # 单张体积上限
GAME_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(GAME_DIR, "assets", "god_bg_raw")
OUT_DIR = os.path.join(GAME_DIR, "assets", "god_bg")
HTML = os.path.join(GAME_DIR, "index.html")


def process(god_id, src):
    os.makedirs(OUT_DIR, exist_ok=True)
    im = Image.open(src).convert("RGB")
    # 裁底部水印条, 再按目标画幅裁/缩放 (保持中心)
    im = im.crop((0, 0, im.size[0], max(H, im.size[1] - CROP_BOTTOM)))
    if im.size != (W, H):
        # 若裁完比目标大, 取上部 W:H 区域; 若小则直接缩放
        if im.size[0] >= W and im.size[1] >= H:
            im = im.crop((0, 0, W, H))
        else:
            im = im.resize((W, H), Image.LANCZOS)
    out = os.path.join(OUT_DIR, god_id + ".webp")
    for q in (62, 58, 54, 50, 46):
        im.save(out, "WEBP", quality=q, method=6)
        if os.path.getsize(out) / 1024 < MAX_KB:
            break
    kb = os.path.getsize(out) / 1024
    print(f"[{god_id}] {im.size[0]}x{im.size[1]}  {kb:.1f} KB  -> {out}")
    return out


def inline(god_id, webp_path):
    data = base64.b64encode(open(webp_path, "rb").read()).decode()
    uri = "data:image/webp;base64," + data
    key = "bg_" + god_id
    html = open(HTML, encoding="utf8").read()
    # 删除同名旧键(若已存在)
    html = re.sub(re.escape(key) + r"\s*:\s*'data:[^']*',\s*", "", html)
    anchor = "const ASSET_IMG={"
    assert anchor in html, "ASSET_IMG 锚点未找到"
    html = html.replace(anchor, anchor + f"{key}:'{uri}',", 1)
    open(HTML, "w", encoding="utf8").write(html)
    print(f"[{god_id}] 已内联进 index.html  (base64 {len(data)} 字符)")


if __name__ == "__main__":
    gid, src = sys.argv[1], sys.argv[2]
    webp = process(gid, src)
    inline(gid, webp)
