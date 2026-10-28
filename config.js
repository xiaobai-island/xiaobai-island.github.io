/*
 * 聚合页配置：改这里就能换名称、链接和位置。
 * 坐标系是底图原始像素 1024 × 578，(0,0) 在左上角。
 * x / y 是房子「底部中心」落在地图上的点；w 是房子显示宽度。
 */
window.MAP_CONFIG = {
  width: 1024,
  height: 578,
  // 底图写在 index.html 里（多档分辨率 + 预加载），由 tools/build_assets.py 生成

  // 无论屏幕什么比例都必须完整显示的区域（房子名称、船的航线都在里面），区域外的天空和海面可以被裁掉
  safe: { x0: 20, y0: 20, x1: 1004, y1: 515 },

  // 有 name 和 url 的房子会显示名称牌并可点击；不填就只是装饰
  sites: [
    { img: "assets/houses/house-1.webp", x: 160, y: 262, w: 112 },
    { name: "苹果ASO 🍎", url: "https://xiaobai-aso.github.io/", img: "assets/houses/house-2.webp", x: 285, y: 300, w: 112 },
    { name: "玩游戏 🎮", url: "https://xiaobai-kart.github.io/", img: "assets/houses/house-3.webp", x: 400, y: 238, w: 106 },
    { name: "搞钱吧 🤑", url: "https://xiaobai-shouxi.github.io/", img: "assets/houses/house-4.webp", x: 560, y: 248, w: 112 },
    { name: "小工具 🧰", url: "https://xiaobai-toolbox.github.io/", img: "assets/houses/house-5.webp", x: 735, y: 405, w: 112 },
    { img: "assets/houses/house-6.webp", x: 845, y: 300, w: 112 },
  ],

  // 跳绳的小孩：x / y 是脚底落点，h 是人物显示高度；home 是天黑时走进去的门口（苹果ASO 那栋房子）
  // 原地跳 jump 秒，再沿 route 走一圈（途经点会连成平滑曲线，最后回到原点），如此循环
  kid: {
    x: 331, y: 320, h: 26,
    // 门口坐标；path 是进门前要经过的点：从房前草地绕到左边台阶下，再上台阶进门
    home: { x: 264, y: 268, path: [[276, 306], [260, 292], [257, 283], [262, 275]] },
    jump: 8,
    route: [
      [324, 335], [307, 347], [270, 349], [231, 351], [255, 358], [297, 355], [326, 348],
      [340, 334], [349, 310], [360, 291], [381, 284], [402, 294], [415, 318], [411, 337],
      [421, 319], [419, 303], [407, 281], [386, 270], [366, 276], [354, 292], [345, 308],
    ],
  },

  // 新标签页打开填 true
  openInNewTab: true,

  // 天气：按 order 轮换，每种持续 duration 秒，切换渐变 fade 秒
  // horizon 是海平线的 y（以上算天空，星星只出现在天空里），moon 是夜里月亮的位置
  weather: {
    order: ["sunny", "rain", "sunny", "snow", "night"],
    duration: 40,
    fade: 3,
    horizon: 137,
    moon: { x: 560, y: 38 },
    // 屋顶上的时间、温度、天气牌（访客所在城市的真实天气），x / y 是牌子底边中点
    sign: { x: 845, y: 204 },
  },

  // 云：y 是高度，w 是显示宽度，speed 是横穿整张地图需要的秒数
  clouds: [
    { img: "assets/clouds/cloud-1.webp", y: 45,  w: 215, speed: 90,  opacity: 0.95 },
    { img: "assets/clouds/cloud-2.webp", y: 115, w: 160, speed: 120, opacity: 0.9 },
    { img: "assets/clouds/cloud-3.webp", y: 75,  w: 125, speed: 75,  opacity: 0.85 },
    { img: "assets/clouds/cloud-4.webp", y: 35,  w: 160, speed: 105, opacity: 0.95 },
    { img: "assets/clouds/cloud-1.webp", y: 150, w: 120, speed: 140, opacity: 0.8 },
    { img: "assets/clouds/cloud-3.webp", y: 40,  w: 105, speed: 85,  opacity: 0.9 },
  ],

  // 船：沿 route 上的点来回航行（到终点后原路返回），speed 是每秒移动的地图像素
  // 帆船从下方海面沿左侧海岸一路开到左上角远海；越靠近海平线（y 越小）船显示得越小，近大远小
  // face 是船图里船头朝哪边（默认 right），程序据此让船头始终朝前进方向
  perspective: { far: 145, near: 500, min: 0.55 },
  boats: [
    { img: "assets/boats/boat-1.webp", w: 80, speed: 16,
      route: [[470, 505], [330, 500], [190, 498], [70, 480], [2, 452], [-10, 400], [-6, 350], [6, 310],
        [6, 265], [10, 225], [30, 186], [62, 161], [98, 149]] },
    { img: "assets/boats/boat-2.webp", w: 72, speed: 12, face: "left",
      route: [[520, 505], [650, 508], [820, 515], [950, 502]] },
    // 内湖里的小船不按远近缩放
    { img: "assets/boats/boat-3.webp", w: 50, speed: 7, perspective: false, face: "left",
      route: [[530, 328], [600, 318], [665, 330]] },
  ],
};
