"""从房子素材里找出窗户（浅蓝色玻璃），生成夜晚亮灯的叠加图 assets/houses/house-N-lit.webp

窗户 = 偏蓝的小块；屋顶、遮阳棚也是蓝色，但面积大或是细长条，按连通块的面积和形状排除。
用法：python3 tools/make_night_lights.py [--debug]（--debug 额外输出 /tmp/lit-debug.png 检查识别结果）
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
HOUSES = sorted((ROOT / "assets/houses").glob("house-[0-9].webp"))

MIN_AREA, MAX_AREA = 18, 450
MAX_SIDE = 34
MAX_ASPECT = 4.6
MIN_FILL = 0.4
WARM = np.array([255, 205, 110])
CORE = np.array([255, 244, 200])


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        pts = []
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        yield np.array(pts)


def windows(rgba):
    r, g, b, a = (rgba[..., i].astype(int) for i in range(4))
    glass = (b > r + 45) & (b >= g - 5) & (a > 200) & (b > 140)
    keep = np.zeros_like(glass)
    for pts in components(glass):
        ys, xs = pts[:, 0], pts[:, 1]
        bh, bw = np.ptp(ys) + 1, np.ptp(xs) + 1
        area = len(pts)
        if not MIN_AREA <= area <= MAX_AREA or max(bh, bw) > MAX_SIDE:
            continue
        if max(bh, bw) / min(bh, bw) > MAX_ASPECT or area / (bh * bw) < MIN_FILL:
            continue
        keep[ys, xs] = True
    return keep


def lit_overlay(rgba, win):
    h, w = win.shape
    m = Image.fromarray((win * 255).astype("uint8"))
    # 窗内：越靠中心越亮；窗外：一圈暖色光晕
    inner = np.asarray(m.filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255 * win
    glow = np.asarray(m.filter(ImageFilter.GaussianBlur(7))).astype(float) / 255
    out = np.zeros((h, w, 4))
    t = np.clip(inner * 1.4, 0, 1)[..., None]
    out[..., :3] = WARM * (1 - t) + CORE * t
    alpha = np.maximum(win * 0.96, np.clip(glow * 1.6, 0, 0.7))
    # 光晕只落在房子本身上，不往透明背景外溢（外溢的光由 CSS drop-shadow 负责）
    alpha *= rgba[..., 3] / 255
    out[..., 3] = alpha * 255
    return Image.fromarray(out.astype("uint8"), "RGBA")


def main():
    debug = []
    for p in HOUSES:
        im = Image.open(p).convert("RGBA")
        rgba = np.asarray(im)
        win = windows(rgba)
        lit = lit_overlay(rgba, win)
        dst = p.with_name(p.stem + "-lit.webp")
        lit.save(dst, "WEBP", quality=80, method=6)
        print(f"{dst.name}: {int(win.sum())} 个窗户像素, {dst.stat().st_size // 1024}KB")
        if "--debug" in sys.argv:
            dark = Image.fromarray((rgba * [0.3, 0.3, 0.4, 1]).astype("uint8"), "RGBA")
            dark.alpha_composite(lit)
            debug.append(dark)
    if debug:
        sheet = Image.new("RGBA", (sum(d.width for d in debug), max(d.height for d in debug)), (20, 24, 40, 255))
        x = 0
        for d in debug:
            sheet.alpha_composite(d, (x, 0))
            x += d.width
        sheet.save("/tmp/lit-debug.png")


if __name__ == "__main__":
    main()
