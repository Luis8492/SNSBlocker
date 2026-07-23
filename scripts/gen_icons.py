# -*- coding: utf-8 -*-
# SNSQuizLocker のアイコン生成（16/32/48/128px）。
# デザイン: UIの判子バッジと同じ意匠 — ノート白地の角丸四角＋青磁の枠＋「Q」
# （将来的な英語圏展開を考え、拡張機能アイコンはラテン文字にしている）。
# 512px で描いて LANCZOS で縮小し、小サイズでも輪郭を保つ。
# 使い方: python scripts/gen_icons.py  （リポジトリルートで実行。extension/icons/ に出力）
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "extension", "icons")
os.makedirs(OUT, exist_ok=True)

BG = (253, 253, 251, 255)      # --k-card（ノート白）
ACCENT = (71, 128, 110, 255)   # --k-accent（青磁）
CHAR = "Q"
FONT = r"C:\Windows\Fonts\YuGothB.ttc"

S = 512  # 描画キャンバス
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

margin = int(S * 0.04)
radius = int(S * 0.18)
border = int(S * 0.075)

# 角丸四角: 白地＋青磁の枠
d.rounded_rectangle(
    [margin, margin, S - margin, S - margin],
    radius=radius, fill=BG, outline=ACCENT, width=border,
)

# 「Q」を中央に（アンカー mm。視覚中心にわずかに上げる。ラテン1文字なので大きめ）
font = ImageFont.truetype(FONT, int(S * 0.70))
d.text((S / 2, S / 2 - int(S * 0.02)), CHAR, font=font, fill=ACCENT, anchor="mm")

for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, "icon%d.png" % size))
    print("icons/icon%d.png" % size)
print("done")
