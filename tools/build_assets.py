"""生成线上用的多档底图、模糊占位图，并把房子 / 船缩到够用的尺寸。

用法: python3 tools/build_assets.py   （在 slice_sprites.py 之后运行）
"""
import base64
import io
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"

MAP_WIDTHS = [1600, 2400, 3200]
MAP_QUALITY = 80
# 在 2560 宽的 2 倍屏上，房子显示约 112 × 2.5 × 2 = 560 物理像素，取 560 足够清晰
SPRITE_MAX = {"houses": 560, "boats": 400, "clouds": 900}
SPRITE_QUALITY = 78


def main():
    src = Image.open(A / "raw" / "map-hd.png").convert("RGB")
    for w in MAP_WIDTHS:
        h = round(src.height * w / src.width)
        out = A / f"map-bg-{w}.webp"
        src.resize((w, h), Image.LANCZOS).save(out, quality=MAP_QUALITY, method=6)
        print(f"{out.name}  {w}x{h}  {out.stat().st_size // 1024}KB")

    # 48px 宽的占位图，直接内嵌进 HTML，打开瞬间就有岛的轮廓
    tiny = src.resize((48, round(src.height * 48 / src.width)), Image.LANCZOS)
    buf = io.BytesIO()
    tiny.save(buf, "WEBP", quality=60)
    uri = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    index = ROOT / "index.html"
    html, n = re.subn(r'--lqip: url\("[^"]*"\)', f'--lqip: url("{uri}")', index.read_text())
    if n != 1:
        raise SystemExit("index.html 里没找到 --lqip 占位图变量")
    index.write_text(html)
    print(f"占位图已写入 index.html  {len(uri)} 字符")

    for folder, max_w in SPRITE_MAX.items():
        for f in sorted((A / folder).glob("*.webp")):
            im = Image.open(f)
            if im.width > max_w:
                im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
            im.save(f, quality=SPRITE_QUALITY, method=6)
            print(f"{folder}/{f.name}  {im.width}x{im.height}  {f.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
