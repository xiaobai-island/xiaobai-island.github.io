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
      bob: el.querySelector(".kid-bob"),
      shadow: el.querySelector(".kid-shadow"),
      front: el.querySelector(".rope-front"),
      back: el.querySelector(".rope-back"),
    };
  }

  const kids = [];
  if (cfg.kid) {
    const kid = createKid(cfg.kid.h / 112);
    kid.el.style.left = cfg.kid.x + "px";
    kid.el.style.top = cfg.kid.y + "px";
    kid.el.style.zIndex = Math.round(cfg.kid.y);
    housesLayer.append(kid.el);
    kids.push(kid);
  }

  // 绳子绕身体转一圈 560ms，往下甩时在身前、往上甩时在身后；绳子到脚下时人正好跳到最高
  function kidFrame(kid, now) {
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
    for (let i = 1; i < b.route.length; i++) {
      const [x0, y0] = b.route[i - 1];
      const [x1, y1] = b.route[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      segs.push({ x0, y0, x1, y1, len, start: total });
      total += len;
    }
    return { el, segs, total, speed: b.speed, dist: Math.random() * total * 2 };
  });

  function pointAt(boat, d) {
    const seg = boat.segs.find((s) => d <= s.start + s.len) || boat.segs[boat.segs.length - 1];
    const t = seg.len ? (d - seg.start) / seg.len : 0;
    return [seg.x0 + (seg.x1 - seg.x0) * t, seg.y0 + (seg.y1 - seg.y0) * t, seg.x1 - seg.x0];
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
    boats.forEach((boat) => {
      boat.dist = (boat.dist + boat.speed * dt) % (boat.total * 2);
      const back = boat.dist > boat.total;
      const d = back ? boat.total * 2 - boat.dist : boat.dist;
      const [x, y, dir] = pointAt(boat, d);
      const goingLeft = back ? dir > 0 : dir < 0;
      boat.el.style.transform = `translate(${x}px, ${y}px)`;
      boat.el.style.zIndex = Math.round(y);
      boat.el.classList.toggle("flip", goingLeft);
    });
    kids.forEach((kid) => kidFrame(kid, now));
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
