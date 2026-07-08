"""LINE リッチメニュー画像生成 (2500x1686, 2x2)。
アイコンは PIL のプリミティブで描画（絵文字だと環境依存で欠ける）。"""
from PIL import Image, ImageDraw, ImageFont
import os
import math

W, H = 2500, 1686
BG_A = (17, 55, 33)
BG_B = (28, 88, 54)
LINE = (255, 255, 255, 60)
TILE_BG = (255, 255, 255, 245)
TILE_ACCENT = (23, 128, 82)
TILE_ACCENT_LIGHT = (144, 197, 168)
TILE_SUB = (110, 130, 118)
TILE_TEXT = (25, 45, 32)

FONT_BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc"
FONT_MED = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_LIGHT = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"


def load(p, s):
    return ImageFont.truetype(p, s)


def gradient_bg():
    img = Image.new("RGB", (W, H), BG_A)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(BG_A[0] * (1 - t) + BG_B[0] * t)
        g = int(BG_A[1] * (1 - t) + BG_B[1] * t)
        b = int(BG_A[2] * (1 - t) + BG_B[2] * t)
        d.line([(0, y), (W, y)], fill=(r, g, b))
    return img


def draw_clock(d, cx, cy, size, color):
    r = size // 2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=18)
    # 12 時マーカー
    d.ellipse((cx - 12, cy - r + 8, cx + 12, cy - r + 32), fill=color)
    # 針: 短針 (12→2方向)、長針 (12→12)
    d.line((cx, cy, cx + int(r * 0.45), cy - int(r * 0.15)), fill=color, width=22)
    d.line((cx, cy, cx, cy - int(r * 0.72)), fill=color, width=22)
    d.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=color)


