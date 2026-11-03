/* 宝石商人 - 纯游戏逻辑层（无 DOM 依赖，可被 Node 测试与浏览器共用） */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GemLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLORS = ["diamond", "sapphire", "emerald", "ruby", "onyx"];
  const GOLD = "gold";
  const ALL = COLORS.concat([GOLD]);
  const COLOR_CN = {
    diamond: "钻石", sapphire: "蓝宝石", emerald: "翡翠",
    ruby: "红宝石", onyx: "玛瑙", gold: "黄金"
  };
  const WIN_VP = 15;                 // 默认目标声望（可在开局时用 opts.winVp 覆盖）
  const WIN_VP_MIN = 10, WIN_VP_MAX = 30;
  const HAND_MAX = 3;
  const TOKEN_MAX = 10;

  /* ---------- 可复现随机 ---------- */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ri(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pickW(rng, pairs) {
    let sum = 0; for (const p of pairs) sum += p[1];
    let r = rng() * sum;
    for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }

  /* ---------- 卡池生成（确定性） ---------- */
  const L1N = ["矿脉", "矿坑", "采石场", "竖井", "坑道", "晶洞", "砂矿", "探方"];
  const L2N = ["工坊", "商会", "货栈", "拍卖行", "雕琢室", "商队", "银号", "铺面"];
  const L3N = ["王冠", "至宝", "天穹", "传奇"];
  const CN = { diamond: "钻石", sapphire: "蓝宝石", emerald: "翡翠", ruby: "红宝石", onyx: "玛瑙" };

  function distribute(rng, nColors, total, perMax) {
    const cols = shuffle(COLORS, rng).slice(0, nColors);
    const amt = cols.map(() => 1);
    let rest = total - nColors;
    let guard = 0;
    while (rest > 0 && guard++ < 500) {
      const i = Math.floor(rng() * nColors);
      if (amt[i] < perMax) { amt[i]++; rest--; }
    }
    if (rest > 0) return null;
    const cost = {};
    cols.forEach((c, i) => { cost[c] = amt[i]; });
    return cost;
  }

  function genCost(rng, level, vp) {
    for (let t = 0; t < 100; t++) {
      let nColors, total, perMax;
      if (level === 1) {
        nColors = pickW(rng, vp === 0 ? [[1, 5], [2, 18], [3, 12]] : [[2, 5], [3, 6]]);
        total = vp === 0 ? ri(rng, 2, 4) : ri(rng, 3, 5);
        perMax = 3;
      } else if (level === 2) {
        nColors = ri(rng, 2, vp >= 3 ? 4 : 3);
        total = vp + ri(rng, 3, 5);    // L2 提价：平均约 6.3，减缓「猛刷二级卡」的速度
        perMax = 4;
      } else {
        nColors = ri(rng, 3, 4);
        total = vp + ri(rng, 4, 6);    // L3 门槛：总量 7~11，靠前两级折扣支撑
        perMax = 6;
      }
      total = Math.max(total, nColors);
      total = Math.min(total, nColors * perMax);
      const cost = distribute(rng, nColors, total, perMax);
      if (cost) return cost;
    }
    return { diamond: 2, sapphire: 2 };
  }

  function genCardPool() {
    const rng = makeRng(0x5eedbabe);
    const cards = [];
    const byLevel = { 1: [], 2: [], 3: [] };

    function vpList(level) {
      if (level === 1) return shuffle(new Array(30).fill(0).concat(new Array(10).fill(1)), rng);
      if (level === 2) return shuffle(
        new Array(6).fill(1).concat(new Array(11).fill(2), new Array(13).fill(3)), rng);
      return shuffle(
        new Array(6).fill(3).concat(new Array(8).fill(4), new Array(6).fill(5)), rng);
    }

    [1, 2, 3].forEach(level => {
      const nouns = level === 1 ? L1N : level === 2 ? L2N : L3N;
      const vps = vpList(level);
      vps.forEach((vp, i) => {
        const card = {
          id: cards.length,
          level: level,
          vp: vp,
          cost: genCost(rng, level, vp),
          bonus: null,
          name: nouns[i % nouns.length] // 主题词；色前缀在分配 bonus 后拼接，保证名字色=折扣色=立绘色
        };
        cards.push(card);
        byLevel[level].push(card.id);
      });
      // 奖励色均衡分配
      const n = vps.length;
      const per = n / 5;
      let bonusPool = [];
      COLORS.forEach(c => { for (let k = 0; k < per; k++) bonusPool.push(c); });
      bonusPool = shuffle(bonusPool, rng);
      byLevel[level].forEach((id, i) => { cards[id].bonus = bonusPool[i]; });
      // 名字前缀对齐折扣色：卡名颜色 = 折扣宝石色 = 立绘色（三统一）
      byLevel[level].forEach(id => { const c = cards[id]; c.name = CN[c.bonus] + c.name; });
    });
    return cards;
  }

  const CARD_POOL = genCardPool();
  const CARD_BY_ID = {};
  CARD_POOL.forEach(c => { CARD_BY_ID[c.id] = c; });

  /* 带分卡覆盖表：L3=真实传奇珠宝名+典故，L1/L2=原名+宝石神话典故；img 指向内联立绘 */
  const CARD_OVR = {
  7: { name: "蓝宝石探方", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_excavation" },
  8: { name: "红宝石矿脉", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_orevein" },
  11: { name: "玛瑙竖井", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_shaft" },
  13: { name: "玛瑙晶洞", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_geode" },
  15: { name: "玛瑙探方", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_excavation" },
  18: { name: "钻石采石场", lore: "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。", img: "card_diamond_quarry" },
  25: { name: "蓝宝石矿坑", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_pit" },
  30: { name: "蓝宝石砂矿", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_placer" },
  31: { name: "红宝石探方", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_excavation" },
  38: { name: "翡翠砂矿", lore: "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。", img: "card_emerald_placer" },
  40: { name: "钻石工坊", lore: "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。", img: "card_diamond_workshop" },
  41: { name: "玛瑙商会", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_guild" },
  42: { name: "蓝宝石货栈", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_warehouse" },
  43: { name: "红宝石拍卖行", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_auction" },
  44: { name: "钻石雕琢室", lore: "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。", img: "card_diamond_lapidary" },
  45: { name: "玛瑙商队", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_caravan" },
  46: { name: "玛瑙银号", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_bank" },
  47: { name: "蓝宝石铺面", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_shop" },
  48: { name: "翡翠工坊", lore: "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。", img: "card_emerald_workshop" },
  49: { name: "钻石商会", lore: "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。", img: "card_diamond_guild" },
  50: { name: "红宝石货栈", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_warehouse" },
  51: { name: "翡翠拍卖行", lore: "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。", img: "card_emerald_auction" },
  52: { name: "翡翠雕琢室", lore: "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。", img: "card_emerald_lapidary" },
  53: { name: "翡翠商队", lore: "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。", img: "card_emerald_caravan" },
  54: { name: "蓝宝石银号", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_bank" },
  55: { name: "红宝石铺面", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_shop" },
  56: { name: "蓝宝石工坊", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_workshop" },
  57: { name: "钻石商会", lore: "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。", img: "card_diamond_guild" },
  58: { name: "红宝石货栈", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_warehouse" },
  59: { name: "翡翠拍卖行", lore: "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。", img: "card_emerald_auction" },
  60: { name: "翡翠雕琢室", lore: "翡翠乃「维纳斯之石」，埃及艳后克娄巴特拉为其痴迷，代表重生、春天与希望。", img: "card_emerald_lapidary" },
  61: { name: "蓝宝石商队", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_caravan" },
  62: { name: "蓝宝石银号", lore: "蓝宝石是「天国之石」，古波斯人相信大地浮于一块巨蓝宝石之上，天空遂成湛蓝，象征智慧与诚实。", img: "card_sapphire_bank" },
  63: { name: "钻石铺面", lore: "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。", img: "card_diamond_shop" },
  64: { name: "玛瑙工坊", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_workshop" },
  65: { name: "玛瑙商会", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_guild" },
  66: { name: "钻石货栈", lore: "钻石源自诸神不朽之碎片，亦是梵天之眼、丘比特的箭镞，「坚不可摧」，象征永恒与纯净。", img: "card_diamond_warehouse" },
  67: { name: "玛瑙拍卖行", lore: "玛瑙为护身辟邪之石，古希腊奉为冥王护身之石，层理如命运纹路，能凝神定气。", img: "card_onyx_auction" },
  68: { name: "红宝石雕琢室", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_lapidary" },
  69: { name: "红宝石商队", lore: "红宝石古称「宝石之王」，被视作大地之心的火焰，血色寓生命与激情，古时战士佩之以求战场免伤。", img: "card_ruby_caravan" },
  70: { name: "希望钻石", lore: "45 克拉深蓝名钻，自法国王室辗转入藏史密森尼；传说「携带者皆遭厄运」，是世上最负诅咒之名的钻石。", img: "card_70" },
  71: { name: "印度之星", lore: "563 克拉星光蓝宝石，世界上最大的星光蓝宝石，六道星芒流转，藏于纽约自然历史博物馆。", img: "card_71" },
  72: { name: "穆索翡翠", lore: "哥伦比亚穆索矿的「祖母绿之王」，西班牙征服者自印加帝国掠得，浓绿欲滴，价逾黄金。", img: "card_72" },
  73: { name: "鸽血红", lore: "顶级缅甸红宝石的专属色号，红得如鲜血欲滴、如鸽之血，象征生命、爱火与不灭的激情。", img: "card_73" },
  74: { name: "黑奥尔洛夫", lore: "又称「梵天之眼」的 67 克拉黑钻，传说自印度神像双眼取出，数任持有者相继自戕，邪名远播。", img: "card_74" },
  75: { name: "库里南", lore: "1905 年南非出土的 3106 克拉巨钻，切磨成英王权杖顶端的「非洲之星」，至今仍是世界最大宝石金刚石。", img: "card_75" },
  76: { name: "洛根蓝宝", lore: "423 克拉克什米尔蓝宝石，史密森尼镇馆之宝，色泽深邃如午夜之海，重逾一般王冠主石。", img: "card_76" },
  77: { name: "穆伊斯卡", lore: "黄金国 El Dorado 的传说：穆伊斯卡酋长身涂金粉、乘满载祖母绿的金筏行于湖上，献祭诸神。", img: "card_77" },
  78: { name: "日出红宝石", lore: "缅甸「鸽血红」，2015 年拍出近 3000 万美元，刷新红宝石拍卖纪录，如一轮凝固的朝阳。", img: "card_78" },
  79: { name: "大法国浮雕", lore: "罗马帝国以缟玛瑙雕成的五层巨型浮雕，法国王室旧藏，是古罗马浮雕工艺的巅峰之作。", img: "card_79" },
  80: { name: "光之山", lore: "波斯语意为「光之山」，印度与英国王室辗转相夺，古训有云：「谁拥有它，便统治印度。」", img: "card_80" },
  81: { name: "克什米尔", lore: "喜马拉雅绝矿所出，独有的「矢车菊蓝」如丝绒般柔和；矿脉早绝，举世珍稀，每一颗皆成绝响。", img: "card_81" },
  82: { name: "德文郡翡翠", lore: "德文公爵家传的巨型哥伦比亚祖母绿，未经雕琢即见纯粹的绿，是欧洲最负盛名的祖母绿藏品。", img: "card_82" },
  83: { name: "卡门·露西娅", lore: "史密森尼的 23 克拉缅甸鸽血红宝石，为纪念卡门·露西娅·巴普蒂斯塔而命名入藏。", img: "card_83" },
  84: { name: "图坦卡蒙之瞳", lore: "法老图坦卡蒙黄金面具以黑曜石与石英嵌成双眼，凝视永恒三千年，被视为通往来世之窗。", img: "card_84" },
  85: { name: "摄政王", lore: "法国王冠的 140 克拉无瑕美钻，曾镶于路易十五加冕冠，法国大革命中于橱内被窃，下落成谜。", img: "card_85" },
  86: { name: "斯图亚特蓝宝", lore: "英国王室旧藏，历经苏格兰王室流转，曾先后镶于王冠与嘉德勋章，见证帝国兴替。", img: "card_86" },
  87: { name: "克娄巴特拉", lore: "埃及艳后专属西奈矿坑所出，她以翡翠镶嵌冠饰与项链，后世视翡翠为重生与春神之石。", img: "card_87" },
  88: { name: "抹谷红宝", lore: "缅甸抹谷「红宝石谷」自古产出最纯正的鸽血红，传说山谷由巨龙守护，采者必先祈福。", img: "card_88" },
  89: { name: "冥王之石", lore: "古希腊罗马奉黑色缟玛瑙为冥王哈迪斯的护身之石，据说能镇定魂魄、辟除邪祟，随葬以护来世。", img: "card_89" }
};
  // 应用覆盖：L3 改真实珠宝名；全部带分卡附加 lore/img。
  // L1/L2 名字保留引擎对齐后的（名字色=折扣色），不覆盖。
  CARD_POOL.forEach(c => {
    const o = CARD_OVR[c.id];
    if (!o) return;
    if (c.level === 3) c.name = o.name; // 仅 L3 用真实珠宝名
    c.lore = o.lore;
    c.img = o.img;
  });

  /* ---------- 贵族神（4 张固定，需求与原贵族一致以保平衡） ---------- */
  const NOBLES = [
    { id: 0, name: "盖亚", title: "大地之母", req: { emerald: 3, ruby: 3 }, vp: 4, img: "noble_gaia" },
    { id: 1, name: "雅典娜", title: "智慧女神", req: { diamond: 3, sapphire: 3 }, vp: 4, img: "noble_athena" },
    { id: 2, name: "阿波罗", title: "太阳神", req: { sapphire: 2, emerald: 2, diamond: 2 }, vp: 4, img: "noble_apollo" },
    { id: 3, name: "赫菲斯托斯", title: "锻造之神", req: { ruby: 2, onyx: 2, diamond: 2 }, vp: 4, img: "noble_hephaestus" },
    // 神谕模式扩充贵族：复用已有立绘，条件错开（2色3/3 与 3色2/2/2 混排），避免全员抢同款卡
    { id: 4, name: "赫尔墨斯", title: "商业之神", req: { ruby: 3, onyx: 3 }, vp: 4, img: "noble_athena" },
    { id: 5, name: "阿尔忒弥斯", title: "狩猎女神", req: { emerald: 3, onyx: 3 }, vp: 4, img: "noble_gaia" },
    { id: 6, name: "德墨忒尔", title: "谷物女神", req: { emerald: 3, diamond: 3 }, vp: 4, img: "noble_gaia" },
    { id: 7, name: "赫拉", title: "天后", req: { sapphire: 4, ruby: 4 }, vp: 4, img: "noble_athena" },
    { id: 8, name: "阿瑞斯", title: "战神", req: { ruby: 3, diamond: 3 }, vp: 4, img: "noble_hephaestus" },
    { id: 9, name: "狄俄涅", title: "海之女神", req: { sapphire: 3, onyx: 3 }, vp: 4, img: "noble_apollo" },
    { id: 10, name: "赫卡忒", title: "十字路口女神", req: { emerald: 2, onyx: 2, sapphire: 2 }, vp: 4, img: "noble_apollo" }
  ];
  const NOBLE_BY_ID = {};
  NOBLES.forEach(n => { NOBLE_BY_ID[n.id] = n; });

  /* ---------- 可选神祇（13 位，各带特技） ---------- */
  /* tier: 1=强势 2=均衡 3=冷门（内部平衡标签）; lore: 希腊神话典故 */
  const GODS = [
    { id: "midas", name: "米达斯", title: "点金之手", tier: 3, ability: "点金：拿取 2 枚同色宝石时，50% 概率其中一枚化作黄金。", img: "god_midas",
      lore: "弗里吉亚国王，因款待酒神获点金术——凡触手之物皆成黄金，连女儿与食物也未能幸免，最终在溪边祈求而解。" },
    { id: "plutus", name: "普路托斯", title: "财富之神", tier: 1, ability: "斗富：连续 2 回合保持全场宝石最多（含并列），买牌可少付一枚。", img: "god_plutus",
      lore: "希腊财神，本为农业丰饶之神；神话中他双目失明，故财富分配全凭命运，而非公允。" },
    { id: "medusa", name: "美杜莎", title: "蛇发女妖", tier: 3, ability: "拿宝石或压牌后，可免费指定一色：直至你下回合，其他角色不能拿该色。", img: "god_medusa",
      lore: "原为雅典娜神殿女祭司，因被波塞冬玷污于神殿、又遭雅典娜嫉恨，一头秀发被化为毒蛇，凡见其面者尽成石像。" },
    { id: "prometheus", name: "普罗米修斯", title: "盗火者", tier: 2, ability: "不能压牌；限三次，买牌时指定一张明牌，本回合视作拥有其宝石奖励（对贵族无效）。", img: "god_prometheus",
      lore: "提坦神族，盗天火予人间，又以脂膏裹枯木愚弄宙斯。被缚高加索山崖，日日遭神鹰啄食肝脏，夜复重生。" },
    { id: "typhon", name: "堤丰", title: "巨兽之父", tier: 2, ability: "不能压牌；每当你买牌，可将一张同级明牌埋底并补新。", img: "god_typhon",
      lore: "盖亚与塔尔塔罗斯之子，百首巨蟒，曾掰下奥林匹斯山掷向诸神。败于宙斯雷火，被压于埃特纳火山之下。" },
    { id: "phaethon", name: "法厄同", title: "太阳战车", tier: 2, ability: "拿宝石必须拿满三种不同色；拿满后可弃一枚换一金。", img: "god_phaethon",
      lore: "太阳神赫利俄斯之子，为证身世强驾父亲的日车，因控不住天马而焚焦大地，终被宙斯雷电击落。" },
    { id: "cupid", name: "丘比特", title: "爱神", tier: 2, ability: "不能接待贵族；其他角色接待贵族时，你获得 2 声望。", img: "god_cupid",
      lore: "维纳斯之子，执金箭令人心生爱慕、执铅箭令人生厌。曾误中河神女儿俄耳甫斯之妻，酿成冥府寻妻的悲剧。" },
    { id: "zeus", name: "宙斯", title: "众神之王", tier: 1, ability: "不能购买 1 级牌；购买 2、3 级牌可少付一枚（每 5 回合限一次）。", img: "god_zeus",
      lore: "奥林匹斯山主神，执雷霆权杖，裁决人间善恶、主持神圣盟约，亦以多情著称。" },
    { id: "hera", name: "赫拉", title: "天后", tier: 3, ability: "其他角色接待贵族前须经你同意；你拒绝则其本回合不能接待，且你获得 1 声望（拒绝不再弃宝石）。", img: "god_hera",
      lore: "宙斯之妻与姐姐，婚姻与生育守护神。因宙斯风流而嫉恨百出，特洛伊之战即由她一手掀起。" },
    { id: "poseidon", name: "波塞冬", title: "海神", tier: 2, ability: "不能拿两枚同色；每回合一次，若某色桌上仅剩一枚，你可免费拿走。", img: "god_poseidon",
      lore: "执三叉戟，跺脚成海啸、挥戟裂大地。与雅典娜争当雅典守护神，以海中首驹为礼而胜。" },
    { id: "hades", name: "哈迪斯", title: "冥王", tier: 1, ability: "不能压牌；若全部其他角色都有压牌，你买牌可少付一枚。", img: "god_hades",
      lore: "宙斯长兄，掌管冥府与地下宝藏，三兄弟抽签各得天地冥。其妻珀耳塞福奈为谷物女神之女，被掳入冥府。" },
    { id: "hermes", name: "赫尔墨斯", title: "信使与窃贼", tier: 3, ability: "① 若你的永久色达到某贵族需求，可偷取其他角色持有的该贵族；② 可压住桌上一位贵族：得 1 黄金，且他人直到你下回合结束前不能接待它。", img: "god_hermes",
      lore: "宙斯信使，穿飞鞋往来神人两界，亦是商旅、小偷与辩术的守护神。出生当日即盗走阿波罗的牛群。" },
    { id: "dionysus", name: "狄俄尼索斯", title: "酒神", tier: 1, ability: "不能压牌；你的回合结束时，若你的宝石数是全场最少（并列不算，须严格最少），可从桌上再免费取一枚。", img: "god_dionysus",
      lore: "葡萄酒与狂欢之神，两次诞生：先为宙斯凡人妻子塞墨勒所生，后由宙斯缝入大腿孕育至成熟。" }
  ];
  const GOD_BY_ID = {};
  GODS.forEach(g => { GOD_BY_ID[g.id] = g; });
  const NO_RESERVE_GODS = ["prometheus", "typhon", "hades", "dionysus"];

  const PLAYER_META = [
    { name: "薇拉", role: "见习商人", img: "char_player", human: true },
    { name: "艾可", role: "学院经纪人", img: "char_ai1", human: false },
    { name: "皮帕", role: "矿工鉴定师", img: "char_ai2", human: false }
  ];

  /* ---------- 状态 ---------- */
  function newGame(seed, opts) {
    opts = opts || {};
    const rng = makeRng(seed >>> 0 || 1);
    const decks = {};
    [1, 2, 3].forEach(lv => {
      decks[lv] = shuffle(
        CARD_POOL.filter(c => c.level === lv).map(c => c.id), rng);
    });
    const market = { 1: [], 2: [], 3: [] };
    [1, 2, 3].forEach(lv => {
      for (let i = 0; i < 4; i++) market[lv].push(decks[lv].length ? decks[lv].pop() : null);
    });
    // 座位表：opts.seats 显式给出（网络对战用），否则按 playerCount 取 PLAYER_META 前 n 位
    const metas = opts.seats && opts.seats.length
      ? opts.seats.map((s, i) => Object.assign({}, PLAYER_META[i] || PLAYER_META[0], s))
      : PLAYER_META.slice(0, opts.playerCount || PLAYER_META.length);
    const nPlayers = metas.length;

    // 宝石池按人数：官方规则 2 人 4 枚/色、3 人 5 枚/色
    const pool = {};
    const perColor = nPlayers <= 2 ? 4 : 5;
    COLORS.forEach(c => { pool[c] = perColor; });
    pool[GOLD] = 5;

    // 神祇分配：opts.godAssign = [godId|null, ...]，null 时自动随机补足且不重复
    // opts.noGods = true 时为「经典模式」：全员无神、跳过随机补神
    const noGods = !!opts.noGods;
    // 神谕模式：先把本局神谕目标定下来（大厅已定则传入 oracleType，否则按种子随机），
    // 再据此剔除「与目标冲突的神」，避免选米达斯躺赢神恩富矿这类破坏平衡的组合。
    const oracleMode = !!opts.oracleMode;
    let oracleType = null;
    if (oracleMode) {
      oracleType = (opts.oracleType && ORACLE_TYPES[opts.oracleType])
        ? opts.oracleType
        : shuffle(ORACLE_KEYS.slice(), rng)[0];
    }
    const bannedGods = oracleMode ? oracleBannedGods(oracleType) : [];
    const usedGods = (opts.godAssign || []).filter(Boolean);
    const godPool = shuffle(GODS.map(g => g.id).filter(id => bannedGods.indexOf(id) < 0), rng);
    let gi = 0;
    const players = metas.map((m, i) => {
      let god = noGods ? null : ((opts.godAssign && opts.godAssign[i]) || null);
      // 人选/指定的神若与本局神谕冲突 → 强制换成池内未被占用的非冲突神
      if (god && bannedGods.indexOf(god) >= 0) {
        while (gi < godPool.length && usedGods.indexOf(godPool[gi]) >= 0) gi++;
        god = godPool[gi++] || null;
        if (god && usedGods.indexOf(god) >= 0) god = null;
      }
      if (!god && !noGods) {
        while (gi < godPool.length && usedGods.indexOf(godPool[gi]) >= 0) gi++;
        god = godPool[gi++] || null;
        if (usedGods.indexOf(god) >= 0) god = null;
        else if (god) usedGods.push(god);
      }
      if (god && usedGods.indexOf(god) < 0) usedGods.push(god);
      return {
        idx: i, name: m.name, role: m.role, img: m.img, isHuman: !!m.human,
        god: god, godUses: { fire: 3 }, bonusVp: 0,
        tokens: (() => { const t = {}; ALL.forEach(c => { t[c] = 0; }); return t; })(),
        reserved: [], cards: [], nobles: [], turns: 0, zeusCd: null, plutusStreak: 0
      };
    });

    const first = opts.firstPlayer != null
      ? ((opts.firstPlayer % nPlayers) + nPlayers) % nPlayers
      : Math.floor(rng() * nPlayers);
    // 贵族上桌数：2 人局 3 张，3 人局 4 张（官方规则）
    // 经典/神战模式：只用原版 4 张贵族（id 0-3），保持官方规则不变
    // 神谕模式：启用全部 11 张贵族——桌面 4 张 + nobleReserve 备用池（接待后自动补位，
    //          保证「接待≥2贵族」的神谕目标不会因桌面贵族被抢光而卡死）
    const classicNobles = NOBLES.filter(n => n.id <= 3).map(n => n.id);
    const allNobles = NOBLES.map(n => n.id);
    const nobleAll = shuffle(oracleMode ? allNobles : classicNobles, rng);
    const nobleShown = Math.min(nobleAll.length, nPlayers <= 2 ? 3 : 4);
    const noblePool = nobleAll.slice(0, nobleShown);
    const nobleReserve = oracleMode ? nobleAll.slice(nobleShown) : [];
    const st = {
      seed: seed >>> 0 || 1,
      players: players,
      playerCount: nPlayers,
      noGods: noGods,        // 经典模式：全员无神
      oracleMode: !!opts.oracleMode,
      oracleType: oracleType,        // 本局神谕目标（非神谕模式为 null）
      bannedGods: bannedGods,        // 与本局神谕冲突、已被剔除的神 id 列表
      winVp: Math.max(WIN_VP_MIN, Math.min(WIN_VP_MAX, opts.winVp || WIN_VP)),
      pool: pool,
      decks: decks,
      market: market,
      nobles: noblePool,
      nobleReserve: nobleReserve,   // 神谕模式：备用贵族，接待后补位
      oracles: [],
      turn: first,
      firstPlayer: first,
      plans: players.map(() => null),   // AI 的贵族攻略目标（惰性设定）
      phase: "action",        // action | discard | noble | hera | distribute | over
      discardNeed: 0,
      pendingNobles: null,
      curse: null,            // 美杜莎诅咒 {color, owner}
      nobleLocks: [],         // 赫尔墨斯压住的贵族 [{id, owner, until}]
      turnTokenMax: null,     // 狄俄尼索斯回合 = 12
      dist: null,             // 狂欢分发 {queue:[...], extra:bool}
      endTrigger: null,       // 触发者已完成的回合数
      turnsTotal: 0,          // 已进行的回合总数（防僵局保险）
      winner: null,
      log: []
    };
    if (opts.oracleMode) initOracles(st, oracleType);
    players.forEach(pl => {
      const gd = GOD_BY_ID[pl.god];
      if (gd) st.log.push(`${pl.name} 选择了 ${gd.name}·${gd.title}`);
    });
    st.log.push(`先手：${players[first].name}`);
    return st;
  }

  function cloneState(st) {
    return {
      seed: st.seed,
      players: st.players.map(p => ({
        idx: p.idx, name: p.name, role: p.role, img: p.img, isHuman: p.isHuman,
        god: p.god, godUses: Object.assign({}, p.godUses), bonusVp: p.bonusVp || 0,
        tokens: Object.assign({}, p.tokens),
        reserved: p.reserved.slice(), cards: p.cards.slice(), nobles: p.nobles.slice(),
        turns: p.turns, zeusCd: p.zeusCd, plutusStreak: p.plutusStreak || 0
      })),
      pool: Object.assign({}, st.pool),
      decks: { 1: st.decks[1].slice(), 2: st.decks[2].slice(), 3: st.decks[3].slice() },
      market: { 1: st.market[1].slice(), 2: st.market[2].slice(), 3: st.market[3].slice() },
      nobles: st.nobles.slice(),
      nobleReserve: (st.nobleReserve || []).slice(),
      oracles: st.oracles ? st.oracles.map(o => ({ id: o.id, type: o.type, claimedBy: o.claimedBy != null ? o.claimedBy : null })) : [],
      turn: st.turn,
      firstPlayer: st.firstPlayer,
      playerCount: st.playerCount,
      noGods: !!st.noGods,
      oracleMode: !!st.oracleMode,
      oracleType: st.oracleType != null ? st.oracleType : null,
      bannedGods: (st.bannedGods || []).slice(),
      winVp: st.winVp,
      plans: st.plans ? st.plans.slice() : st.players.map(() => null),
      phase: st.phase,
      discardNeed: st.discardNeed,
      pendingNobles: st.pendingNobles ? st.pendingNobles.slice() : null,
      curse: st.curse ? { color: st.curse.color, owner: st.curse.owner } : null,
      nobleLocks: (st.nobleLocks || []).map(l => ({ id: l.id, owner: l.owner, until: l.until })),
      turnTokenMax: st.turnTokenMax,
      dist: st.dist ? { queue: st.dist.queue.slice(), extra: st.dist.extra } : null,
      endTrigger: st.endTrigger,
      turnsTotal: st.turnsTotal || 0,
      winner: st.winner,
      hist: (st.hist || []).slice(),
      log: st.log.slice()
    };
  }

  /* ---------- 查询 ---------- */
  function getCard(st, ref) {
    if (ref.zone === "market") return CARD_BY_ID[st.market[ref.level][ref.idx]];
    if (ref.zone === "hand") return CARD_BY_ID[ref.cardId];
    if (ref.zone === "deck") return CARD_BY_ID[st.decks[ref.level][st.decks[ref.level].length - 1]];
    return null;
  }
  function bonusCounts(p) {
    const b = {};
    COLORS.forEach(c => { b[c] = 0; });
    p.cards.forEach(id => { b[CARD_BY_ID[id].bonus]++; });
    return b;
  }
  function vpOf(p) {
    let v = p.bonusVp || 0;
    p.cards.forEach(id => { v += CARD_BY_ID[id].vp; });
    p.nobles.forEach(id => { v += NOBLE_BY_ID[id].vp; });
    return v;
  }
  function totalTokens(p) {
    let t = 0; ALL.forEach(c => { t += p.tokens[c]; }); return t;
  }
  /* ---------- 神祇辅助 ---------- */
  function hasGod(st, pIdx, id) { return st.players[pIdx].god === id; }
  function godIdx(st, id) {
    for (const p of st.players) if (p.god === id) return p.idx;
    return -1;
  }
  function tokenLimit(st, pIdx) { return st.turnTokenMax != null ? st.turnTokenMax : TOKEN_MAX; }

  /* 买牌的平铺折扣（宙斯 / 普路托斯 / 哈迪斯） */
  function godBuyDiscount(st, pIdx, card) {
    const p = st.players[pIdx];
    const g = p.god;
    if (!g) return 0;
    if (g === "zeus" && card.level >= 2) {
      if (!(p.zeusCd != null && p.turns < p.zeusCd)) return 1;   // CD5：触发后等 5 个自己的回合
    }
    if (g === "plutus") {
      const my = totalTokens(p);
      const lead = st.players.every((q, i) => i === pIdx || totalTokens(q) <= my);
      if (lead && (p.plutusStreak || 0) >= 2) return 1;          // 连续 2 回合保持全场最多（含并列）
    }
    if (g === "hades") {
      const oppTotal = st.players.length - 1;
      const oppReserved = st.players.filter((q, i) => i !== pIdx && (q.reserved || []).length > 0).length;
      if (oppReserved === oppTotal) return 1;                    // 全部其他角色都压牌
    }
    return 0;
  }

  /* 购买一张卡的每色需求（奖励 + 盗火 + 神技折扣，未用黄金抵扣）
     opts.fireFrom = 明牌 cardId 或 ref（普罗米修斯盗火） */
  function effectiveCost(st, pIdx, card, opts) {
    const p = st.players[pIdx];
    const b = bonusCounts(p);
    const per = {};
    let total = 0;
    COLORS.forEach(c => {
      per[c] = Math.max(0, (card.cost[c] || 0) - (b[c] || 0));
      total += per[c];
    });
    if (opts && opts.fireFrom != null && p.god === "prometheus") {
      const fc = typeof opts.fireFrom === "number" ? CARD_BY_ID[opts.fireFrom] : getCard(st, opts.fireFrom);
      if (fc && per[fc.bonus] > 0) { per[fc.bonus]--; total--; }
    }
    const flat = godBuyDiscount(st, pIdx, card);
    if (flat > 0) {
      let c0 = null;
      COLORS.forEach(c => { if (per[c] > 0 && (c0 == null || per[c] > per[c0])) c0 = c; });
      if (c0 != null) { per[c0] -= flat; total -= flat; }
    }
    return { per: per, total: Math.max(0, total) };
  }
  /* 黄金抵扣后仍缺的宝石总数 */
  function gemsMissing(st, pIdx, card, opts) {
    const p = st.players[pIdx];
    const ec = effectiveCost(st, pIdx, card, opts);
    let need = 0;
    COLORS.forEach(c => { need += Math.max(0, ec.per[c] - p.tokens[c]); });
    return Math.max(0, need - (p.tokens[GOLD] || 0));
  }
  function canAfford(st, pIdx, card, opts) {
    return gemsMissing(st, pIdx, card, opts) === 0;
  }
  /* 被赫尔墨斯压住的贵族：其主人之外的玩家不能接待 */
  function lockedByOther(st, nid, pIdx) {
    return (st.nobleLocks || []).some(l => l.id === nid && l.owner !== pIdx);
  }

  function eligibleNobles(st, pIdx) {
    const p = st.players[pIdx];
    if (p.god === "cupid") return [];   // 丘比特不能接待贵族
    const b = bonusCounts(p);
    return st.nobles.filter(nid => {
      if (lockedByOther(st, nid, pIdx)) return false;
      const req = NOBLE_BY_ID[nid].req;
      return Object.keys(req).every(c => (b[c] || 0) >= req[c]);
    });
  }

  /* ---------- 合法行动 ---------- */
  function legalActions(st, pIdx) {
    const p = st.players[pIdx];
    const g = p.god;
    const acts = [];
    if (st.phase === "over") return acts;
    if (st.phase === "discard") {
      // 退牌阶段：返回至少一个合法弃牌动作（贪心凑满 discardNeed 枚）。
      // 不枚举所有组合（组合爆炸），但保证 legalActions 非空，避免上层误判死锁。
      const need = st.discardNeed || 0;
      if (need > 0) {
        const cols = [];
        const order = COLORS.slice().sort((a, b) => (p.tokens[b] || 0) - (p.tokens[a] || 0));
        for (const c of order) {
          let k = p.tokens[c] || 0;
          while (k-- > 0 && cols.length < need) cols.push(c);
          if (cols.length >= need) break;
        }
        let g = p.tokens[GOLD] || 0;
        while (g-- > 0 && cols.length < need) cols.push(GOLD);
        if (cols.length === need) acts.push({ type: "discard", colors: cols });
      }
      return acts;
    }
    if (st.phase === "distribute") {
      // 狄俄尼索斯狂欢：由队首角色选一枚宝石（无处可拿则跳过）
      const q = st.dist && st.dist.queue.length ? st.dist.queue[0] : pIdx;
      const qp = st.players[q];
      const lim = tokenLimit(st, q);
      let any = false;
      COLORS.forEach(c => {
        if (st.pool[c] > 0 && totalTokens(qp) < lim) { acts.push({ type: "pickGem", color: c }); any = true; }
      });
      if (!any) acts.push({ type: "pickGem", color: null });
      return acts;
    }
    if (st.phase === "gift") {
      // 狄俄尼索斯赐福：只有本人可选一枚（桌上无货则跳过）
      const gp = st.players[st.turn];
      const glim = tokenLimit(st, st.turn);
      let anyG = false;
      COLORS.forEach(c => {
        if (st.pool[c] > 0 && totalTokens(gp) < glim) { acts.push({ type: "pickGem", color: c }); anyG = true; }
      });
      if (!anyG) acts.push({ type: "pickGem", color: null });
      return acts;
    }
    if (st.phase === "hera") {
      // 决策权在赫拉（与 pIdx 无关）；拒绝只需弃一枚普通宝石，不必弃金
      const h = st.players[godIdx(st, "hera")];
      acts.push({ type: "veto", allow: true });
      if (COLORS.some(c => (h.tokens[c] || 0) > 0)) acts.push({ type: "veto", allow: false });
      return acts;
    }
    if (st.phase === "noble") {
      (st.pendingNobles || []).forEach(id => acts.push({ type: "chooseNoble", id: id }));
      return acts;
    }
    // 拿取：1~3 枚不同色，或 2 枚同色（受美杜莎诅咒 / 神技限制）
    // 筹码已满时不给 take（拿了也会被退回，等于白走一回合）
    const blocked = st.curse && st.curse.owner !== pIdx ? st.curse.color : null;
    const atCap = totalTokens(p) >= tokenLimit(st, pIdx);
    const avail = atCap ? [] : COLORS.filter(c => st.pool[c] > 0 && c !== blocked);
    if (g === "phaethon") {
      // 法厄同：必须拿满三种不同色
      for (let i = 0; i < avail.length; i++)
        for (let j = i + 1; j < avail.length; j++)
          for (let k = j + 1; k < avail.length; k++)
            acts.push({ type: "take", colors: [avail[i], avail[j], avail[k]] });
    } else {
      for (let i = 0; i < avail.length; i++)
        for (let j = i + 1; j < avail.length; j++)
          for (let k = j + 1; k < avail.length; k++)
            acts.push({ type: "take", colors: [avail[i], avail[j], avail[k]] });
      for (let i = 0; i < avail.length; i++)
        for (let j = i + 1; j < avail.length; j++)
          acts.push({ type: "take", colors: [avail[i], avail[j]] });
      avail.forEach(c => acts.push({ type: "take", colors: [c] }));
      if (g !== "poseidon" && !atCap) {
        COLORS.forEach(c => {
          if (st.pool[c] >= 4 && c !== blocked) acts.push({ type: "take", colors: [c, c] });
        });
      }
    }
    // 波塞冬恩赐：某色桌上仅剩一枚 → 可免费多拿一枚
    if (g === "poseidon" && !atCap) {
      const gifts = COLORS.filter(c => st.pool[c] === 1 && c !== blocked);
      if (gifts.length) {
        const base = acts.slice();
        base.forEach(a => gifts.forEach(gc => {
          if (a.colors.indexOf(gc) === -1)
            acts.push({ type: "take", colors: a.colors.slice(), bonus: gc });
        }));
      }
    }
    // 米达斯：点金改为被动——拿 2 同色宝石时 50% 化金（见 take 分支），不再有独立动作

    // 预留（堤丰/盗火/哈迪斯/狄俄尼索斯不能压牌；宙斯不能压 1 级——压了也永远买不了）
    if (p.reserved.length < HAND_MAX && NO_RESERVE_GODS.indexOf(g) === -1) {
      [1, 2, 3].forEach(lv => {
        if (g === "zeus" && lv === 1) return;
        if (st.decks[lv].length) acts.push({ type: "reserve", ref: { zone: "deck", level: lv } });
      });
      [1, 2, 3].forEach(lv => {
        if (g === "zeus" && lv === 1) return;
        st.market[lv].forEach((id, idx) => {
          if (id != null) acts.push({ type: "reserve", ref: { zone: "market", level: lv, idx: idx } });
        });
      });
    }
    // 购买（宙斯不能买 1 级）
    [1, 2, 3].forEach(lv => {
      if (g === "zeus" && lv === 1) return;
      st.market[lv].forEach((id, idx) => {
        if (id != null && canAfford(st, pIdx, CARD_BY_ID[id]))
          acts.push({ type: "buy", ref: { zone: "market", level: lv, idx: idx } });
      });
    });
    p.reserved.forEach(id => {
      const rc = CARD_BY_ID[id];
      if (g === "zeus" && rc.level === 1) return;   // 宙斯不可购 1 级（含手牌）
      if (canAfford(st, pIdx, rc))
        acts.push({ type: "buy", ref: { zone: "hand", cardId: id } });
    });
    // 赫尔墨斯：① 偷取贵族（永久色达到需求即可，不必再多 1）
    //          ② 压住桌上某位贵族（得 1 黄金，且锁住直到自己下回合结束）
    if (g === "hermes") {
      const b = bonusCounts(p);
      st.players.forEach((q, i) => {
        if (i === pIdx) return;
        q.nobles.forEach(nid => {
          const req = NOBLE_BY_ID[nid].req;
          if (Object.keys(req).every(c => (b[c] || 0) >= req[c]))
            acts.push({ type: "steal", nobleId: nid, from: i });
        });
      });
      const myLocks = (st.nobleLocks || []).filter(l => l.owner === pIdx).map(l => l.id);
      const canPress = totalTokens(p) < tokenLimit(st, pIdx);   // 与 applyAction 校验保持一致
      if (canPress) st.nobles.forEach(nid => {
        if (myLocks.indexOf(nid) !== -1) return;          // 已压住的不重复压
        if ((st.nobleLocks || []).some(l => l.id === nid)) return; // 别人压着的不给压
        if (eligibleNobles(st, pIdx).indexOf(nid) !== -1) return;  // 自己能直接接待，不必压
        acts.push({ type: "pressNoble", nobleId: nid });
      });
    }
    // 退还宝石：把手上的筹码放回牌池。这是打破「全员满筹码 + 池子枯竭」僵局的唯一出口，
    // 也让自己能主动调整颜色构成（退掉散色，下回合重新拿需要的色）。
    // 筹码已满时必须能退，否则会永久卡住；未满时也允许退（换色策略）。
    const returnable = COLORS.filter(c => (p.tokens[c] || 0) > 0 && st.pool[c] < 5);
    if (returnable.length) {
      // 每个可退色各给「退 1 枚」，以及「退到池子满为止」
      returnable.forEach(c => {
        acts.push({ type: "returnGems", colors: [c] });
        const room = 5 - st.pool[c];                 // 池子还能收几枚
        const n = Math.min(p.tokens[c], room);
        if (n > 1) {
          const arr = []; for (let i = 0; i < n; i++) arr.push(c);
          acts.push({ type: "returnGems", colors: arr });
        }
      });
    }

    // 兜底：桌上宝石枯竭且无力购牌/压牌时，允许跳过回合（避免死锁）
    if (!acts.length) acts.push({ type: "pass" });
    return acts;
  }

  /* ---------- 结算 ---------- */
  function refillMarket(st, level) {
    if (st.market[level].indexOf(null) === -1) return;
    st.market[level] = st.market[level].map(slot =>
      slot === null && st.decks[level].length ? st.decks[level].pop() : slot);
  }
  function returnToPool(st, colors) {
    colors.forEach(c => { st.pool[c]++; });
  }

  /* 狄俄尼索斯回合结束时：把所有仍持有 >10 枚的玩家自动退还到 10。
     退还策略：优先退持有量最大的普通色（保留灵活性），黄金最后退。 */
  function enforceAllTokenCap(st, events) {
    st.players.forEach(p => {
      let over = totalTokens(p) - TOKEN_MAX;
      if (over <= 0) return;
      const returned = [];
      const order = COLORS.slice().sort((a, b) => (p.tokens[b] || 0) - (p.tokens[a] || 0)); // 从多到少
      for (const c of order) {
        while (over > 0 && (p.tokens[c] || 0) > 0) { p.tokens[c]--; st.pool[c]++; returned.push(c); over--; }
        if (over <= 0) break;
      }
      // 普通色退完还不够（极端：黄金超多）→ 退黄金
      while (over > 0 && p.tokens[GOLD] > 0) { p.tokens[GOLD]--; st.pool[GOLD]++; returned.push(GOLD); over--; }
      if (returned.length) {
        events.push({ k: "autoDiscard", p: p.idx, colors: returned });
        st.log.push(`${p.name} 狂欢结束，退还 ${returned.length} 枚至桌上`);
      }
    });
  }

  function finishTurn(st, events) {
    const p = st.players[st.turn];
    p.turns++;
    // 普路托斯：回合结束结算连击（本回合是否仍为全场宝石最多，含并列）
    if (p.god === "plutus") {
      const my = totalTokens(p);
      const lead = st.players.every((q, i) => i === p.idx || totalTokens(q) <= my);
      p.plutusStreak = lead ? (p.plutusStreak || 0) + 1 : 0;
    }
    st.turnsTotal = (st.turnsTotal || 0) + 1;
    // 僵局保险：正常对局约 20 回合/人；超过 60 回合/人说明双方都推进不了（宝石枯竭 + 全员买不起）
    if (st.turnsTotal > st.players.length * 60) {
      st.phase = "over";
      st.winner = computeWinner(st);
      events.push({ k: "over", winner: st.winner, stall: true,
        scores: st.players.map(q => ({ name: q.name, vp: vpOf(q), cards: q.cards.length })) });
      st.log.push("对局超长，按当前声望结算");
      return;
    }
    // 神谕模式：回合结束（贵族/声望结算后）校验即时胜利。
    // 必须放在声望终局判定之前——否则「最后一轮补齐神谕」会被先行的声望结算吞掉胜果
    if (st.oracles && st.oracles.length) {
      const oc = checkOracles(st, st.turn);
      if (oc) {
        events.push({ k: "oracle", p: st.turn, id: oc.id, name: oc.name });
        st.log.push(`${st.players[st.turn].name} 完成神谕·${oc.name}，直接获胜！`);
        return;
      }
    }
    // 神谕模式：声望只是遥远的兜底终局（25 声望），别让 15 声望提前掐断神谕竞赛
    const endVp = st.oracleMode ? Math.max(st.winVp || WIN_VP, 25) : (st.winVp || WIN_VP);
    if (st.endTrigger === null && vpOf(p) >= endVp) st.endTrigger = p.turns;
    if (st.endTrigger !== null && st.players.every(q => q.turns >= st.endTrigger)) {
      st.phase = "over";
      st.winner = computeWinner(st);
      events.push({ k: "over", winner: st.winner, scores: st.players.map(q => ({ name: q.name, vp: vpOf(q), cards: q.cards.length })) });
      st.log.push("游戏结束");
      return;
    }
    st.turn = (st.turn + 1) % st.players.length;
    const wasDionysusMax = st.turnTokenMax; // 12 表示刚结束的是狄俄尼索斯回合
    st.turnTokenMax = null;
    // 狄俄尼索斯回合结束 → 上限由 12 回落到 10，所有仍超上限的玩家立刻退还超额
    if (wasDionysusMax != null) enforceAllTokenCap(st, events);
    // 美杜莎诅咒持续到其下回合开始为止
    if (st.curse && st.curse.owner === st.turn) st.curse = null;
    // 赫尔墨斯压住的贵族：主人回合数到点即释放（贵族已离场也一并清理）
    if (st.nobleLocks && st.nobleLocks.length) {
      st.nobleLocks = st.nobleLocks.filter(l => {
        if (st.nobles.indexOf(l.id) === -1) return false;
        const owner = st.players[l.owner];
        return owner && owner.turns < l.until;
      });
    }
    // 狄俄尼索斯回合开始 → 狂欢分发
    st.phase = "action";
  }

  function afterAction(st, events, rng) {
    // 超出上限（默认 10，酒神回合 12）→ 退牌阶段
    const p = st.players[st.turn];
    const lim = tokenLimit(st, st.turn);
    if (totalTokens(p) > lim) {
      st.phase = "discard";
      st.discardNeed = totalTokens(p) - lim;
      return;
    }
    // 狄俄尼索斯：本回合行动结束，若自己是全场宝石最少的人（并列不算，须严格最少）→ 可再取一枚
    if (hasGod(st, st.turn, "dionysus")) {
      const mine = totalTokens(p);
      const isLeast = st.players.every(q => q.idx === st.turn || mine < totalTokens(q));
      const hasGem = COLORS.some(c => st.pool[c] > 0);
      if (isLeast && hasGem && mine < lim) {
        st.phase = "gift";
        events.push({ k: "giftOffer", p: st.turn });
        st.log.push(`${p.name}（狄俄尼索斯）宝石最少，酒神再赐一枚`);
        return;
      }
    }
    endOfTurn(st, events, rng);
  }

  function endOfTurn(st, events, rng) {
    const elig = eligibleNobles(st, st.turn);
    if (elig.length > 0) {
      const hi = godIdx(st, "hera");
      if (hi >= 0 && hi !== st.turn) {
        // 赫拉拦路：先征求同意
        st.phase = "hera";
        st.pendingNobles = elig;
        return;
      }
    }
    resolveNobleFlow(st, events, rng, elig);
  }

  function resolveNobleFlow(st, events, rng, elig) {
    const p = st.players[st.turn];
    if (!elig) elig = eligibleNobles(st, st.turn);
    if (elig.length > 1 && p.isHuman) {
      st.phase = "noble";
      st.pendingNobles = elig;
      return;
    }
    if (elig.length >= 1) {
      const pickId = elig.length === 1 ? elig[0] : elig[Math.floor(rng() * elig.length)];
      awardNoble(st, pickId, events);
    }
    st.pendingNobles = null;
    finishTurn(st, events);
  }

  function awardNoble(st, nid, events) {
    const i = st.nobles.indexOf(nid);
    if (i >= 0) st.nobles.splice(i, 1);
    const p = st.players[st.turn];
    p.nobles.push(nid);
    events.push({ k: "noble", p: st.turn, id: nid, name: NOBLE_BY_ID[nid].name, vp: NOBLE_BY_ID[nid].vp });
    st.log.push(`${p.name} 获得 ${NOBLE_BY_ID[nid].name} +${NOBLE_BY_ID[nid].vp}声望`);
    // 神谕模式：接待后从备用池补位（保证桌面贵族数稳定，支持"接待≥2贵族"目标）
    if (st.oracleMode && st.nobleReserve && st.nobleReserve.length) {
      const newId = st.nobleReserve.shift();
      st.nobles.push(newId);
      st.log.push(`新的贵族 ${NOBLE_BY_ID[newId].name} 来到桌面`);
      events.push({ k: "nobleArrive", id: newId, name: NOBLE_BY_ID[newId].name });
    }
    // 丘比特：他人接待贵族 → 本人 +2 声望
    const ci = godIdx(st, "cupid");
    if (ci >= 0 && ci !== st.turn) {
      st.players[ci].bonusVp = (st.players[ci].bonusVp || 0) + 2;
      events.push({ k: "godVp", p: ci, name: "丘比特", vp: 2 });
      st.log.push(`丘比特（${st.players[ci].name}）暗中牵线 +2声望`);
    }
  }

  function computeWinner(st) {
    const scored = st.players.map(p => ({ idx: p.idx, vp: vpOf(p), cards: p.cards.length }));
    scored.sort((a, b) => b.vp - a.vp || a.cards - b.cards);
    const top = scored.filter(s => s.vp === scored[0].vp && s.cards === scored[0].cards);
    return top.map(t => t.idx);
  }

  /* ---------- 神谕模式（独立模式，非常驻层） ---------- */
  /* 借鉴 Splendor《城巿》：开局翻若干神谕碑，回合结束(贵族/声望结算后)若满足即即时获胜。
     条件全部基于公开状态，全部通用（有神专属条件已移除）。 */
  const ORACLE_TYPES = {
    color: {
      name: "颜色收藏", desc: "任意 2 种颜色各 ≥4 张卡", difficulty: "高",
      test: (st, p) => { const b = bonusCounts(p);
        const counts = COLORS.map(c => b[c] || 0).sort((x, y) => y - x);
        return counts[0] >= 4 && counts[1] >= 4; },
      progress: (st, p) => { const b = bonusCounts(p);
        const counts = COLORS.map(c => ({ c: c, n: b[c] || 0 })).sort((x, y) => y.n - x.n);
        return { name: "颜色收藏", desc: "任意 2 色各 ≥4 张卡", parts: [
          { label: COLOR_CN[counts[0].c] + "卡", cur: counts[0].n, target: 4 },
          { label: COLOR_CN[counts[1].c] + "卡", cur: counts[1].n, target: 4 } ] }; }
    },
    high: {
      name: "高阶掌控", desc: "拥有 ≥4 张 3 级卡", difficulty: "高",
      test: (st, p) => p.cards.filter(id => CARD_BY_ID[id].level === 3).length >= 4,
      progress: (st, p) => { const n = p.cards.filter(id => CARD_BY_ID[id].level === 3).length;
        return { name: "高阶掌控", desc: "≥4 张 3 级卡", parts: [ { label: "3 级卡", cur: n, target: 4 } ] }; }
    },
    nobles: {
      name: "贵族眷顾", desc: "接待 ≥2 名贵族", difficulty: "中",
      test: (st, p) => p.nobles.length >= 2,
      progress: (st, p) => ({ name: "贵族眷顾", desc: "≥2 名贵族", parts: [ { label: "已接待贵族", cur: p.nobles.length, target: 2 } ] })
    },
    rainbow: {
      name: "彩虹收藏", desc: "5 色各 ≥2 张卡", difficulty: "高",
      test: (st, p) => { const b = bonusCounts(p); return COLORS.every(c => b[c] >= 2); },
      progress: (st, p) => { const b = bonusCounts(p);
        return { name: "彩虹收藏", desc: "5 色各 ≥2 张卡", parts: COLORS.map(c => ({ label: COLOR_CN[c] + "卡", cur: b[c], target: 2 })) }; }
    },
    goldnob: {
      name: "神恩富矿", desc: "持有 ≥3 金币 且 接待 ≥1 名贵族", difficulty: "中",
      test: (st, p) => p.tokens[GOLD] >= 3 && p.nobles.length >= 1,
      progress: (st, p) => ({ name: "神恩富矿", desc: "≥3 金币 且 ≥1 贵族", parts: [
        { label: "金币", cur: p.tokens[GOLD], target: 3 },
        { label: "已接待贵族", cur: p.nobles.length, target: 1 } ] })
    }
  };
  const ORACLE_KEYS = Object.keys(ORACLE_TYPES);
  /* 神谕禁用神：某些神技会与特定神谕目标严重冲突（要么让目标 trivial，要么让目标不可能达成）。
     开启神谕模式时，按本局神谕目标把冲突神从可选池里剔除，避免「选米达斯刷金币躺赢神恩富矿」。 */
  const ORACLE_GOD_CONFLICTS = {
    goldnob: ["midas", "phaethon", "hermes", "cupid"], // 点金/换金/压贵族得金/不能接待贵族
    nobles:  ["hermes", "cupid"],                      // 偷贵族 / 不能接待贵族
    high:    ["zeus", "prometheus"],                   // L2/L3折扣 / 视作拥有宝石奖励
    color:   [],                                       // 无明显破坏
    rainbow: []
  };
  function oracleBannedGods(type) {
    return (ORACLE_GOD_CONFLICTS[type] || []).slice();
  }
  function initOracles(st, forcedType) {
    // 单一随机目标：开局从条件库随机抽 1 张神谕碑，全桌争夺同一目标、先达成者直接获胜。
    // 只有一张碑 → 所有人抢同样的宝石/卡/贵族，天然互相卡位、竞争更激烈。
    // forcedType：大厅选神前已定好目标时传入（用于提前剔除冲突神）；缺省则用种子随机。
    const rng = makeRng((st.seed >>> 0) || 1);
    const picked = (forcedType && ORACLE_TYPES[forcedType])
      ? [forcedType]
      : shuffle(ORACLE_KEYS.slice(), rng).slice(0, 1);
    st.oracles = picked.map((type, i) => ({ id: "oracle_" + i, type: type, claimedBy: null }));
  }
  function oracleSatisfied(st, pIdx, type) {
    const fn = ORACLE_TYPES[type];
    return fn ? fn.test(st, st.players[pIdx]) : false;
  }
  function checkOracles(st, pIdx) {
    if (!st.oracles || !st.oracles.length) return null;
    for (const o of st.oracles) {
      if (o.claimedBy != null) continue;
      if (ORACLE_TYPES[o.type].test(st, st.players[pIdx])) {
        o.claimedBy = pIdx;
        st.phase = "over";
        st.winner = [pIdx];
        return o;
      }
    }
    return null;
  }
  function oracleProgress(st, pIdx, o) {
    return ORACLE_TYPES[o.type].progress(st, st.players[pIdx]);
  }

  /* 美杜莎：拿取/压牌后可指定封色（无需弃宝石，免费发动） */
  function applyCurse(st, action, events) {
    const p = st.players[st.turn];
    if (p.god !== "medusa") { if (action.curse != null) throw new Error("no curse ability"); return; }
    if (action.curse == null) return;
    if (COLORS.indexOf(action.curse) === -1) throw new Error("bad curse color");
    st.curse = { color: action.curse, owner: st.turn };
    events.push({ k: "curse", p: st.turn, color: action.curse });
    st.log.push(`${p.name} 施下诅咒：其他角色不得拿取${COLOR_CN[action.curse]}`);
  }

  /* action: {type:'take'|'reserve'|'buy'|'discard'|'chooseNoble'|'veto'|'pickGem'|'midas'|'steal', ...} */
  /* 动作历史：终局复盘用。只存「谁 / 做什么 / 触发了哪些事件」，体积很小。 */
  function applyAction(state, action, rng) {
    const actor = state.phase === "hera" ? godIdx(state, "hera") : state.turn;
    const res = applyActionRaw(state, action, rng);
    const st = res.state;
    if (!st.hist) st.hist = [];
    st.hist.push({
      p: actor < 0 ? state.turn : actor,
      t: action.type,
      lv: (action.ref && action.ref.level) || 0,
      c: action.color || (action.colors ? action.colors.join("") : ""),
      k: res.events.map(e => e.k).join(",")
    });
    if (st.hist.length > 600) st.hist.splice(0, st.hist.length - 600);
    return res;
  }

  function applyActionRaw(state, action, rng) {
    rng = rng || Math.random;
    const st = cloneState(state);
    const events = [];
    const p = st.players[st.turn];

    if (st.phase === "over") throw new Error("game over");

    if (st.phase === "distribute") {
      if (action.type !== "pickGem") throw new Error("must pickGem during distribute");
      const q = st.dist.queue[0];
      const qp = st.players[q];
      if (action.color == null) {
        const any = COLORS.some(c => st.pool[c] > 0 && totalTokens(qp) < tokenLimit(st, q));
        if (any) throw new Error("must pick a gem when available");
      } else {
        if (COLORS.indexOf(action.color) === -1 || st.pool[action.color] < 1) throw new Error("bad gem pick");
        if (totalTokens(qp) >= tokenLimit(st, q)) throw new Error("over token limit");
        st.pool[action.color]--; qp.tokens[action.color]++;
        events.push({ k: "pickGem", p: q, color: action.color });
        st.log.push(`${qp.name} 于狂欢中获得 ${COLOR_CN[action.color]}`);
      }
      st.dist.queue.shift();
      if (!st.dist.queue.length) {
        if (!st.dist.extra) { st.dist.extra = true; st.dist.queue = [st.turn]; }
        else { st.dist = null; st.phase = "action"; }
      }
      return { state: st, events: events };
    }

    if (st.phase === "gift") {
      if (action.type !== "pickGem") throw new Error("must pickGem during gift");
      const gp = st.players[st.turn];
      const glim = tokenLimit(st, st.turn);
      if (action.color == null) {
        const any = COLORS.some(c => st.pool[c] > 0 && totalTokens(gp) < glim);
        if (any) throw new Error("must pick a gem when available");
      } else {
        if (COLORS.indexOf(action.color) === -1 || st.pool[action.color] < 1) throw new Error("bad gem pick");
        if (totalTokens(gp) >= glim) throw new Error("over token limit");
        st.pool[action.color]--; gp.tokens[action.color]++;
        events.push({ k: "giftGem", p: st.turn, color: action.color });
        st.log.push(`${gp.name} 得酒神赐福：${COLOR_CN[action.color]}`);
      }
      st.phase = "action";
      endOfTurn(st, events, rng);   // 取完继续走贵族结算 + 回合结束
      return { state: st, events: events };
    }

    if (st.phase === "hera") {
      if (action.type !== "veto") throw new Error("must veto decision");
      const elig = st.pendingNobles || [];
      st.pendingNobles = null;
      const h = st.players[godIdx(st, "hera")];
      if (action.allow) {
        events.push({ k: "vetoAllow", p: st.turn });
        resolveNobleFlow(st, events, rng, elig);
        return { state: st, events: events };
      }
      // 拒绝：不再弃宝石；赫拉 veto 成功 +1 声望
      h.bonusVp = (h.bonusVp || 0) + 1;
      events.push({ k: "veto", p: st.turn, hera: h.idx, gem: null, vp: 1 });
      st.log.push(`赫拉（${h.name}）拒绝了 ${p.name}，获得 1 声望`);
      finishTurn(st, events);
      return { state: st, events: events };
    }

    if (st.phase === "noble") {
      if (action.type !== "chooseNoble" || (st.pendingNobles || []).indexOf(action.id) === -1)
        throw new Error("invalid noble choice");
      awardNoble(st, action.id, events);
      st.pendingNobles = null;
      finishTurn(st, events);
      return { state: st, events: events };
    }
    if (st.phase === "discard") {
      if (action.type !== "discard") throw new Error("must discard");
      const cnt = {};
      action.colors.forEach(c => { cnt[c] = (cnt[c] || 0) + 1; });
      let n = 0;
      Object.keys(cnt).forEach(c => {
        if ((p.tokens[c] || 0) < cnt[c]) throw new Error("not enough tokens to discard");
        n += cnt[c];
      });
      if (n !== st.discardNeed) throw new Error("discard count mismatch");
      Object.keys(cnt).forEach(c => { p.tokens[c] -= cnt[c]; st.pool[c] += cnt[c]; });
      events.push({ k: "discard", p: st.turn, colors: action.colors });
      st.phase = "action";
      st.discardNeed = 0;
      endOfTurn(st, events, rng);
      return { state: st, events: events };
    }

    if (action.type === "pass") {
      st.log.push(`${p.name} 无事可做，暂过一回合`);
      events.push({ k: "pass", p: st.turn });
      endOfTurn(st, events, rng);
      return { state: st, events: events };
    }

    if (action.type === "take") {
      const colors = action.colors;
      if (!colors || !colors.length || colors.length > 3) throw new Error("bad take size");
      // 筹码已满时不允许拿：否则拿完立刻被强制退还，净收益为 0（假动作）
      if (totalTokens(p) >= tokenLimit(st, st.turn)) throw new Error("token full, must return gems first");
      if (p.god === "phaethon" && colors.length !== 3) throw new Error("phaethon must take 3 distinct");
      const blocked = st.curse && st.curse.owner !== st.turn ? st.curse.color : null;
      const same = colors.length === 2 && colors[0] === colors[1];
      if (same) {
        if (p.god === "poseidon" || p.god === "phaethon") throw new Error("cannot take pair");
        if (st.pool[colors[0]] < 4) throw new Error("need 4 in pool for pair");
        if (colors[0] === blocked) throw new Error("cursed color");
        st.pool[colors[0]] -= 2;
        p.tokens[colors[0]] += 2;
        // 米达斯：拿 2 同色宝石时，50% 概率其中一枚化作黄金
        if (p.god === "midas" && st.pool[GOLD] > 0 && rng() < 0.5) {
          p.tokens[colors[0]] -= 1;
          st.pool[colors[0]] += 1;
          st.pool[GOLD]--; p.tokens[GOLD]++;
          events.push({ k: "midasGold", p: st.turn, color: colors[0] });
          st.log.push(`${p.name} 点金：一枚${COLOR_CN[colors[0]]}化作黄金`);
        }
      } else {
        const set = new Set(colors);
        if (set.size !== colors.length) throw new Error("colors must differ");
        colors.forEach(c => {
          if (COLORS.indexOf(c) === -1) throw new Error("no gold taking");
          if (c === blocked) throw new Error("cursed color");
          if (st.pool[c] < 1) throw new Error("empty pool");
          st.pool[c]--; p.tokens[c]++;
        });
      }
      let giftMsg = "";
      if (action.bonus != null) {
        if (p.god !== "poseidon") throw new Error("no gift ability");
        if (COLORS.indexOf(action.bonus) === -1 || st.pool[action.bonus] !== 1)
          throw new Error("gift needs exactly 1 in pool");
        if (action.bonus === blocked) throw new Error("cursed color");
        if (colors.indexOf(action.bonus) !== -1) throw new Error("gift color already taken");
        st.pool[action.bonus]--; p.tokens[action.bonus]++;
        giftMsg = `，海神恩赐 ${COLOR_CN[action.bonus]}`;
      }
      events.push({ k: "take", p: st.turn, colors: colors, bonus: action.bonus || null });
      st.log.push(`${p.name} 拿取 ${colors.map(c => COLOR_CN[c]).join("、")}${giftMsg}`);
      // 法厄同：拿满后可弃一枚（须为本次所拿）换一金
      if (action.swapGold != null) {
        if (p.god !== "phaethon") throw new Error("no swap ability");
        if (COLORS.indexOf(action.swapGold) === -1 || colors.indexOf(action.swapGold) === -1)
          throw new Error("swap must be one of taken colors");
        if (st.pool[GOLD] < 1) throw new Error("no gold in pool");
        p.tokens[action.swapGold]--; st.pool[action.swapGold]++;
        st.pool[GOLD]--; p.tokens[GOLD]++;
        events.push({ k: "swap", p: st.turn, color: action.swapGold });
        st.log.push(`太阳战车：弃${COLOR_CN[action.swapGold]}换得一金`);
      }
      applyCurse(st, action, events);
      afterAction(st, events, rng);
      return { state: st, events: events };
    }

    if (action.type === "steal") {
      if (p.god !== "hermes") throw new Error("no hermes ability");
      const fp = st.players[action.from];
      const nid = action.nobleId;
      if (!fp || action.from === st.turn || fp.nobles.indexOf(nid) === -1)
        throw new Error("invalid steal target");
      const req = NOBLE_BY_ID[nid].req;
      const b = bonusCounts(p);
      if (!Object.keys(req).every(c => (b[c] || 0) >= req[c]))
        throw new Error("hermes requirement not met");
      fp.nobles.splice(fp.nobles.indexOf(nid), 1);
      p.nobles.push(nid);
      events.push({ k: "steal", p: st.turn, from: action.from, id: nid, name: NOBLE_BY_ID[nid].name });
      st.log.push(`${p.name} 从 ${fp.name} 处窃取了 ${NOBLE_BY_ID[nid].name}`);
      afterAction(st, events, rng);
      return { state: st, events: events };
    }

    /* 赫尔墨斯「压贵族」：把桌上一位贵族压下（相当于贵族版预留），
       立刻得 1 黄金；该贵族锁住，直到赫尔墨斯的下个回合结束前，别人不能接待。 */
    if (action.type === "pressNoble") {
      if (p.god !== "hermes") throw new Error("no hermes ability");
      const nid = action.nobleId;
      if (st.nobles.indexOf(nid) === -1) throw new Error("noble not on table");
      if ((st.nobleLocks || []).some(l => l.id === nid)) throw new Error("noble already pressed");
      if (eligibleNobles(st, st.turn).indexOf(nid) !== -1)
        throw new Error("can receive this noble directly, no need to press");
      if (totalTokens(p) >= tokenLimit(st, st.turn)) throw new Error("over token limit");
      let gotGold = false;
      if (st.pool[GOLD] > 0) { st.pool[GOLD]--; p.tokens[GOLD]++; gotGold = true; }
      st.nobleLocks = st.nobleLocks || [];
      // 锁到下个回合结束：p.turns 在本回合结束 +1，故 +2 才是"下回合结束"
      st.nobleLocks.push({ id: nid, owner: st.turn, until: p.turns + 2 });
      events.push({ k: "pressNoble", p: st.turn, id: nid, name: NOBLE_BY_ID[nid].name, gold: gotGold });
      st.log.push(`${p.name} 压住了 ${NOBLE_BY_ID[nid].name}${gotGold ? "，得 1 黄金" : ""}（他人暂不可接待）`);
      afterAction(st, events, rng);
      return { state: st, events: events };
    }

    /* 退还宝石：把手中筹码放回牌池，结束回合。
       存在的意义：全员满筹码 + 池子枯竭时，宝石只能靠买牌回池，而没人买得起 → 永久僵局。
       允许主动退还后，筹码能重新流动；也让玩家可以退掉散色、下回合重新组合。 */
    if (action.type === "returnGems") {
      const cols = action.colors || [];
      if (!cols.length) throw new Error("returnGems needs at least 1");
      if (cols.length > totalTokens(p)) throw new Error("not enough tokens");
      // 校验数量（同色可多枚）
      const need = {};
      cols.forEach(c => {
        if (COLORS.indexOf(c) === -1) throw new Error("cannot return gold or unknown color");
        need[c] = (need[c] || 0) + 1;
      });
      Object.keys(need).forEach(c => {
        if ((p.tokens[c] || 0) < need[c]) throw new Error("not enough " + c);
        if (st.pool[c] + need[c] > 5) throw new Error("pool full for " + c);
      });
      cols.forEach(c => { p.tokens[c]--; st.pool[c]++; });
      events.push({ k: "returnGems", p: st.turn, colors: cols.slice() });
      st.log.push(`${p.name} 退还 ${cols.map(c => COLOR_CN[c]).join("、")} 到牌池`);
      endOfTurn(st, events, rng);
      return { state: st, events: events };
    }

    if (action.type === "reserve") {
      if (NO_RESERVE_GODS.indexOf(p.god) >= 0) throw new Error("cannot reserve with this god");
      if (p.reserved.length >= HAND_MAX) throw new Error("hand full");
      let cardId;
      const ref = action.ref;
      if (ref.zone === "deck") {
        if (!st.decks[ref.level].length) throw new Error("empty deck");
        cardId = st.decks[ref.level].pop();
      } else if (ref.zone === "market") {
        cardId = st.market[ref.level][ref.idx];
        if (cardId == null) throw new Error("empty slot");
        st.market[ref.level][ref.idx] = null;
        refillMarket(st, ref.level);
      } else throw new Error("bad reserve ref");
      p.reserved.push(cardId);
      let gotGold = false;
      // 与 take 一致：筹码已满（达上限）时不发黄金，避免触发弃牌阶段
      if (st.pool[GOLD] > 0 && totalTokens(p) < tokenLimit(st, st.turn)) {
        st.pool[GOLD]--; p.tokens[GOLD]++; gotGold = true;
      } else if (st.pool[GOLD] > 0) {
        st.log.push(`${p.name} 筹码已满，预留未获得黄金`);
      }
      events.push({ k: "reserve", p: st.turn, cardId: cardId, gold: gotGold, from: ref });
      st.log.push(`${p.name} 预留了一张卡${gotGold ? "并获得黄金" : ""}`);
      afterAction(st, events, rng);
      return { state: st, events: events };
    }

    if (action.type === "buy") {
      const ref = action.ref;
      let cardId;
      if (ref.zone === "market") {
        cardId = st.market[ref.level][ref.idx];
        if (cardId == null) throw new Error("empty slot");
      } else if (ref.zone === "hand") {
        cardId = ref.cardId;
        if (p.reserved.indexOf(cardId) === -1) throw new Error("not in hand");
      } else throw new Error("bad buy ref");
      const card = CARD_BY_ID[cardId];
      if (p.god === "zeus" && card.level === 1) throw new Error("zeus cannot buy level 1");
      // 盗火：指定一张明牌，本回合视作拥有其宝石奖励
      let fireCard = null;
      if (action.fireFrom != null) {
        if (p.god !== "prometheus") throw new Error("no fire ability");
        if ((p.godUses.fire || 0) <= 0) throw new Error("fire uses exhausted");
        fireCard = typeof action.fireFrom === "number" ? CARD_BY_ID[action.fireFrom] : getCard(st, action.fireFrom);
        if (!fireCard) throw new Error("bad fire target");
        if (fireCard.id === cardId) throw new Error("cannot fire the card itself");
      }
      const opts = fireCard ? { fireFrom: fireCard.id } : null;
      if (!canAfford(st, st.turn, card, opts)) throw new Error("cannot afford");
      // 支付
      const ec = effectiveCost(st, st.turn, card, opts);
      let goldLeft = p.tokens[GOLD];
      COLORS.forEach(c => {
        const use = Math.min(p.tokens[c], ec.per[c]);
        p.tokens[c] -= use; st.pool[c] += use;
        const short = ec.per[c] - use;
        if (short > 0) { goldLeft -= short; st.pool[GOLD] += short; }
      });
      p.tokens[GOLD] = goldLeft;
      // 宙斯折扣触发 → 进入冷却（CD5：等 5 个自己的回合）
      if (p.god === "zeus" && card.level >= 2 && !(p.zeusCd != null && p.turns < p.zeusCd)) {
        p.zeusCd = p.turns + 6;
      }
      // 入场
      if (ref.zone === "market") {
        st.market[ref.level][ref.idx] = null;
        refillMarket(st, ref.level);
      } else {
        const hi = p.reserved.indexOf(cardId);
        p.reserved.splice(hi, 1);
      }
      p.cards.push(cardId);
      events.push({ k: "buy", p: st.turn, cardId: cardId, ref: ref, vp: card.vp, name: card.name, bonus: card.bonus });
      st.log.push(`${p.name} 购买 ${card.name}${card.vp ? ` +${card.vp}声望` : ""}`);
      if (fireCard) {
        p.godUses.fire--;
        events.push({ k: "fire", p: st.turn, name: fireCard.name });
        st.log.push(`${p.name} 盗取了 ${fireCard.name} 的宝石之力（余 ${p.godUses.fire} 次）`);
      }
      // 埋底：堤丰可将一张同级明牌埋入牌底并补新
      if (action.bury != null) {
        if (p.god !== "typhon") throw new Error("no bury ability");
        const br = action.bury;
        if (br.zone !== "market" || br.level !== card.level) throw new Error("bury must be same-level market card");
        const buried = st.market[br.level][br.idx];
        if (buried == null) throw new Error("empty bury slot");
        st.market[br.level][br.idx] = null;
        st.decks[br.level].unshift(buried);
        refillMarket(st, br.level);
        events.push({ k: "bury", p: st.turn, cardId: buried });
        st.log.push(`${p.name} 将一张 ${card.level} 级明牌 ${CARD_BY_ID[buried].name} 埋入牌底`);
      }
      afterAction(st, events, rng);
      return { state: st, events: events };
    }

    throw new Error("unknown action " + action.type);
  }

  /* ---------- AI ---------- */
  function gemsNeededAfterGold(st, pIdx, card, opts) {
    return gemsMissing(st, pIdx, card, opts);
  }

  function nobleDelta(st, pIdx, bonusColor) {
    const p = st.players[pIdx];
    const b = bonusCounts(p);
    let best = 0;
    st.nobles.forEach(nid => {
      const req = NOBLE_BY_ID[nid].req;
      if (!req[bonusColor]) return;
      let before = 0, after = 0;
      Object.keys(req).forEach(c => {
        before += Math.min(b[c] || 0, req[c]);
        after += Math.min((b[c] || 0) + (c === bonusColor ? 1 : 0), req[c]);
      });
      best = Math.max(best, after - before);
    });
    return best;
  }

  /* 贵族候选：场上的 + （赫尔墨斯）对手持有的偷取目标（需求各色 +1）
     偷取目标门槛高（每色再多 1 枚加成），只把"已接近"的纳入规划，避免 AI 追不可达目标 */
  function nobleCandidates(st, pIdx) {
    const p = st.players[pIdx];
    const out = [];
    st.nobles.forEach(nid => out.push({ nid: nid, req: NOBLE_BY_ID[nid].req, steal: false }));
    if (p.god === "hermes") {
      const b = bonusCounts(p);
      st.players.forEach((q, i) => {
        if (i === pIdx) return;
        q.nobles.forEach(nid => {
          const r = NOBLE_BY_ID[nid].req;
          const near = Object.keys(r).every(c => (b[c] || 0) >= r[c] - 1);
          if (!near) return;
          const req = {};
          Object.keys(r).forEach(c => { req[c] = r[c]; });
          out.push({ nid: nid, req: req, steal: true });
        });
      });
    }
    return out;
  }

  /* 沿最佳贵族路径的持续吸引力：进度比例 + 完成巨奖 */
  function noblePathScore(st, pIdx, bonusColor) {
    const p = st.players[pIdx];
    const b = bonusCounts(p);
    let best = 0;
    nobleCandidates(st, pIdx).forEach(cand => {
      const req = cand.req;
      let before = 0, after = 0, total = 0;
      Object.keys(req).forEach(c => {
        before += Math.min(b[c] || 0, req[c]);
        after += Math.min((b[c] || 0) + (c === bonusColor ? 1 : 0), req[c]);
        total += req[c];
      });
      let v = (after / total) * 10;
      if (after === total && before < total) v += 30;
      if (v > best) best = v;
    });
    return best;
  }

  /* 当前最值得追的贵族：返回剩余所需颜色计数（颜色→还差几枚加成） */
  function bestNobleNeed(st, pIdx) {
    const p = st.players[pIdx];
    const b = bonusCounts(p);
    const cands = nobleCandidates(st, pIdx);
    let pick = null;
    if (st.plans && st.plans[pIdx] != null)
      pick = cands.find(c => c.nid === st.plans[pIdx]) || null;
    if (!pick) {
      let bestRatio = -1;
      cands.forEach(cand => {
        let have = 0, total = 0;
        Object.keys(cand.req).forEach(c => { have += Math.min(b[c] || 0, cand.req[c]); total += cand.req[c]; });
        const ratio = total ? have / total : 0;
        if (ratio > bestRatio) { bestRatio = ratio; pick = cand; }
      });
    }
    if (!pick) return {};
    const need = {};
    Object.keys(pick.req).forEach(c => { need[c] = Math.max(0, pick.req[c] - (b[c] || 0)); });
    return need;
  }

  function targetCards(st, pIdx) {
    const p = st.players[pIdx];
    const out = [];
    [1, 2, 3].forEach(lv => st.market[lv].forEach((id, idx) => {
      if (id != null) out.push({ card: CARD_BY_ID[id], ref: { zone: "market", level: lv, idx: idx } });
    }));
    p.reserved.forEach(id => out.push({ card: CARD_BY_ID[id], ref: { zone: "hand", cardId: id } }));
    return out;
  }

  /* AI 焦点色：引擎加成色（已持有 → 复利折扣）+ 贵族计划需求色。
     拿取决策据此给「继续堆连锁 / 朝贵族推进」的额外权重。 */
  function focusColors(st, pIdx) {
    const p = st.players[pIdx];
    const bc = bonusCounts(p);
    const set = {};
    COLORS.forEach(c => { if ((bc[c] || 0) >= 1) set[c] = (set[c] || 0) + 2; });
    const nn = bestNobleNeed(st, pIdx);
    Object.keys(nn).forEach(c => { set[c] = (set[c] || 0) + 1.5; });
    return set;
  }

  /* 神谕模式：AI 目标导向核心。
     ① oracleFocus: 选出当前玩家「最有望达成」的未认领神谕碑（完成度最高者）。
     ② oracleAdvanceBonus: 某个动作对该焦点神谕的推进加成（越接近完成权重越大）。
     ③ safeProject: 对候选动作做无副作用推演，检测能否「一步即胜」。 */
  function oracleFocus(st, pIdx) {
    if (!st.oracles || !st.oracles.length) return -1;
    let best = -1, bestFrac = -1;
    st.oracles.forEach((o, i) => {
      if (o.claimedBy != null) return;
      const pr = oracleProgress(st, pIdx, o);
      let done = 0, total = 0;
      pr.parts.forEach(s => { total += s.target; done += Math.min(s.cur, s.target); });
      const frac = total ? done / total : 0;
      if (frac > bestFrac) { bestFrac = frac; best = i; }
    });
    return best;
  }
  function oracleFrac(st, pIdx, o) {
    const pr = oracleProgress(st, pIdx, o);
    let done = 0, total = 0;
    pr.parts.forEach(s => { total += s.target; done += Math.min(s.cur, s.target); });
    return total ? done / total : 0;
  }
  function oracleFracByType(st, pIdx, type) {
    const pr = ORACLE_TYPES[type].progress(st, st.players[pIdx]);
    let done = 0, total = 0;
    pr.parts.forEach(s => { total += s.target; done += Math.min(s.cur, s.target); });
    return total ? done / total : 0;
  }
  // 焦点神谕的「完成单位」：各子目标 min(当前,目标) 之和。用于衡量某动作推进/回退目标的真实幅度。
  function oracleUnits(st, pIdx, o) {
    const pr = oracleProgress(st, pIdx, o);
    let done = 0;
    pr.parts.forEach(s => { done += Math.min(s.cur, s.target); });
    return done;
  }
  // 高阶掌控专用：全场（含手中预留）有效成本最低的 3 级卡目标
  function cheapestLevel3Target(st, pIdx) {
    let best = null, bestCost = 1e9;
    targetCards(st, pIdx).forEach(t => {
      if (t.card.level !== 3) return;
      const ec = effectiveCost(st, pIdx, t.card);
      if (ec.total < bestCost) { bestCost = ec.total; best = t; }
    });
    return best;
  }
  function oracleAdvanceBonus(st, pIdx, a, focusIdx) {
    if (focusIdx < 0) return 0;
    const o = st.oracles[focusIdx];
    const type = o.type;
    const p = st.players[pIdx];
    const bc = bonusCounts(p);
    const cardOf = (ref) => ref ? getCard(st, ref) : null;
    let b = 0;
    if (type === "color") {
      const need = { ruby: 4 - (bc.ruby || 0), sapphire: 4 - (bc.sapphire || 0) };
      if (a.type === "take") a.colors.forEach(c => { if (need[c] > 0) b += 3; });
      else if (a.type === "buy") { const card = cardOf(a.ref); if (card && need[card.bonus] > 0) b += 4 + card.level; }
    } else if (type === "high") {
      // 高阶掌控：只认 3 级卡。买 L3 强推、压 L3 锁目标；拿取只补「最便宜 L3 目标」的缺口色，
      // 绝不为 2 级卡的面子分拿宝石（旧逻辑要求 L3 vp≥3 且成本≤8，前期几乎不存在 → 退化成乱拿）
      if (a.type === "buy") { const card = cardOf(a.ref); if (card && card.level === 3) b += 13; else if (card && card.level === 2) b += 1; }
      if (a.type === "reserve") { const card = cardOf(a.ref); if (card && card.level === 3) b += 4; }
      if (a.type === "take") {
        const t = cheapestLevel3Target(st, pIdx);
        if (t) { const ec = effectiveCost(st, pIdx, t.card); a.colors.forEach(c => { if (ec.per[c] - p.tokens[c] > 0) b += 3.5; }); }
      }
    } else if (type === "nobles") {
      // 贵族眷顾：一切为「凑齐某贵族的需求色」服务——买/压该色卡、拿取该色宝石
      const nn = bestNobleNeed(st, pIdx);
      if (a.type === "buy") { const card = cardOf(a.ref); if (card && nn[card.bonus]) b += 8 + card.level * 0.5; }
      else if (a.type === "reserve") { const card = cardOf(a.ref); if (card && nn[card.bonus]) b += 5; }
      else if (a.type === "take") { const t = chooseTarget(st, pIdx); if (t) { const ec = effectiveCost(st, pIdx, t.card); a.colors.forEach(c => { if (ec.per[c] - p.tokens[c] > 0) b += 2.5; }); } a.colors.forEach(c => { if (nn[c]) b += 1.5; }); }
    } else if (type === "rainbow") {
      if (a.type === "buy") { const card = cardOf(a.ref); if (card && (bc[card.bonus] || 0) < 2) b += 4 + card.level * 0.5; }
      else if (a.type === "take") a.colors.forEach(c => { if ((bc[c] || 0) < 2) b += 2.5; });
    } else if (type === "treasury") {
      // 国库丰盈 = 宝石数全场最多。囤宝石/预留拿金直接推进；买牌耗宝石是反效果，惩罚。
      const mine = totalTokens(p);
      const rival = Math.max(0, ...st.players.filter((q, i) => i !== pIdx).map(q => totalTokens(q)));
      const lead = mine - rival; // 领先幅度，正数=领先
      if (a.type === "take") b += 2.0 + (lead < 0 ? 1.5 : 0);       // 落后时更激进囤宝石
      else if (a.type === "reserve") b += 3.0;                        // 预留拿金：+1 宝石且不吃弃牌
      else if (a.type === "buy") {
        const card = cardOf(a.ref);
        if (card) { const ec = effectiveCost(st, pIdx, card, a.fireFrom ? { fireFrom: a.fireFrom } : null); b -= ec.total * 0.8; } // 买牌净减宝石
      }
    } else if (type === "goldnob") {
      // 神恩富矿：金币≥3 且 贵族≥1。金币只能靠预留获取，但预留到 3 枚后就该停手去凑贵族；
      // 买牌若要吃掉金币（跌破 3 枚）是摧毁目标进度，重罚。
      const gold = p.tokens[GOLD];
      if (a.type === "reserve" && gold < 3) b += 20;
      const nn = bestNobleNeed(st, pIdx);
      if (a.type === "buy") {
        const card = cardOf(a.ref);
        if (card) {
          if (nn[card.bonus]) b += 4 + card.level * 0.5;
          // 预演买后金币存量：跌破 3 → 破坏神谕进度
          const proj = safeProject(st, pIdx, a);
          if (proj && proj.state.players[pIdx].tokens[GOLD] < 3 && gold >= 3) b -= 25;
        }
      }
      else if (a.type === "take") { const t = chooseTarget(st, pIdx); if (t) { const ec = effectiveCost(st, pIdx, t.card); a.colors.forEach(c => { if (ec.per[c] - p.tokens[c] > 0) b += 1.5; }); } a.colors.forEach(c => { if (nn[c]) b += 1.5; }); }
    }
    // 越接近完成权重越大：远碑不瞎跑，近碑强抢
    return b * (0.8 + oracleFrac(st, pIdx, o) * 1.2);
  }
  function safeProject(st, pIdx, a) {
    try {
      const r = makeRng(((((st.seed || 1) ^ ((pIdx + 1) * 2654435761)) >>> 0) || 7));
      return applyAction(st, a, r);
    } catch (e) { return null; }
  }

  function chooseTarget(st, pIdx) {
    const p = st.players[pIdx];
    const bc = bonusCounts(p);
    const nn = bestNobleNeed(st, pIdx);
    let best = null, bestS = -1e9;
    targetCards(st, pIdx).forEach(t => {
      const ec = effectiveCost(st, pIdx, t.card);
      if (ec.total === 0) return;             // 已可直接购买，走 buy 分支
      if (ec.total > 10) return;
      const missing = gemsNeededAfterGold(st, pIdx, t.card);
      let s = (t.card.vp * 10 + 3 + (bc[t.card.bonus] || 0) * 0.6 + noblePathScore(st, pIdx, t.card.bonus) * 1.5) / (ec.total + 3);
      s *= 1 + Math.max(0, 6 - missing) * 0.06;   // 越接近买得起越好
      if (t.card.level === 3) s += 0.05;
      // 加成色命中焦点 → 引擎协同（继续堆连锁 / 朝贵族推进）
      if (nn[t.card.bonus]) s += 0.8;
      if ((bc[t.card.bonus] || 0) >= 1) s += 0.5;   // 已有该色加成 → 继续堆
      if (t.card.level === 1) s += 0.3;             // 廉价起手牌作引擎基石更有价值
      if (s > bestS) { bestS = s; best = t; }
    });
    return best;
  }

  function blockValue(st, pIdx, card, zone) {
    if (zone !== "market") return 0;
    let v = 0;
    st.players.forEach((opp, i) => {
      if (i === pIdx) return;
      const need = gemsNeededAfterGold(st, i, card);
      if (need === 0) v += card.vp * 0.7;
      else if (need <= 1 && card.vp >= 3) v += card.vp * 0.45;
    });
    return v;
  }

  function aiDiscardAction(st, pIdx) {
    const p = st.players[pIdx];
    const need = totalTokens(p) - tokenLimit(st, pIdx);
    const target = chooseTarget(st, pIdx);
    const want = {};
    COLORS.forEach(c => { want[c] = 0; });
    if (target) {
      const ec = effectiveCost(st, pIdx, target.card);
      COLORS.forEach(c => { want[c] = Math.min(p.tokens[c], ec.per[c]); });
    }
    // 优先丢弃：需求为 0 的普通色 → 需求少的 → 黄金最后
    const order = COLORS.slice().sort((a, b) => want[a] - want[b]);
    const discard = [];
    const remain = Object.assign({}, p.tokens);
    for (const c of order) {
      while (remain[c] > 0 && discard.length < need && remain[c] > want[c]) {
        discard.push(c); remain[c]--;
      }
      if (discard.length >= need) break;
    }
    for (const c of order) {
      while (remain[c] > 0 && discard.length < need) { discard.push(c); remain[c]--; }
      if (discard.length >= need) break;
    }
    if (discard.length < need && remain[GOLD] > 0) {
      while (remain[GOLD] > 0 && discard.length < need) { discard.push(GOLD); remain[GOLD]--; }
    }
    return { type: "discard", colors: discard };
  }

  /* AI 惰性选定贵族攻略目标：开局后第一回合内挑最易达成的贵族（赫尔墨斯含可偷目标） */
  function ensurePlan(st, pIdx) {
    const cur = st.plans && st.plans[pIdx] != null ? st.plans[pIdx] : null;
    if (cur != null && nobleCandidates(st, pIdx).some(c => c.nid === cur)) return;
    if (!st.plans) st.plans = st.players.map(() => null);
    const p = st.players[pIdx];
    const b = bonusCounts(p);
    let best = null, bestScore = -1;
    nobleCandidates(st, pIdx).forEach(cand => {
      const req = cand.req;
      let have = 0, total = 0, diff = 0;
      Object.keys(req).forEach(c => {
        const h = Math.min(b[c] || 0, req[c]);
        have += h; total += req[c]; diff += req[c] - h;
      });
      // 已有进度 + 剩余需求越少越好；偷取目标多算一点倾向（白得 3 声望）
      const nv = NOBLE_BY_ID[cand.nid].vp || 0;
      const s = (have / total) * 10 - diff + nv * 0.6 + rng0() + (cand.steal ? 1.5 : 0);
      if (s > bestScore) { bestScore = s; best = cand.nid; }
    });
    st.plans[pIdx] = best;
    // 简易确定性伪随机
    function rng0() { return ((pIdx * 37 + st.seed + st.nobles.length * 13) % 100) / 100; }
  }

  function aiChoose(st, pIdx, rng) {
    rng = rng || Math.random;
    if (st.phase === "over") return null;
    if (st.phase === "distribute") {
      // 实际决策者是队首角色
      const q = st.dist.queue[0];
      const acts = legalActions(st, q);
      if (!acts.length) return null;
    // 只剩退还/跳过这类补救动作时，直接给出（避免 AI 返回 null 卡住）
    if (acts.every(x => x.type === "returnGems" || x.type === "pass")) {
      const rg = acts.filter(x => x.type === "returnGems");
      if (!rg.length) return { type: "pass" };
      const tgt0 = chooseTarget(st, pIdx);
      let pick = rg[0], pickS = -Infinity;
      rg.forEach(x => {
        let sc = 0;
        if (tgt0) {
          const ec = effectiveCost(st, pIdx, tgt0.card);
          x.colors.forEach(c => { if ((ec.per[c] || 0) === 0) sc += 1; });
        }
        // 少退优先（保留筹码灵活性），但池子空得多时退多一点更快恢复
        sc -= x.colors.length * 0.35;
        const poolLeft = COLORS.reduce((n, c) => n + st.pool[c], 0);
        if (poolLeft < 3) sc += x.colors.length * 0.3;
        if (sc > pickS) { pickS = sc; pick = x; }
      });
      return pick;
    }
      if (acts.length === 1 && acts[0].color == null) return acts[0];
      const t = chooseTarget(st, q);
      let best = null, bestS = -Infinity;
      acts.forEach(a => {
        if (a.color == null) return;
        let s = 0;
        if (t) {
          const ec = effectiveCost(st, q, t.card);
          s += Math.min(Math.max(0, ec.per[a.color] - st.players[q].tokens[a.color]), 2) * 2.5;
        }
        s += st.pool[a.color] * 0.12 + rng() * 0.6;
        if (s > bestS) { bestS = s; best = a; }
      });
      return best || acts.find(a => a.color == null) || acts[0];
    }
    if (st.phase === "gift") {
      // 狄俄尼索斯赐福：挑自己最缺的一色
      const gq = st.turn;
      const gacts = legalActions(st, gq);
      if (!gacts.length) return null;
      if (gacts.length === 1 && gacts[0].color == null) return gacts[0];
      const gt = chooseTarget(st, gq);
      let gBest = null, gBestS = -Infinity;
      gacts.forEach(a => {
        if (a.color == null) return;
        let sc = 0;
        if (gt) {
          const ec = effectiveCost(st, gq, gt.card);
          sc += Math.min(Math.max(0, ec.per[a.color] - st.players[gq].tokens[a.color]), 2) * 2.5;
        }
        sc += st.pool[a.color] * 0.12 + rng() * 0.6;
        if (sc > gBestS) { gBestS = sc; gBest = a; }
      });
      return gBest || gacts.find(a => a.color == null) || gacts[0];
    }
    if (st.phase === "hera") {
      // 决策者是赫拉本人
      const hi = godIdx(st, "hera");
      const target = st.players[st.turn];
      let deny = false;
      if (vpOf(target) + 4 >= (st.winVp || WIN_VP)) deny = true;                       // 会直接送对方获胜
      else if (vpOf(target) >= vpOf(st.players[hi]) + 6) deny = true;    // 对方大幅领先
      const h = st.players[hi];
      const gemCount = COLORS.reduce((n, c) => n + (h.tokens[c] || 0), 0);
      if (deny && gemCount > 0 && rng() < 0.92)
        return { type: "veto", allow: false };
      return { type: "veto", allow: true };
    }
    if (st.phase === "noble") {
      const list = st.pendingNobles || [];
      return { type: "chooseNoble", id: list[Math.floor(rng() * list.length)] };
    }
    if (st.phase === "discard") return aiDiscardAction(st, pIdx);
    ensurePlan(st, pIdx);

    const p = st.players[pIdx];
    let acts = legalActions(st, pIdx);
    if (!acts.length) return null;
    // 只剩退还/跳过这类补救动作时，直接给出（避免 AI 返回 null 卡住）
    if (acts.every(x => x.type === "returnGems" || x.type === "pass")) {
      const rg = acts.filter(x => x.type === "returnGems");
      if (!rg.length) return { type: "pass" };
      const tgt0 = chooseTarget(st, pIdx);
      let pick = rg[0], pickS = -Infinity;
      rg.forEach(x => {
        let sc = 0;
        if (tgt0) {
          const ec = effectiveCost(st, pIdx, tgt0.card);
          x.colors.forEach(c => { if ((ec.per[c] || 0) === 0) sc += 1; });
        }
        // 少退优先（保留筹码灵活性），但池子空得多时退多一点更快恢复
        sc -= x.colors.length * 0.35;
        const poolLeft = COLORS.reduce((n, c) => n + st.pool[c], 0);
        if (poolLeft < 3) sc += x.colors.length * 0.3;
        if (sc > pickS) { pickS = sc; pick = x; }
      });
      return pick;
    }

    // 普罗米修斯：为买不起的明牌补上盗火方案（legalActions 里只有买得起的，须扫全场明牌）
    if (hasGod(st, pIdx, "prometheus") && (p.godUses.fire || 0) > 0) {
      const extra = [];
      targetCards(st, pIdx).forEach(t => {
        if (t.ref.zone !== "market") return;          // 盗火只可取明牌
        if (canAfford(st, pIdx, t.card)) return;      // 本来就买得起，无需盗火
        [1, 2, 3].forEach(lv => st.market[lv].forEach((id, idx) => {
          if (id == null || id === t.card.id) return;
          if (canAfford(st, pIdx, t.card, { fireFrom: id }))
            extra.push({ type: "buy", ref: t.ref, fireFrom: { zone: "market", level: lv, idx: idx } });
        }));
      });
      extra.forEach(a => acts.push(a));
    }

    let best = null, bestS = -Infinity;
    const ofIdx = st.oracleMode ? oracleFocus(st, pIdx) : -1;   // 神谕焦点：本回合最有望达成的碑
    for (const a of acts) {
      let s = scoreAction(st, pIdx, a);
      if (st.oracleMode && ofIdx >= 0) {
        // 神谕模式：声望引擎分只作辅助，主线是神谕进度——
        // 否则 AI 会先冲 15 声望终局，神谕碑永远轮不到完成。
        // 贵族/富矿两类目标本身依赖引擎成型（要靠卡牌加成凑贵族），保留更多引擎权重
        const oType = st.oracles[ofIdx] && st.oracles[ofIdx].type;
        s *= (oType === "nobles" || oType === "goldnob") ? 0.8 : 0.45;
        s += oracleAdvanceBonus(st, pIdx, a, ofIdx);
        // 主线=推神谕：按「动作前后焦点神谕完成度增量」给重奖（×60）。
        // 声望引擎分（scoreAction）只作辅助，避免 AI 在高阶/彩虹局里跑去攒声望小牌。
        const proj = safeProject(st, pIdx, a);
        if (proj) {
          const pof = proj.state.oracles[ofIdx];
          if (pof) {
            const d = oracleFrac(proj.state, pIdx, pof) - oracleFrac(st, pIdx, st.oracles[ofIdx]);
            s += d * 60;
            // 该动作直接达成神谕即胜 → 绝对优先
            if (proj.state.phase === "over" && Array.isArray(proj.state.winner) &&
                proj.state.winner.indexOf(pIdx) !== -1) s += 1e6;
          }
        }
      }
      s += rng() * 1.0;
      if (s > bestS) { bestS = s; best = a; }
    }
    if (!best) return null;

    // 堤丰：买牌后顺手埋掉对手最想要的同级明牌
    if (best.type === "buy" && hasGod(st, pIdx, "typhon") && best.ref.zone === "market") {
      const bought = getCard(st, best.ref);
      let bIdx = -1, bV = 1.5;
      st.market[bought.level].forEach((id, idx) => {
        if (id == null || idx === best.ref.idx) return;
        const v = blockValue(st, pIdx, CARD_BY_ID[id], "market");
        if (v > bV) { bV = v; bIdx = idx; }
      });
      if (bIdx >= 0)
        best = { type: "buy", ref: best.ref, bury: { zone: "market", level: bought.level, idx: bIdx } };
    }
    // 美杜莎：拿取/压牌后顺手施咒（免费，几乎每次都封）
    if ((best.type === "take" || best.type === "reserve") && hasGod(st, pIdx, "medusa") && rng() < 0.85) {
      const demand = {};
      COLORS.forEach(c => { demand[c] = 0; });
      st.players.forEach((opp, i) => {
        if (i === pIdx) return;
        const t = chooseTarget(st, i);
        if (!t) return;
        const ec = effectiveCost(st, i, t.card);
        COLORS.forEach(c => { demand[c] += Math.max(0, ec.per[c] - opp.tokens[c]); });
      });
      // 只封桌上还有货、且对手真缺的色（封空色等于浪费）
      let cc = null;
      COLORS.forEach(c => {
        if (st.pool[c] <= 0) return;
        if (best.colors && best.colors.indexOf(c) !== -1) return; // 自己刚拿的色不封
        if (cc == null || demand[c] > demand[cc]) cc = c;
      });
      if (cc != null && demand[cc] > 0) best = Object.assign({}, best, { curse: cc });
    }
    // 法厄同：刚拿的色完全用不上时，弃一枚换一金
    if (best.type === "take" && hasGod(st, pIdx, "phaethon") && p.tokens[GOLD] < 2 && st.pool[GOLD] > 0) {
      const t = chooseTarget(st, pIdx);
      if (t) {
        const ec = effectiveCost(st, pIdx, t.card);
        let worst = null, wS = Infinity;
        best.colors.forEach(c => {
          const deficit = Math.max(0, ec.per[c] - p.tokens[c]);
          if (deficit < wS) { wS = deficit; worst = c; }
        });
        if (worst != null && wS === 0) best = Object.assign({}, best, { swapGold: worst });
      }
    }
    return best;
  }

  function scoreAction(st, pIdx, a) {
    const p = st.players[pIdx];
    if (a.type === "buy") {
      const card = getCard(st, a.ref);
      const bc = bonusCounts(p);
      let s = card.vp * 8 + 3;
      s += (bc[card.bonus] || 0) * 1.2;                 // 加成连锁：已有该色加成 → 强化引擎
      s += noblePathScore(st, pIdx, card.bonus) * 3.5;
      const ec = effectiveCost(st, pIdx, card, a.fireFrom ? { fireFrom: a.fireFrom } : null);
      s -= ec.total * 0.4;
      if (card.level === 3) s += 2;
      if (a.fireFrom != null) s += 4;
      if (bestNobleNeed(st, pIdx)[card.bonus]) s += 2.5;  // 计划色加成 → 引擎 + 贵族双收益
      if (card.level === 1) s += 1.0;                     // 廉价起手牌作引擎基石也该愿意买
      // 声望终局权重：神谕模式下终局门槛为 25（见 finishTurn），且神谕才是主线
      const prestigeEnd = st.oracleMode ? 25 : (st.winVp || WIN_VP);
      if (vpOf(p) + card.vp >= prestigeEnd) s += 1000;
      const t = totalTokens(p);
      if (t >= 9) s += (t - 8) * 2;
      return s;
    }
    if (a.type === "reserve") {
      const card = getCard(st, a.ref);
      let s = 0;
      const missing = gemsNeededAfterGold(st, pIdx, card);
      // 早期抢黄金：手头无金时压牌白得 1 金很划算（通用引擎资源）
      if (p.tokens[GOLD] === 0) s += 3.5;
      else if (p.tokens[GOLD] <= 1) s += 1.5;
      const pot = card.vp * 6 + 2;
      s += pot * (missing <= 2 ? 0.9 : missing <= 4 ? 0.4 : 0.12);
      s += blockValue(st, pIdx, card, a.ref.zone) * 4;
      if (bestNobleNeed(st, pIdx)[card.bonus]) s += 2;   // 预留焦点色牌更值得
      if (p.reserved.length >= 2 && card.vp === 0 && card.level === 1) s -= 3;
      return s;
    }
    if (a.type === "returnGems") {
      // 退还是「无牌可打」时的补救动作，默认低分（不该跟拿牌/买牌抢）。
      // 但退掉自己用不上的颜色能提高后续效率，所以按「无用程度」给点正分。
      const tgt = chooseTarget(st, pIdx);
      let useless = 0;
      if (tgt) {
        const ec = effectiveCost(st, pIdx, tgt.card);
        a.colors.forEach(c => { if ((ec.per[c] || 0) === 0) useless += 1; });
      }
      // 只退 1 枚更保守（保留灵活性）；退一大把说明是在清空僵局，加分
      const bulk = a.colors.length >= 2 ? 1.5 : 0;
      return 0.5 + useless * 0.6 + bulk;
    }
    if (a.type === "steal") {
      return 25 + NOBLE_BY_ID[a.nobleId].vp * 5;   // 白得贵族几乎稳赚
    }
    if (a.type === "pressNoble") {
      // 压贵族是纯战术动作（不直接推进自己成型），
      // 只有两种情况划算：① 自己即将达标，先锁死防被抢；② 对手即将达标，救火封堵。
      const noble = NOBLE_BY_ID[a.nobleId];
      const req = noble.req;
      const b = bonusCounts(p);
      let have = 0, need = 0;
      Object.keys(req).forEach(c => { have += Math.min(b[c] || 0, req[c]); need += req[c]; });
      const prog = need ? have / need : 0;

      let s = 1.2 + noble.vp * 0.6;                 // 保底：白得 1 金 + 占位
      if (prog >= 0.6) s += (prog - 0.5) * 14;      // 我快到了 → 值钱
      else if (prog < 0.45) s -= 3;                 // 我差太远，压了也是纯浪费回合

      st.players.forEach((opp, i) => {
        if (i === pIdx) return;
        const ob = bonusCounts(opp);
        let oh = 0;
        Object.keys(req).forEach(c => { oh += Math.min(ob[c] || 0, req[c]); });
        const oprog = need ? oh / need : 0;
        if (oprog >= 0.9) s += 8;                   // 对手这一步就要拿了 → 救火
        else if (oprog >= 0.7) s += 3.5;
      });
      if (p.tokens[GOLD] === 0) s += 1.2;
      return s;
    }
    if (a.type === "take") {
      const colors = a.colors;
      const p = st.players[pIdx];
      const bc = bonusCounts(p);
      const target = chooseTarget(st, pIdx);
      const nneed = bestNobleNeed(st, pIdx);
      const focus = focusColors(st, pIdx);
      let s = 0;
      if (target) {
        const ec = effectiveCost(st, pIdx, target.card);
        const deficit = {};
        COLORS.forEach(c => { deficit[c] = Math.max(0, ec.per[c] - p.tokens[c]); });
        colors.forEach(c => {
          s += Math.min(deficit[c], 2) * 2.4;                 // 直接补缺目标
          if (focus[c]) s += focus[c] * 1.3;                  // 引擎 / 焦点色：复利折扣 + 连锁
          if ((bc[c] || 0) >= 1) s += 1.1;                    // 已有该色加成 → 继续堆
          if (nneed[c]) s += 2.0;                             // 贵族需求色
        });
        s += noblePathScore(st, pIdx, target.card.bonus) * 0.2;
        if (nneed[target.card.bonus]) s += 3;
        if (a.bonus != null) {
          s += Math.min(deficit[a.bonus], 2) * 2.4 + 0.8;
          if (focus[a.bonus]) s += focus[a.bonus] * 0.8;
        }
      } else {
        colors.forEach(c => {
          s += 0.6;
          if (focus[c]) s += focus[c] * 1.3;
          if ((bc[c] || 0) >= 1) s += 1.1;
        });
        if (a.bonus != null) s += 0.8 + (focus[a.bonus] || 0);
      }
      // 早期分散拿取（建立灵活度 + 多色加成起手），避免死盯单色
      if (p.cards.length <= 2 && colors.length === 3 && new Set(colors).size === 3) s += 2.5;
      // 阻断对手紧缺色：对手越接近达标越该堵
      colors.forEach(c => {
        st.players.forEach((opp, i) => {
          if (i === pIdx) return;
          const ot = chooseTarget(st, i);
          if (!ot) return;
          const oec = effectiveCost(st, i, ot.card);
          const od = oec.per[c] - opp.tokens[c];
          if (od >= 1) {
            const og = gemsNeededAfterGold(st, i, ot.card);
            if (og <= 2) s += 2.2;          // 对手一步就要买 → 强堵
            else if (og <= 4) s += 1.0;
          }
        });
      });
      if (colors.length === 2 && colors[0] === colors[1]) s += 1.0; // 同色效率
      const after = totalTokens(p) + colors.length + (a.bonus != null ? 1 : 0);
      if (after > tokenLimit(st, pIdx)) s -= (after - tokenLimit(st, pIdx)) * 3;
      // 拿到手后下回合就能买 → 强推
      if (target) {
        const ec2 = effectiveCost(st, pIdx, target.card);
        const sim = Object.assign({}, p.tokens);
        colors.forEach(c => { sim[c] = (sim[c] || 0) + 1; });
        if (a.bonus != null) sim[a.bonus] = (sim[a.bonus] || 0) + 1;
        let left = 0;
        COLORS.forEach(c => { left += Math.max(0, ec2.per[c] - (sim[c] || 0)); });
        if (left - (sim[GOLD] || 0) <= 0) s += 6.5;
      }
      return s;
    }
    return 0;
  }

  return {
    COLORS, GOLD, ALL, COLOR_CN, WIN_VP, WIN_VP_MIN, WIN_VP_MAX, HAND_MAX, TOKEN_MAX,
    CARD_POOL, CARD_BY_ID, NOBLES, NOBLE_BY_ID, GODS, GOD_BY_ID, PLAYER_META,
    makeRng, newGame, cloneState, getCard, bonusCounts, vpOf, totalTokens,
    effectiveCost, canAfford, gemsNeededAfterGold, eligibleNobles,
    hasGod, godIdx, tokenLimit,
    legalActions, applyAction, aiChoose, computeWinner,
    ORACLE_TYPES, ORACLE_KEYS, oracleBannedGods, initOracles, oracleSatisfied, checkOracles, oracleProgress
  };
});