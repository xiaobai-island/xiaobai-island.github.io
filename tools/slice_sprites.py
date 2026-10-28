"""把品红底的素材表切成单个透明 WebP。

用法: python3 tools/slice_sprites.py [素材表路径]
默认输入: assets/raw/sprites-hd.png（三行：房子 / 云 / 船）
输出: assets/houses/house-N.webp, assets/clouds/cloud-N.webp, assets/boats/boat-N.webp
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "raw" / "sprites-hd.png"

# 两种色差阈值之间做软过渡，避免边缘锯齿和品红描边
HARD, SOFT = 80, 160
WEBP_QUALITY = 90


def erode(alpha: np.ndarray) -> np.ndarray:
    out = np.zeros_like(alpha)
    out[1:-1, 1:-1] = np.minimum.reduce(
        [alpha[1:-1, 1:-1], alpha[:-2, 1:-1], alpha[2:, 1:-1], alpha[1:-1, :-2], alpha[1:-1, 2:]]
    )
    return out


def key_out(rgb: np.ndarray, bg: np.ndarray, k: float) -> np.ndarray:
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
    alpha = np.clip((dist - HARD) / (SOFT - HARD), 0, 1)
    a = alpha[..., None]
    # 从半透明像素中减去背景色贡献（去品红溢色）
    safe = np.where(a > 0, a, 1)
    color = np.clip((rgb - (1 - a) * bg) / safe, 0, 255)
    # 边缘一圈内 R、B 同时高于 G 的像素是品红溢色，压回 G；内部不动，保留风车扇叶等粉色
    eroded = alpha
    for _ in range(max(4, round(4 * k))):
        eroded = erode(eroded)
    edge = eroded < 1
    spill = np.clip(np.minimum(color[..., 0], color[..., 2]) - color[..., 1], 0, None)
    color[..., 0] -= np.where(edge, spill, 0)
    color[..., 2] -= np.where(edge, spill, 0)
    # 最外圈几乎都是混色，收窄一点
    shrunk = alpha
    for _ in range(max(1, round(k / 2))):
        shrunk = erode(shrunk)
    alpha = (alpha + shrunk) / 2
    return np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)


def dilate(mask: np.ndarray, n: int) -> np.ndarray:
    for _ in range(n):
        m = mask.copy()
        m[1:] |= mask[:-1]
        m[:-1] |= mask[1:]
        m[:, 1:] |= mask[:, :-1]
        m[:, :-1] |= mask[:, 1:]
        mask = m
    return mask


def label(mask: np.ndarray) -> np.ndarray:
    """4 邻域连通区域标记，背景为 -1。"""
    big = mask.size + 1
    lab = np.where(mask, np.arange(mask.size).reshape(mask.shape), big)
    while True:
        prev = lab
        nb = lab.copy()
        nb[1:] = np.minimum(nb[1:], lab[:-1])
        nb[:-1] = np.minimum(nb[:-1], lab[1:])
        nb[:, 1:] = np.minimum(nb[:, 1:], lab[:, :-1])
        nb[:, :-1] = np.minimum(nb[:, :-1], lab[:, 1:])
        lab = np.where(mask, nb, big)
        if np.array_equal(lab, prev):
            return np.where(mask, lab, -1)


def main():
    rgb = np.array(Image.open(SRC).convert("RGB")).astype(float)
    h, w, _ = rgb.shape
    # 所有阈值都按 1024 宽的素材表标定，大图按比例放大
    k = w / 1024
    border = np.concatenate([rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    rgba = key_out(rgb, bg, k)
    solid = rgba[..., 3] > 40

    # 在缩小 step 倍的掩码上找连通块，稍微膨胀让棕榈叶、桅杆等细碎部分并进主体
    step = max(1, round(k))
    small = dilate(solid[::step, ::step], 3)
    lab = label(small)
    ids, counts = np.unique(lab[lab >= 0], return_counts=True)
    blobs = []
    for i, c in zip(ids, counts):
        if c < 200:
            continue
        ys, xs = np.nonzero(lab == i)
        blobs.append({"id": i, "x0": xs.min(), "x1": xs.max(), "y0": ys.min(), "y1": ys.max()})

    # 按纵向中心分行：中心差超过素材表高度 8% 就算新的一行
    blobs.sort(key=lambda b: (b["y0"] + b["y1"]) / 2)
    rows, gap = [], 0.08 * small.shape[0]
    for b in blobs:
        cy = (b["y0"] + b["y1"]) / 2
        if rows and cy - rows[-1][-1]["cy"] < gap:
            rows[-1].append({**b, "cy": cy})
        else:
            rows.append([{**b, "cy": cy}])

    names = ["houses", "clouds", "boats"]
    if len(rows) != 3:
        raise SystemExit(f"预期 3 行素材，实际识别到 {len(rows)} 行，每行数量: {[len(r) for r in rows]}")

    pad = round(2 * k)
    for name, row in zip(names, rows):
        out_dir = ROOT / "assets" / name
        out_dir.mkdir(parents=True, exist_ok=True)
        for old in out_dir.glob("*"):
            old.unlink()
        for n, b in enumerate(sorted(row, key=lambda b: b["x0"]), 1):
            own = np.repeat(np.repeat(lab == b["id"], step, 0), step, 1)[:h, :w]
            y0, y1 = max(b["y0"] * step - pad, 0), min((b["y1"] + 1) * step + pad, h)
            x0, x1 = max(b["x0"] * step - pad, 0), min((b["x1"] + 1) * step + pad, w)
            crop = rgba[y0:y1, x0:x1].copy()
            # 只保留属于这个物件的像素，避免带进相邻物件的边角
            crop[..., 3] = np.where(own[y0:y1, x0:x1], crop[..., 3], 0)
            ys, xs = np.nonzero(crop[..., 3] > 0)
            crop = crop[max(ys.min() - pad, 0) : ys.max() + pad + 1, max(xs.min() - pad, 0) : xs.max() + pad + 1]
            path = out_dir / f"{name[:-1]}-{n}.webp"
            Image.fromarray(crop, "RGBA").save(path, quality=WEBP_QUALITY, method=6)
            print(f"{path.relative_to(ROOT)}  {crop.shape[1]}x{crop.shape[0]}  {path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
