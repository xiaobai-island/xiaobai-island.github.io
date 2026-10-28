(function () {
  const cfg = window.MAP_CONFIG;
  const viewport = document.getElementById("viewport");
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");

  world.style.width = cfg.width + "px";
  world.style.height = cfg.height + "px";
  // 底图在 index.html 里按屏幕挑分辨率并预加载；下载完之前显示内嵌的模糊占位图
  // 房子、云、船的图片等底图下完再开始下载，不和底图抢带宽；底图太慢时 3 秒后也照常加载
  const mapBg = document.getElementById("mapBg");
  let pending = [];
  function lazySrc(img, src) {
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

  // ---------- 地图比屏幕宽时，可左右拖动（鼠标和触屏通用） ----------

  let drag = null;
  let moved = false;
  viewport.addEventListener("pointerdown", (e) => {
    moved = false;
    if (pan.min === pan.max) return;
    drag = { x: e.clientX, start: pan.x };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
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

  const kid = (() => {
    if (!cfg.kid) return null;
    const K = "assets/kid/";
    const el = document.createElement("div");
    el.className = "kid";
    el.style.left = cfg.kid.x + "px";
    el.style.top = cfg.kid.y + "px";
    el.style.zIndex = Math.round(cfg.kid.y);
    el.style.setProperty("--k", cfg.kid.h / 112);
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
    housesLayer.append(el);
    return {
      bob: el.querySelector(".kid-bob"),
      shadow: el.querySelector(".kid-shadow"),
      front: el.querySelector(".rope-front"),
      back: el.querySelector(".rope-back"),
    };
  })();

  // 绳子绕身体转一圈 560ms，往下甩时在身前、往上甩时在身后；绳子到脚下时人正好跳到最高
  function kidFrame(t) {
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
    if (kid) kidFrame(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
