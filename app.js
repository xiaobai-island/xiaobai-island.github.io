(function () {
  const cfg = window.MAP_CONFIG;
  const VERSION = document.currentScript ? new URL(document.currentScript.src).search : "";
  const viewport = document.getElementById("viewport");
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");

  world.style.width = cfg.width + "px";
  world.style.height = cfg.height + "px";
  // 加载顺序：内嵌模糊占位图 → 1600 宽底图 → 房子、云、船 → 高清屏再在后台换成高清底图
  // 房子、云、船等底图下完再开始下载，不和底图抢带宽；底图太慢时 3 秒后也照常加载
  const mapBg = document.getElementById("mapBg");
  const HD_MAPS = [2400, 3200];

  function upgradeMap() {
    const need = cfg.width * (parseFloat(world.style.zoom) || 1) * devicePixelRatio;
    if (need <= 1800) return;
    const w = HD_MAPS.find((x) => x >= need * 0.9) || HD_MAPS[HD_MAPS.length - 1];
    const hd = new Image();
    hd.src = `assets/map-bg-${w}.webp`;
    hd.decode().then(() => (mapBg.src = hd.src)).catch(() => {});
  }
  const afterPageLoad = () => setTimeout(upgradeMap, 300);
  document.readyState === "complete" ? afterPageLoad() : addEventListener("load", afterPageLoad);
  // 每张图片一个「加载完成」的 Promise，启动画面据此显示进度；加载失败也算完成，不卡住页面
  const loads = [];
  function track(img) {
    const done = new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
    loads.push(done);
    return done;
  }
  if (!(mapBg.complete && mapBg.naturalWidth)) track(mapBg);

  let pending = [];
  function lazySrc(img, src) {
    track(img);
    pending ? pending.push(() => (img.src = src)) : (img.src = src);
  }
  function flush() {
    if (!pending) return;
    pending.forEach((load) => load());
    pending = null;
  }
  const showMap = () => {
    world.classList.add("map-ready");
    flush();
  };
  mapBg.complete && mapBg.naturalWidth ? showMap() : mapBg.addEventListener("load", showMap);
  mapBg.addEventListener("error", flush);
  setTimeout(flush, 3000);

  // ---------- 自适应：一屏放下，不滚动 ----------
  // 横屏：尽量铺满，但 safe 区域必须完整可见，放不下时缩小、两侧露出模糊背景
  // 竖屏：按高度铺满，左右可拖动

  const safe = cfg.safe;
  let pan = { x: 0, min: 0, max: 0 };

  function place(view, size, lo, hi, s) {
    if (size <= view) return (view - size) / 2;
    const o = view / 2 - ((lo + hi) / 2) * s;
    return Math.min(0, Math.max(view - size, o));
  }

  function fit() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    let s;
    if (vw < vh) {
      s = vh / cfg.height;
    } else {
      s = Math.max(vw / cfg.width, vh / cfg.height);
      s = Math.min(s, vw / (safe.x1 - safe.x0), vh / (safe.y1 - safe.y0));
    }
    const mapW = cfg.width * s;
    const mapH = cfg.height * s;
    // 用 zoom 而不是 transform: scale，浏览器会按最终尺寸排版和栅格化，高清图不会被先缩小再放大
    world.style.zoom = s;
    stage.style.width = mapW + "px";
    stage.style.height = mapH + "px";
    // 纵向优先贴顶保住山顶，只在 safe 底部放不下时才往上推，多出的海面从底部裁掉
    stage.style.top =
      mapH <= vh ? (vh - mapH) / 2 + "px" : Math.max(vh - mapH, Math.min(0, vh - safe.y1 * s)) + "px";
    pan = {
      x: place(vw, mapW, safe.x0, safe.x1, s),
      min: Math.min(0, vw - mapW),
      max: mapW > vw ? 0 : (vw - mapW) / 2,
    };
    if (mapW <= vw) pan.min = pan.max;
    applyPan();
    viewport.classList.toggle("pannable", pan.min < pan.max);
  }

  function applyPan() {
    pan.x = Math.min(pan.max, Math.max(pan.min, pan.x));
    stage.style.left = pan.x + "px";
  }

  window.addEventListener("resize", fit);
  fit();

  // ---------- 手机横屏 ----------
  // 支持的浏览器（安卓 Chrome 等）进入全屏并锁定横屏；不支持的（iPhone）把整个页面用 CSS 转 90°，手机横过来看

  const rotateBtn = document.getElementById("rotateBtn");
  const portraitQ = matchMedia("(orientation: portrait)");
  const touchQ = matchMedia("(pointer: coarse)");
  let rotated = false;
  let locked = false;

  function syncRotate() {
    // 用户自己把手机横过来了，就不需要再转
    if (rotated && !portraitQ.matches) rotated = false;
    document.documentElement.classList.toggle("rotated", rotated);
    const on = rotated || locked;
    rotateBtn.hidden = !touchQ.matches || (!portraitQ.matches && !on);
    rotateBtn.textContent = on ? "↩ 退出横屏" : "⟲ 横屏查看";
    requestAnimationFrame(fit);
  }

  async function enterLandscape() {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      await screen.orientation.lock("landscape");
      locked = true;
    } catch {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      rotated = true;
    }
    syncRotate();
  }

  function exitLandscape() {
    if (locked) {
      screen.orientation.unlock?.();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      locked = false;
    }
    rotated = false;
    syncRotate();
  }

  rotateBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  rotateBtn.addEventListener("click", () => (rotated || locked ? exitLandscape() : enterLandscape()));
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && locked) {
      locked = false;
      syncRotate();
    }
  });
  portraitQ.addEventListener("change", syncRotate);
  touchQ.addEventListener("change", syncRotate);
  syncRotate();

  // ---------- 地图比屏幕宽时，可左右拖动（鼠标和触屏通用） ----------

  let drag = null;
  let moved = false;
  viewport.addEventListener("pointerdown", (e) => {
    moved = false;
    if (pan.min === pan.max) return;
    drag = { x: rotated ? e.clientY : e.clientX, start: pan.x };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    // 页面被 CSS 转了 90° 时，地图的横向对应屏幕的纵向
    const dx = (rotated ? e.clientY : e.clientX) - drag.x;
    if (Math.abs(dx) > 4) {
      moved = true;
      viewport.classList.add("dragging");
    }
    pan.x = drag.start + dx;
    applyPan();
  });
  window.addEventListener("pointerup", () => {
    drag = null;
    viewport.classList.remove("dragging");
  });

  // ---------- 房子 ----------

  // 名称牌放在云上面单独一层，云可以飘过房子但不会挡住名称；悬停任意一个两者一起高亮

  const housesLayer = document.getElementById("houses");
  const labelsLayer = document.getElementById("labels");

  function link(className, site) {
    const a = document.createElement("a");
    a.className = className;
    a.href = site.url;
    if (cfg.openInNewTab) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    a.addEventListener("click", (e) => {
      // 拖动地图结束时不触发跳转
      if (moved) e.preventDefault();
    });
    a.addEventListener("dragstart", (e) => e.preventDefault());
    return a;
  }

  // 风车叶片：正面画的叶片在自己的平面里转，平面用真 3D（rotateY + 透视）转到房子侧面的角度，
  // 再 skewY 贴合等距视角；背后叠一层压暗的叶片当木框厚度，另一份投影只落在房子轮廓里（用房子图当遮罩）
  function millBlades(m, houseImg) {
    const layer = document.createElement("div");
    layer.className = "house-mill";
    layer.style.perspectiveOrigin = `${m.x * 100}% ${m.y * 100}%`;
    const pos = `left:${m.x * 100}%;top:${m.y * 100}%;width:${m.size * 100}%`;
    const plane = `translate(-50%,-50%) skewY(${m.skew}deg) rotateY(${m.turn}deg)`;
    const blade = (cls, z) =>
      `<img class="${cls}" alt="" draggable="false" style="--z:${z}px;animation-duration:${m.spin}s" />`;
    layer.innerHTML = `<div class="mill-shadow" style="-webkit-mask-image:url(${houseImg});mask-image:url(${houseImg});perspective-origin:${m.x * 100}% ${m.y * 100}%">
        <div class="mill-plane" style="${pos};transform:translate(${m.shadow[0]}%,${m.shadow[1]}%) ${plane}">${blade("", 0)}</div>
      </div>
      <div class="mill-plane" style="${pos};transform:${plane}">${blade("mill-back", -m.depth)}${blade("mill-front", 0)}</div>`;
    layer.querySelectorAll("img").forEach((img) => lazySrc(img, m.img));
    return layer;
  }

  cfg.sites.forEach((site) => {
    const linked = Boolean(site.name && site.url);
    const house = linked ? link("house", site) : document.createElement("div");
    if (!linked) house.className = "house decor";
    house.style.left = site.x + "px";
    house.style.top = site.y + "px";
    house.style.width = site.w + "px";
    house.style.zIndex = Math.round(site.y);
    house.tabIndex = -1;
    house.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.className = "house-img";
    lazySrc(img, site.img);
    img.alt = "";
    img.draggable = false;
    house.append(img);
    if (site.mill) house.append(millBlades(site.mill, site.img));
    housesLayer.append(house);
    if (!linked) return;

    const label = link("house-label", site);
    label.textContent = site.name;
    label.style.left = site.x + "px";
    label.style.animationDelay = -Math.random() * 3 + "s";
    labelsLayer.append(label);

    const placeLabel = () => {
      label.style.top = site.y - (site.w * img.naturalHeight) / img.naturalWidth + "px";
    };
    // 图片还没下载时先按常见房子比例占位，下完后再精确对齐
    label.style.top = site.y - site.w * 0.9 + "px";
    img.addEventListener("load", placeLabel);

    const setHover = (on) => {
      house.classList.toggle("hover", on);
      label.classList.toggle("hover", on);
    };
    [house, label].forEach((el) => {
      el.addEventListener("pointerenter", () => setHover(true));
      el.addEventListener("pointerleave", () => setHover(false));
      el.addEventListener("focus", () => setHover(true));
      el.addEventListener("blur", () => setHover(false));
    });
  });

  // ---------- 跳绳的小孩（素材来自小白工具箱的吉祥物，原尺寸 64 × 112） ----------

  // 地图上和启动画面里各有一个，k 是相对原尺寸的缩放倍数
  function createKid(k) {
    const K = "assets/kid/";
    const el = document.createElement("div");
    el.className = "kid";
    el.style.setProperty("--k", k);
    el.innerHTML = `
      <div class="kid-fig">
        <div class="kid-shadow"></div>
        <svg class="kid-rope" viewBox="0 -20 64 170"><path class="rope-back" /></svg>
        <div class="kid-bob">
          <svg class="kid-body" viewBox="0 0 64 40">
            <g class="leg-l"><image href="${K}leg-l.png" x="18.77" y="25.41" width="9.34" height="14.38"/></g>
            <g class="leg-r"><image href="${K}leg-r.png" x="36.09" y="25.41" width="9.13" height="14.59"/></g>
            <g class="torso"><image href="${K}torso.png" x="10.79" y="0" width="42.42" height="27.82"/></g>
            <g class="arm-l"><image href="${K}arm-l.png" x="7.22" y="0.42" width="13.54" height="19.21" transform="rotate(-8 17.72 1.68)"/></g>
            <g class="arm-r"><image href="${K}arm-r.png" x="43.23" y="0.42" width="13.54" height="19.21" transform="rotate(8 46.28 1.68)"/></g>
          </svg>
          <div class="kid-head">
            <img src="${K}head.webp" alt="" draggable="false" />
            <svg class="kid-lids" viewBox="0 0 52 77">
              <g fill="#cf9f8b"><ellipse cx="13.9" cy="43.9" rx="5.6" ry="3.7"/><ellipse cx="33.3" cy="43.9" rx="5.6" ry="3.7"/></g>
              <path d="M9.6 43.6 Q13.9 46.6 18.2 43.6 M29 43.6 Q33.3 46.6 37.6 43.6" fill="none" stroke="#3a2621" stroke-width="1" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
        <svg class="kid-rope front" viewBox="0 -20 64 170"><path class="rope-front" /></svg>
      </div>`;
    return {
      el,
      t0: 0,
      mode: "jump",
      bob: el.querySelector(".kid-bob"),
      shadow: el.querySelector(".kid-shadow"),
      front: el.querySelector(".rope-front"),
      back: el.querySelector(".rope-back"),
      legs: [el.querySelector(".leg-l"), el.querySelector(".leg-r")],
      arms: [el.querySelector(".arm-l"), el.querySelector(".arm-r")],
    };
  }

  function putKid(kid, x, y) {
    kid.x = x;
    kid.y = y;
    kid.el.style.left = x + "px";
    kid.el.style.top = y + "px";
    // 回家路上脚会走到房子底边以上，按 y 排序会被房子挡住，所以临时提到房子前面
    kid.el.style.zIndex = kid.zLift || Math.round(y);
  }

  const kids = [];
  let mapKid = null;
  if (cfg.kid) {
    mapKid = createKid(cfg.kid.h / 112);
    putKid(mapKid, cfg.kid.x, cfg.kid.y);
    housesLayer.append(mapKid.el);
    kids.push(mapKid);
  }

  // ---------- 天黑回屋：weather.js 切到夜晚时调用 Island.setNight(true)，小孩收起跳绳走进 home 房子的门，天亮再走出来 ----------

  const WALK_SPEED = 22;

  // 途经点用 Catmull-Rom 连成闭合的平滑曲线，按弧长等速行走
  function smoothLoop(pts) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push(
          [0, 1].map(
            (k) =>
              0.5 *
              (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
          )
        );
      }
    }
    out.push(out[0]);
    return out;
  }

  function makePath(pts) {
    const lens = [0];
    for (let i = 1; i < pts.length; i++)
      lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, lens, total: lens[lens.length - 1] };
  }

  function pathAt(path, d) {
    let i = 1;
    while (i < path.lens.length - 1 && path.lens[i] < d) i++;
    const seg = path.lens[i] - path.lens[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - path.lens[i - 1]) / seg));
    const [x0, y0] = path.pts[i - 1];
    const [x1, y1] = path.pts[i];
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  }

  const loopPath = cfg.kid && cfg.kid.route ? makePath(smoothLoop([[cfg.kid.x, cfg.kid.y], ...cfg.kid.route])) : null;
  const JUMP_MS = ((cfg.kid && cfg.kid.jump) || 8) * 1000;
  if (mapKid && loopPath) mapKid.jumpUntil = performance.now() + JUMP_MS;

  // trip 标记这趟是散步、回家还是出门，头顶说的话据此挑选
  function walkPath(kid, path, done, trip = "walk") {
    kid.mode = "walk";
    kid.trip = trip;
    kid.walk = { path, t0: performance.now(), dur: (path.total / WALK_SPEED) * 1000, done };
  }

  function walkTo(kid, x, y, done) {
    walkPath(kid, makePath([[kid.x, kid.y], [x, y]]), done);
  }

  function startJump(kid) {
    kid.mode = "jump";
    kid.trip = null;
    kid.t0 = performance.now();
    kid.jumpUntil = kid.t0 + JUMP_MS;
  }

  function walkFrame(kid, now) {
    const w = kid.walk;
    const p = Math.min(1, (now - w.t0) / w.dur);
    const [x, y] = pathAt(w.path, p * w.path.total);
    putKid(kid, x, y);
    // 迈腿：左右腿绕胯部反向摆动，手臂放下前后甩，身体随步子轻微起伏
    const s = Math.sin(((now - w.t0) / 1000) * Math.PI * 2 * 2.2);
    kid.legs[0].setAttribute("transform", `rotate(${s * 24} 23.4 25.4)`);
    kid.legs[1].setAttribute("transform", `rotate(${-s * 24} 40.7 25.4)`);
    kid.arms[0].style.transform = `rotate(${4 - s * 14}deg)`;
    kid.arms[1].style.transform = `rotate(${-4 - s * 14}deg)`;
    kid.bob.style.transform = `translateY(${-Math.abs(s) * 1.8}px)`;
    kid.shadow.style.transform = "translateX(-50%)";
    kid.front.setAttribute("d", "");
    kid.back.setAttribute("d", "");
    if (p >= 1) {
      kid.legs.forEach((g) => g.removeAttribute("transform"));
      kid.arms.forEach((g) => (g.style.transform = ""));
      kid.walk = null;
      w.done();
    }
  }

  function setNight(on, instant) {
    const kid = mapKid;
    const home = cfg.kid && cfg.kid.home;
    if (!kid || !home) return;
    const approach = home.path || [];
    const door = [home.x, home.y];
    const lift = Math.round(approach.length ? Math.max(...approach.map((p) => p[1])) : home.y) + 1;
    if (on) {
      if (kid.mode === "inside") return;
      kid.zLift = lift;
      const goIn = () => {
        kid.mode = "inside";
        kid.el.classList.add("inside");
      };
      if (instant) {
        putKid(kid, ...door);
        goIn();
      } else {
        walkPath(kid, makePath([[kid.x, kid.y], ...approach, door]), goIn, "home");
        sayNow(kid);
      }
    } else {
      if (kid.mode === "jump") return;
      kid.zLift = lift;
      if (kid.mode === "inside") {
        putKid(kid, ...door);
        kid.el.classList.remove("inside");
      }
      // 原路下台阶出来，再走回跳绳的地方
      const back = kid.mode === "inside" || (kid.x === home.x && kid.y === home.y) ? [door, ...approach.slice().reverse()] : [[kid.x, kid.y]];
      walkPath(
        kid,
        makePath([...back, [cfg.kid.x, cfg.kid.y]]),
        () => {
          kid.zLift = 0;
          putKid(kid, kid.x, kid.y);
          startJump(kid);
        },
        "out"
      );
      sayNow(kid);
    }
  }

  window.Island = { setNight };

  // ---------- 头顶的话：按天气和正在做的事轮播，说几秒、停几秒 ----------

  const LINES = {
    jump: ["一、二、三……", "我跳得高不高？", "再跳一会儿～", "跳绳冠军就是我！", "呼～有点累了"],
    walk: ["去海边散散步～", "看看小船回来没", "哼哼哼～🎵", "这边的花好香", "今天走了好多步"],
    home: ["天黑啦，回家咯～", "妈妈喊我吃饭了", "晚安，小岛 🌙"],
    out: ["早上好！☀️", "新的一天开始啦", "我又来玩啦～"],
    sunny: ["今天也要元气满满！", "太阳晒得暖洋洋 ☀️", "天气真好呀～"],
    rain: ["下雨啦，踩水坑！", "雨伞忘带了…", "滴答滴答 🌧️"],
    snow: ["下雪啦！想堆雪人 ⛄", "好冷好冷～", "雪花落在鼻子上了 ❄️"],
  };
  const SAY_MS = 3200;
  const bubble = document.createElement("div");
  bubble.className = "kid-bubble";
  labelsLayer.append(bubble);
  let sayUntil = 0;
  let nextSay = performance.now() + 2500;
  let lastLine = "";

  function pickLine(kid) {
    const act = kid.mode === "walk" ? kid.trip : "jump";
    const weather = document.documentElement.dataset.weather;
    let pool = LINES[act] || [];
    // 回家、出门只说应景的话；跳绳和散步时混进天气相关的
    if (act === "jump" || act === "walk") pool = pool.concat(LINES[weather] || []);
    if (act === "jump") {
      const n = Math.floor((performance.now() - kid.t0) / 560);
      if (n > 3) pool = pool.concat(`跳了 ${n} 下啦！`);
    }
    const choices = pool.filter((s) => s !== lastLine);
    return (lastLine = choices[(Math.random() * choices.length) | 0] || "");
  }

  function sayNow(kid) {
    const text = pickLine(kid);
    if (!text) return;
    bubble.textContent = text;
    bubble.classList.remove("show");
    void bubble.offsetWidth;
    bubble.classList.add("show");
    sayUntil = performance.now() + SAY_MS;
    nextSay = sayUntil + 2200 + Math.random() * 2500;
  }

  function bubbleFrame(kid, now) {
    if (kid.mode === "inside") {
      bubble.classList.remove("show");
      return;
    }
    if (now >= nextSay) sayNow(kid);
    else if (now >= sayUntil) bubble.classList.remove("show");
    bubble.style.left = kid.x + "px";
    bubble.style.top = kid.y - cfg.kid.h - 10 + "px";
  }

  // 绳子绕身体转一圈 560ms，往下甩时在身前、往上甩时在身后；绳子到脚下时人正好跳到最高
  function kidFrame(kid, now) {
    if (kid.mode === "walk") return walkFrame(kid, now);
    if (kid.mode !== "jump") return;
    if (kid.jumpUntil && loopPath && now >= kid.jumpUntil) {
      walkPath(kid, loopPath, () => startJump(kid));
      return walkFrame(kid, now);
    }
    const t = now - kid.t0;
    if (kid.onJump) kid.onJump(Math.floor(t / 560));
    const th = (t / 560) * Math.PI * 2;
    const lift = Math.max(0, Math.cos(th)) ** 2 * 14;
    const hy = 85.9 - lift;
    const apex = 51 + 61 * Math.cos(th);
    const c = (apex - hy * 0.25) / 0.75;
    const d = `M6.1 ${hy} C0 ${c} 64 ${c} 57.9 ${hy}`;
    kid.bob.style.transform = `translateY(${-lift}px)`;
    kid.shadow.style.transform = `translateX(-50%) scale(${1 - lift / 40})`;
    const front = Math.sin(th) < 0;
    kid.front.setAttribute("d", front ? d : "");
    kid.back.setAttribute("d", front ? "" : d);
  }

  // ---------- 云：从左飘到右，循环 ----------

  const cloudsLayer = document.getElementById("clouds");
  cfg.clouds.forEach((c) => {
    const el = document.createElement("div");
    el.className = "cloud";
    el.style.top = c.y + "px";
    el.style.opacity = c.opacity;
    el.style.width = c.w + "px";
    el.style.setProperty("--from", -c.w + "px");
    el.style.setProperty("--to", cfg.width + "px");

    const img = new Image();
    lazySrc(img, c.img);
    el.style.animationDuration = c.speed + "s";
    el.style.animationDelay = -Math.random() * c.speed + "s";
    el.append(img);
    cloudsLayer.append(el);
  });

  // ---------- 船：沿折线来回航行 ----------

  const boatsLayer = document.getElementById("boats");

  // 航线拐点用 Catmull-Rom 连成平滑曲线（首尾端点固定），船转弯时走弧线而不是折线
  function smoothOpen(pts) {
    if (pts.length < 3) return pts;
    const out = [];
    const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let s = 0; s < 10; s++) {
        const t = s / 10;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push(
          [0, 1].map(
            (k) =>
              0.5 *
              (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
          )
        );
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  const boats = cfg.boats.map((b) => {
    const el = document.createElement("div");
    el.className = "boat";
    el.innerHTML = `<div class="boat-inner" style="width:${b.w}px">
      <div class="boat-wake"></div><img alt="" draggable="false" /></div>`;
    lazySrc(el.querySelector(".boat-inner img"), b.img);
    el.querySelector(".boat-inner img").style.animationDelay = -Math.random() * 2.6 + "s";
    boatsLayer.append(el);

    const segs = [];
    let total = 0;
    const route = smoothOpen(b.route);
    for (let i = 1; i < route.length; i++) {
      const [x0, y0] = route[i - 1];
      const [x1, y1] = route[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      segs.push({ x0, y0, x1, y1, len, start: total });
      total += len;
    }
    return {
      el,
      segs,
      total,
      w: b.w,
      speed: b.speed,
      perspective: b.perspective !== false,
      faceLeft: b.face === "left",
      bowDir: 1,
      tilt: 0,
      dist: Math.random() * total * 2,
      wakeGap: 0,
    };
  });

  function pointAt(boat, d) {
    const seg = boat.segs.find((s) => d <= s.start + s.len) || boat.segs[boat.segs.length - 1];
    const t = seg.len ? (d - seg.start) / seg.len : 0;
    return [seg.x0 + (seg.x1 - seg.x0) * t, seg.y0 + (seg.y1 - seg.y0) * t, seg];
  }

  // 近大远小：y 从 near 往 far（海平线）缩到 min 倍
  const persp = cfg.perspective;
  function boatScale(boat, y) {
    if (!persp || !boat.perspective) return 1;
    const t = Math.min(1, Math.max(0, (y - persp.far) / (persp.near - persp.far)));
    return persp.min + (1 - persp.min) * t;
  }

  // route 只有一个点的船原地停泊，只保留轻微摇晃，不进逐帧航行
  const sailing = boats.filter((boat, i) => {
    if (boat.segs.length) return true;
    const [x, y] = cfg.boats[i].route[0];
    boat.el.style.transform = `translate(${x}px, ${y}px) scale(${boatScale(boat, y)})`;
    boat.el.style.zIndex = Math.round(y);
    return false;
  });

  // 船头兴波：每走一小段在船头吃水处留下左右两道波线，波线停在水面上各自向外推开，
  // 船继续往前走，这些波线就沿船身排成向后张开的 V 形尾迹；地图是斜俯视，垂直航向的位移压扁一半
  const WAKE_STEP = 4;
  const BOAT_TILT = 12;
  const MAX_RIPPLES = 120;
  const WAKE_MS = 2600;
  const WAKE_OPEN = 16;
  let ripples = 0;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 波线从画面上看得见的船头出发（船图只有侧视，竖着走时也按船头朝向和倾角算），向真实航向的后方推开
  function spawnRipple(boat, x, y, ux, uy, s) {
    if (reduceMotion || ripples >= MAX_RIPPLES || x < -20 || x > cfg.width + 20) return;
    const len = boat.w * s;
    const bow = boat.bowDir;
    const tiltRad = (boat.tilt * Math.PI) / 180;
    const bx = x + bow * len * 0.4 * Math.cos(tiltRad);
    const by = y + bow * len * 0.4 * Math.sin(tiltRad);
    const heading = boat.tilt + (bow < 0 ? 180 : 0);
    for (const side of [-1, 1]) {
      const px = -uy * side * len * 0.3 - ux * len * 1.0;
      const py = (ux * side * len * 0.3 - uy * len * 1.0) * 0.5;
      const r = document.createElement("i");
      r.className = "ripple";
      r.style.left = bx + "px";
      r.style.top = by + "px";
      r.style.width = len * 0.3 + "px";
      r.style.zIndex = 0;
      const rot = heading - side * WAKE_OPEN;
      const flipArc = side > 0 ? " scaleY(-1)" : "";
      ripples++;
      r.animate(
        [
          { transform: `translate(0, 0) rotate(${rot}deg) scale(0.5)${flipArc}`, opacity: 0.95 },
          { transform: `translate(${px * 0.35}px, ${py * 0.35}px) rotate(${rot}deg) scale(1)${flipArc}`, opacity: 0.8, offset: 0.25 },
          { transform: `translate(${px}px, ${py}px) rotate(${rot}deg) scale(1.9)${flipArc}`, opacity: 0 },
        ],
        { duration: WAKE_MS, easing: "ease-out", fill: "forwards" }
      ).onfinish = () => {
        r.remove();
        ripples--;
      };
      boatsLayer.append(r);
    }
  }

  // ---------- 启动画面：小孩跳绳等加载，素材全部到齐或最多 5 秒后淡出 ----------

  (function splash() {
    const SPLASH_MAX = 5000;
    const SPLASH_MIN = 900;
    const start = performance.now();

    const el = document.createElement("div");
    el.className = "splash";
    el.innerHTML = `
      <div class="splash-card">
        <div class="splash-kid"></div>
        <div class="splash-title">小白岛加载中<span class="splash-dots"></span></div>
        <div class="splash-bar"><i></i></div>
        <div class="splash-count">跳了 0 下</div>
      </div>`;
    const kid = createKid(1.5);
    kid.t0 = start;
    el.querySelector(".splash-kid").append(kid.el);
    document.body.append(el);
    kids.push(kid);

    const count = el.querySelector(".splash-count");
    let shown = 0;
    kid.onJump = (n) => {
      if (n !== shown) count.textContent = `跳了 ${(shown = n)} 下`;
    };

    const bar = el.querySelector(".splash-bar i");
    let done = 0;
    const total = loads.length || 1;
    loads.forEach((p) =>
      p.then(() => {
        done++;
        bar.style.width = (done / total) * 100 + "%";
      })
    );

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      bar.style.width = "100%";
      setTimeout(() => {
        el.classList.add("hide");
        setTimeout(() => {
          el.remove();
          kids.splice(kids.indexOf(kid), 1);
          loadExtras();
        }, 600);
      }, Math.max(0, SPLASH_MIN - (performance.now() - start)));
    }
    Promise.all(loads).then(close);
    setTimeout(close, SPLASH_MAX);
  })();

  // ---------- 天气等装饰效果：页面加载完、启动画面关掉后，趁浏览器空闲再加载，不占首屏 ----------

  function loadExtras() {
    const inject = () => {
      const s = document.createElement("script");
      s.src = "weather.js" + VERSION;
      s.async = true;
      document.body.append(s);
    };
    const whenIdle = () =>
      window.requestIdleCallback ? requestIdleCallback(inject, { timeout: 3000 }) : setTimeout(inject, 500);
    document.readyState === "complete" ? whenIdle() : addEventListener("load", whenIdle, { once: true });
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    sailing.forEach((boat) => {
      boat.dist = (boat.dist + boat.speed * dt) % (boat.total * 2);
      const back = boat.dist > boat.total;
      const d = back ? boat.total * 2 - boat.dist : boat.dist;
      const [x, y, seg] = pointAt(boat, d);
      const sign = back ? -1 : 1;
      const ux = (sign * (seg.x1 - seg.x0)) / (seg.len || 1);
      const uy = (sign * (seg.y1 - seg.y0)) / (seg.len || 1);
      const s = boatScale(boat, y);
      // 只要水平方向真的变了就掉头：航线已平滑，横向分量只在真正拐向另一边时变号，不会来回抖
      if (Math.abs(ux) > 0.02 && ux * boat.bowDir < 0) boat.bowDir = -boat.bowDir;
      boat.el.classList.toggle("flip", boat.bowDir < 0 !== boat.faceLeft);
      // 往远处（画面上方）开时船头微微抬起、往近处开时压低，竖着走也看得出是船头在前
      const tiltTo = boat.bowDir * uy * BOAT_TILT;
      boat.tilt += (tiltTo - boat.tilt) * Math.min(1, dt * 2);
      boat.el.style.transform = `translate(${x}px, ${y}px) rotate(${boat.tilt}deg) scale(${s})`;
      boat.el.style.zIndex = Math.round(y);
      boat.wakeGap += boat.speed * dt;
      if (boat.wakeGap >= WAKE_STEP) {
        boat.wakeGap = 0;
        spawnRipple(boat, x, y, ux, uy, s);
      }
    });
    kids.forEach((kid) => kidFrame(kid, now));
    if (mapKid) bubbleFrame(mapKid, now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
