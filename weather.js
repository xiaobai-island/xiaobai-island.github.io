// 天气系统：晴、雨、雪、夜按顺序轮换
// 由 app.js 在页面加载完、启动画面关掉后才加载；没加载或出错时地图保持原样，不影响房子、链接等主功能
// 画面的明暗、色调由 style.css 里的 CSS 变量控制（随 html[data-weather] 渐变）；雨、雪、星星、海面波光画在两块画布上
// 网址加 ?weather=rain / snow / night / sunny 可以固定某种天气，?wxdur=秒数 可以改轮换间隔
(function () {
  const cfg = window.MAP_CONFIG;
  const wcfg = cfg.weather;
  if (!wcfg) return;

  const root = document.documentElement;
  const world = document.getElementById("world");
  const mapBg = document.getElementById("mapBg");
  const params = new URLSearchParams(location.search);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = cfg.width;
  const H = cfg.height;
  const KINDS = ["sunny", "rain", "snow", "night"];

  const fixed = KINDS.includes(params.get("weather")) ? params.get("weather") : null;
  const duration = Number(params.get("wxdur")) || wcfg.duration;
  const fade = wcfg.fade;
  root.style.setProperty("--wx-fade", fade + "s");

  // ---------- 图层 ----------
  // 地图 → 调色层 → 后景画布（星星、月亮、波光、涟漪）→ 船、房子 → 云 → 阳光 → 前景画布（雨、雪）→ 名称牌

  const tint = document.createElement("div");
  tint.className = "wx-tint";
  tint.innerHTML = '<i class="wx-sun"></i><i class="wx-rain"></i><i class="wx-snow"></i><i class="wx-night"></i>';
  const back = document.createElement("canvas");
  back.className = "wx-canvas wx-back";
  mapBg.after(tint, back);

  const rays = document.createElement("div");
  rays.className = "wx-rays";
  rays.innerHTML = "<i></i><i></i><i></i><i></i><i></i>";
  const front = document.createElement("canvas");
  front.className = "wx-canvas wx-front";
  document.getElementById("labels").before(rays, front);

  const screenTint = document.createElement("div");
  screenTint.className = "wx-screen-tint";
  document.querySelector(".backdrop").after(screenTint);

  document.querySelectorAll(".boat-inner").forEach((boat) => {
    const lamp = document.createElement("i");
    lamp.className = "boat-lamp";
    boat.append(lamp);
  });

  // 夜里窗户亮灯：每栋房子叠一张只有窗户发光的图（tools/make_night_lights.py 生成），快到夜晚时才下载
  let lightsAdded = false;
  function addLights() {
    if (lightsAdded) return;
    lightsAdded = true;
    document.querySelectorAll(".house").forEach((house) => {
      const img = house.querySelector(".house-img");
      if (!img || !img.src) return;
      const lit = new Image();
      lit.className = "house-lit";
      lit.alt = "";
      lit.draggable = false;
      lit.fetchPriority = "low";
      lit.src = img.src.replace(/\.webp(\?.*)?$/, "-lit.webp");
      house.append(lit);
    });
  }

  // ---------- 地图分区：哪里是天空、哪里是海 ----------
  // 把底图缩到 4px 一格取色：地平线以上的蓝色是天空（白云不算），以下的蓝色是海

  const CELL = 4;
  const cols = W / CELL;
  const rows = Math.ceil(H / CELL);
  let zone = null;
  const skyPts = [];
  const seaPts = [];

  function buildZones() {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = cols;
      c.height = rows;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, cols, rows);
      const px = ctx.getImageData(0, 0, cols, rows).data;
      zone = new Uint8Array(cols * rows);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = (j * cols + i) * 4;
          const r = px[k];
          const g = px[k + 1];
          const b = px[k + 2];
          const y = j * CELL;
          if (y < wcfg.horizon && b > 170 && b > r + 40) zone[j * cols + i] = 1;
          else if (y > wcfg.horizon && b > 140 && b > r + 60 && b > g) zone[j * cols + i] = 2;
        }
      }
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const z = zone[j * cols + i];
          // 四周都是同类才算，避免星星贴着山脊、波光贴着沙滩
          if (!z || !same(i, j, z)) continue;
          (z === 1 ? skyPts : seaPts).push([i * CELL + CELL / 2, j * CELL + CELL / 2]);
        }
      }
      initStars();
      initGlints();
    };
    img.src = "assets/map-bg-1600.webp";
  }

  function same(i, j, z) {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const x = i + di;
        const y = j + dj;
        if (x < 0 || y < 0 || x >= cols || y >= rows || zone[y * cols + x] !== z) return false;
      }
    }
    return true;
  }

  function isSea(x, y) {
    if (!zone) return false;
    const i = Math.floor(x / CELL);
    const j = Math.floor(y / CELL);
    return i >= 0 && i < cols && j >= 0 && j < rows && zone[j * cols + i] === 2;
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // ---------- 粒子 ----------

  let stars = [];
  function initStars() {
    stars = Array.from({ length: Math.min(170, skyPts.length) }, () => {
      const [x, y] = pick(skyPts);
      const big = Math.random() < 0.12;
      return {
        x: x + rand(-2, 2),
        y: y + rand(-2, 2),
        r: big ? rand(0.9, 1.4) : rand(0.35, 0.8),
        big,
        a: Math.min(1, (wcfg.horizon - y) / 70) * rand(0.55, 1),
        f: rand(0.8, 2.6),
        p: rand(0, 6.28),
      };
    });
  }

  let glints = [];
  function initGlints() {
    glints = Array.from({ length: Math.min(170, seaPts.length) }, () => newGlint(rand(0, 3)));
  }
  function newGlint(t0 = 0) {
    const [x, y] = seaPts.length ? pick(seaPts) : [0, -99];
    return { x: x + rand(-2, 2), y: y + rand(-2, 2), t: -t0, life: rand(1, 2.2), s: rand(2.4, 5) };
  }

  const drops = Array.from({ length: 340 }, () => newDrop(true));
  function newDrop(anywhere) {
    const z = rand(0.35, 1);
    return {
      x: rand(-120, W),
      y: anywhere ? rand(-40, H) : rand(-80, -10),
      z,
      len: 8 + z * 15,
      v: 420 + z * 460,
      ground: rand(150, H + 20),
    };
  }
  let ripples = [];
  let splashes = [];

  const flakes = Array.from({ length: 300 }, () => newFlake(true));
  function newFlake(anywhere) {
    const z = rand(0.3, 1);
    return {
      x: rand(-20, W + 20),
      y: anywhere ? rand(-20, H) : rand(-30, -5),
      z,
      r: 0.7 + z * 2.5,
      v: 9 + z * 26,
      amp: 3 + z * 10,
      f: rand(0.3, 0.9),
      p: rand(0, 6.28),
    };
  }

  // 雪花和月亮先画到小画布上，每帧直接贴图，比逐个画渐变快得多
  const flakeSprite = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return c;
  })();

  const MOON_R = 10;
  const moonSprite = (() => {
    const S = 8;
    const size = 150 * S;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.scale(S, S);
    const glow = ctx.createRadialGradient(75, 75, MOON_R * 0.8, 75, 75, 75);
    glow.addColorStop(0, "rgba(255,246,214,0.55)");
    glow.addColorStop(0.25, "rgba(220,230,255,0.18)");
    glow.addColorStop(1, "rgba(200,215,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 150, 150);
    const disc = ctx.createRadialGradient(72, 72, 1, 75, 75, MOON_R);
    disc.addColorStop(0, "#fffdf2");
    disc.addColorStop(1, "#f4e7b8");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(75, 75, MOON_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(210,196,150,0.45)";
    [[71, 72, 2.2], [79, 78, 1.6], [76, 69, 1.1], [70, 80, 1.3]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    return c;
  })();

  let meteor = null;
  let nextMeteor = rand(3, 7);

  // ---------- 天气轮换 ----------

  const level = { sunny: 0, rain: 0, snow: 0, night: 0 };
  let current = null;

  const order = wcfg.order;
  let idx = 0;
  let elapsed = 0;

  function setWeather(kind) {
    current = kind;
    root.dataset.weather = kind;
    if (kind === "night" || (!fixed && order[(idx + 1) % order.length] === "night")) addLights();
  }

  // 从原样渐变到第一种天气，不会突然变色
  setWeather(fixed || order[0]);

  // ---------- 绘制 ----------

  const bctx = back.getContext("2d");
  const fctx = front.getContext("2d");
  let res = 0;

  function resize() {
    const zoom = parseFloat(world.style.zoom) || 1;
    let r = zoom * Math.min(devicePixelRatio || 1, 2);
    // 超大屏限制画布像素量，避免每帧清屏太费
    r = Math.min(r, Math.sqrt(4.5e6 / (W * H)));
    if (Math.abs(r - res) < 0.01) return;
    res = r;
    [back, front].forEach((c) => {
      c.width = Math.round(W * r);
      c.height = Math.round(H * r);
    });
  }

  function drawBack(t, dt) {
    bctx.setTransform(res, 0, 0, res, 0, 0);
    bctx.clearRect(0, 0, W, H);
    bctx.globalCompositeOperation = "lighter";

    const n = level.night;
    if (n > 0.01) {
      stars.forEach((s) => {
        const tw = reduce ? 1 : 0.55 + 0.45 * Math.sin(t * s.f + s.p);
        const a = s.a * tw * n;
        bctx.fillStyle = `rgba(255,250,235,${a})`;
        bctx.beginPath();
        bctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        bctx.fill();
        if (s.big) {
          bctx.fillStyle = `rgba(230,240,255,${a * 0.5})`;
          bctx.fillRect(s.x - s.r * 3.2, s.y - 0.18, s.r * 6.4, 0.36);
          bctx.fillRect(s.x - 0.18, s.y - s.r * 3.2, 0.36, s.r * 6.4);
        }
      });

      if (!reduce) {
        nextMeteor -= dt;
        if (!meteor && nextMeteor <= 0 && skyPts.length) {
          const [x, y] = pick(skyPts.filter((p) => p[1] < wcfg.horizon - 60)) || [300, 30];
          meteor = { x, y, t: 0 };
          nextMeteor = rand(5, 11);
        }
        if (meteor) {
          meteor.t += dt;
          const k = meteor.t / 0.9;
          if (k >= 1) meteor = null;
          else {
            const hx = meteor.x + k * 120;
            const hy = meteor.y + k * 45;
            const g = bctx.createLinearGradient(hx - 40, hy - 15, hx, hy);
            const a = Math.sin(k * Math.PI) * n;
            g.addColorStop(0, "rgba(255,255,255,0)");
            g.addColorStop(1, `rgba(255,255,240,${a})`);
            bctx.strokeStyle = g;
            bctx.lineWidth = 1;
            bctx.beginPath();
            bctx.moveTo(hx - 40, hy - 15);
            bctx.lineTo(hx, hy);
            bctx.stroke();
          }
        }
      }

      const m = wcfg.moon;
      bctx.globalCompositeOperation = "source-over";
      bctx.globalAlpha = n;
      bctx.drawImage(moonSprite, m.x - 75, m.y - 75, 150, 150);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = "lighter";

      // 海面上的月光倒影：地平线下一串闪动的横线
      for (let i = 0; i < 26; i++) {
        const y = wcfg.horizon + 3 + i * 2.2;
        const spread = 6 + i * 1.3;
        const x = m.x + Math.sin(t * 1.7 + i * 1.9) * spread * 0.5;
        if (!isSea(x, y)) continue;
        const a = (0.42 - i * 0.012) * n * (0.6 + 0.4 * Math.sin(t * 3.1 + i));
        bctx.fillStyle = `rgba(255,246,210,${Math.max(0, a)})`;
        bctx.fillRect(x - spread * 0.5, y, spread * rand(0.5, 1), 0.7);
      }
    }

    const s = level.sunny;
    if (s > 0.01 && !reduce) {
      glints.forEach((g, i) => {
        g.t += dt;
        if (g.t > g.life) glints[i] = g = newGlint();
        if (g.t < 0) return;
        const a = Math.sin((g.t / g.life) * Math.PI) ** 3 * s;
        bctx.globalAlpha = a;
        bctx.drawImage(flakeSprite, g.x - g.s * 0.7, g.y - g.s * 0.7, g.s * 1.4, g.s * 1.4);
        bctx.globalAlpha = 1;
        bctx.fillStyle = `rgba(255,255,255,${a})`;
        bctx.fillRect(g.x - g.s, g.y - 0.25, g.s * 2, 0.5);
        bctx.fillRect(g.x - 0.25, g.y - g.s * 0.7, 0.5, g.s * 1.4);
      });
    }

    if (ripples.length) {
      bctx.globalCompositeOperation = "source-over";
      bctx.lineWidth = 0.5;
      ripples = ripples.filter((r) => (r.t += dt) < 0.7);
      ripples.forEach((r) => {
        const k = r.t / 0.7;
        bctx.strokeStyle = `rgba(225,238,250,${(1 - k) * 0.6})`;
        bctx.beginPath();
        bctx.ellipse(r.x, r.y, 0.8 + k * 5, 0.3 + k * 1.8, 0, 0, Math.PI * 2);
        bctx.stroke();
      });
    }
    bctx.globalCompositeOperation = "source-over";
  }

  function drawFront(dt) {
    fctx.setTransform(res, 0, 0, res, 0, 0);
    fctx.clearRect(0, 0, W, H);
    if (reduce) return;

    const r = level.rain;
    const nRain = Math.round(drops.length * r * quality);
    if (nRain > 0) {
      fctx.lineCap = "round";
      // 按远近分三档，每档一条路径一次画完
      [[0.35, 0.57], [0.57, 0.79], [0.79, 1.01]].forEach(([lo, hi], band) => {
        fctx.strokeStyle = `rgba(214,228,244,${(0.3 + band * 0.16) * r})`;
        fctx.lineWidth = 0.6 + band * 0.32;
        fctx.beginPath();
        for (let i = 0; i < nRain; i++) {
          const d = drops[i];
          if (d.z < lo || d.z >= hi) continue;
          fctx.moveTo(d.x, d.y);
          fctx.lineTo(d.x - d.len * 0.24, d.y - d.len);
        }
        fctx.stroke();
      });
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.y += d.v * dt;
        d.x += d.v * 0.24 * dt;
        if (d.y > d.ground) {
          if (i < nRain && d.ground < H) {
            if (isSea(d.x, d.ground)) {
              if (ripples.length < 160) ripples.push({ x: d.x, y: d.ground, t: 0 });
            } else if (splashes.length < 120 && d.z > 0.6) {
              for (let k = 0; k < 2; k++)
                splashes.push({ x: d.x, y: d.ground, vx: rand(-18, 18), vy: rand(-34, -18), t: 0 });
            }
          }
          drops[i] = newDrop(false);
        }
      }
    }

    if (splashes.length) {
      fctx.fillStyle = `rgba(225,235,248,${0.7 * Math.max(r, 0.2)})`;
      splashes = splashes.filter((p) => (p.t += dt) < 0.28);
      splashes.forEach((p) => {
        p.vy += 160 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        fctx.fillRect(p.x, p.y, 0.7, 0.7);
      });
    }

    const sn = level.snow;
    const nSnow = Math.round(flakes.length * sn * quality);
    if (nSnow > 0) {
      const t = performance.now() / 1000;
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        f.y += f.v * dt;
        f.x += (4 + f.z * 6) * dt;
        if (f.y > H + 5 || f.x > W + 25) flakes[i] = newFlake(false);
        if (i >= nSnow) continue;
        const x = f.x + Math.sin(t * f.f + f.p) * f.amp;
        const size = f.r * 2.6;
        fctx.globalAlpha = (0.45 + 0.55 * f.z) * sn;
        fctx.drawImage(flakeSprite, x - size / 2, f.y - size / 2, size, size);
      }
      fctx.globalAlpha = 1;
    }
  }

  // 设备跑不动时自动减少雨雪粒子，保证地图本身的动画流畅；手机默认少一些
  let quality = matchMedia("(pointer: coarse)").matches ? 0.6 : 1;
  let slowTime = 0;
  let frameAvg = 16;

  let last = performance.now();
  function frame(now) {
    const raw = now - last;
    const dt = Math.min(raw / 1000, 0.1);
    last = now;
    const t = now / 1000;

    // 切回标签页时的长间隔不算卡
    if (raw < 250) {
      frameAvg += (raw - frameAvg) * 0.05;
      slowTime = frameAvg > 26 ? slowTime + dt : 0;
      if (slowTime > 2 && quality > 0.25) {
        quality /= 2;
        slowTime = 0;
      }
    }

    if (!fixed) {
      elapsed += dt;
      if (elapsed >= duration) {
        elapsed = 0;
        idx = (idx + 1) % order.length;
        setWeather(order[idx]);
      }
    }
    KINDS.forEach((k) => {
      const target = k === current ? 1 : 0;
      const step = dt / fade;
      level[k] = target > level[k] ? Math.min(target, level[k] + step) : Math.max(target, level[k] - step);
    });

    try {
      resize();
      drawBack(t, dt);
      drawFront(dt);
    } catch (e) {
      // 画布出问题就只保留色调变化，不再重画
      back.remove();
      front.remove();
      return;
    }
    requestAnimationFrame(frame);
  }

  buildZones();
  requestAnimationFrame(frame);
})();
