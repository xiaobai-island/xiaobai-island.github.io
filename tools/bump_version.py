"""发布前运行：给 index.html 里的 css / js 链接换上新版本号，避免浏览器用缓存里的旧文件。

GitHub Pages 默认让浏览器缓存 10 分钟，不换版本号的话，新页面可能配上旧脚本。
用法: python3 tools/bump_version.py
"""
import re
import time
from pathlib import Path

index = Path(__file__).resolve().parent.parent / "index.html"
v = time.strftime("%Y%m%d%H%M%S")
html, n = re.subn(r'((?:href|src)="(?:style\.css|config\.js|app\.js))(?:\?v=\w+)?"', rf'\1?v={v}"', index.read_text())
index.write_text(html)
print(f"已更新 {n} 个链接，版本号 {v}")