def draw_edit(d, cx, cy, size, color):
    # 書類 + えんぴつ
    w = int(size * 0.7)
    h = int(size * 0.9)
    x0, y0 = cx - w // 2, cy - h // 2
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=24, outline=color, width=16)
    # 罫線
    for i, dy in enumerate((h // 4, h // 2, h * 3 // 4)):
        end = x0 + w - 40 - (30 if i == 2 else 0)
        d.line((x0 + 40, y0 + dy, end, y0 + dy), fill=color, width=12)
    # 右上の折り返し
    d.polygon((x0 + w - 60, y0, x0 + w, y0 + 60, x0 + w - 60, y0 + 60), fill=color)
    # えんぴつ (右下から)
    px1, py1 = cx + int(w * 0.35), cy + int(h * 0.15)
    px2, py2 = cx + int(w * 0.65), cy + int(h * 0.45)
    d.line((px1, py1, px2, py2), fill=color, width=32)
    d.polygon((
        (px2 - 20, py2 - 5), (px2 + 25, py2 + 25), (px2 - 5, py2 - 20),
    ), fill=color)


def draw_doc(d, cx, cy, size, color):
    w = int(size * 0.72)
    h = int(size * 0.9)
    x0, y0 = cx - w // 2, cy - h // 2
    corner = 80
    # 書類本体
    pts = [
        (x0, y0),
        (x0 + w - corner, y0),
        (x0 + w, y0 + corner),
        (x0 + w, y0 + h),
        (x0, y0 + h),
    ]
    d.polygon(pts, outline=color, fill=None)
    # 太い輪郭のため線でトレース
    for i in range(len(pts)):
        d.line((pts[i], pts[(i + 1) % len(pts)]), fill=color, width=16)
    # 折れ角
    d.line((x0 + w - corner, y0, x0 + w - corner, y0 + corner), fill=color, width=16)
    d.line((x0 + w - corner, y0 + corner, x0 + w, y0 + corner), fill=color, width=16)
    # 罫線
    for dy in (int(h * 0.42), int(h * 0.58), int(h * 0.74)):
        end = x0 + w - 60
        d.line((x0 + 60, y0 + dy, end, y0 + dy), fill=color, width=12)


def draw_home(d, cx, cy, size, color):
    w = int(size * 0.9)
    h = int(size * 0.85)
    x0 = cx - w // 2
    y0 = cy - h // 2 + int(h * 0.12)
    roof_h = int(h * 0.48)
    # 屋根
    d.polygon(
        [
            (cx, y0 - roof_h + int(h * 0.12)),
            (x0 + w + 40, y0 + int(h * 0.05)),
            (x0 - 40, y0 + int(h * 0.05)),
        ],
        outline=color,
        fill=None,
    )
    for a, b in (
        ((cx, y0 - roof_h + int(h * 0.12)), (x0 + w + 40, y0 + int(h * 0.05))),
        ((cx, y0 - roof_h + int(h * 0.12)), (x0 - 40, y0 + int(h * 0.05))),
        ((x0 - 40, y0 + int(h * 0.05)), (x0 + w + 40, y0 + int(h * 0.05))),
    ):
        d.line((a, b), fill=color, width=18)
    # 家本体
    d.rounded_rectangle((x0 + 30, y0 + int(h * 0.05), x0 + w - 30, y0 + h - 20), radius=8, outline=color, width=18)
    # ドア
    dw = int(w * 0.22)
    dh = int(h * 0.42)
    dx = cx - dw // 2
    dy = y0 + h - 20 - dh
    d.rounded_rectangle((dx, dy, dx + dw, y0 + h - 20), radius=8, outline=color, width=16)


ICON_DRAWERS = {
    "clock": draw_clock,
    "edit": draw_edit,
    "doc": draw_doc,
    "home": draw_home,
}


def draw_tile(canvas, cx, cy, w, h, title, sub, icon_name):
    tile = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    pad = 40
    td.rounded_rectangle([pad, pad, w - pad, h - pad], radius=48, fill=TILE_BG)

    icon_center_y = int(h * 0.32)
    ICON_DRAWERS[icon_name](td, w // 2, icon_center_y, 320, TILE_ACCENT)

    title_font = load(FONT_BOLD, 180)
    tb = td.textbbox((0, 0), title, font=title_font)
    tw = tb[2] - tb[0]
    th = tb[3] - tb[1]
    tx = (w - tw) // 2 - tb[0]
    ty = int(h * 0.62) - th // 2 - tb[1]
    td.text((tx, ty), title, font=title_font, fill=TILE_TEXT)

    sub_font = load(FONT_LIGHT, 58)
    sb = td.textbbox((0, 0), sub, font=sub_font)
    sw = sb[2] - sb[0]
    sh = sb[3] - sb[1]
    sx = (w - sw) // 2 - sb[0]
    sy = int(h * 0.83) - sh // 2 - sb[1]
    td.text((sx, sy), sub, font=sub_font, fill=TILE_SUB)

    canvas.paste(tile, (cx, cy), tile)


def main():
    img = gradient_bg().convert("RGBA")
    cw, ch = W // 2, H // 2
    tiles = [
        (0, 0, "打刻", "出勤・退勤", "clock"),
        (cw, 0, "残業申請", "事前・事後どちらもOK", "edit"),
        (0, ch, "日報", "今日の日報を書く", "doc"),
        (cw, ch, "ホーム", "アプリを開く", "home"),
    ]
    for x, y, title, sub, ic in tiles:
        draw_tile(img, x, y, cw, ch, title, sub, ic)

    d = ImageDraw.Draw(img, "RGBA")
    d.line([(cw, 20), (cw, H - 20)], fill=LINE, width=6)
    d.line([(20, ch), (W - 20, ch)], fill=LINE, width=6)

    brand_font = load(FONT_MED, 44)
    brand = "株式会社ニナウ 勤怠アプリ"
    bb = d.textbbox((0, 0), brand, font=brand_font)
    bw = bb[2] - bb[0]
    d.text(((W - bw) // 2 - bb[0], H - 90), brand, font=brand_font, fill=(255, 255, 255, 200))

    out = os.path.join(os.path.dirname(__file__), "richmenu.png")
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
