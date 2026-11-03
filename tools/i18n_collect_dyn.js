/* ===== i18n 动态文案采集 =====
 * 静态 UI 由 i18n_collect.js 采集；本脚本专采「运行期才出现」的文案：
 *   - st.log（每回合日志，只显示最后 2 条 → 必须全程累积）
 *   - toast() 提示气泡（各种错误/警告/事件播报）
 *   - 悬停浮层（showTip / showNobleTip / showGodTip）
 *   - 终局结算面板
 *
 * 手法：拦包 toast，跑多局不同神祇，最后把累积文案全部导出。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const logicSrc = fs.readFileSync(path.join(DIR, "logic.js"), "utf8");

const CJK = /[\u4e00-\u9fa5]/;
const normText = s => String(s).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const collected = new Map();   // 规范化文本 -> {n, src}
function add(s, src) {
  const t = normText(s);
  if (!t || !CJK.test(t)) return;
  const prev = collected.get(t);
  if (prev) prev.n++;
  else collected.set(t, { n: 1, src });
}

function makeDom() {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://127.0.0.1:3919/" });
  const w = dom.window;
  w.HTMLMediaElement.prototype.play = () => Promise.resolve();
  w.HTMLMediaElement.prototype.pause = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.Element.prototype.animate = function () {
    return { finished: Promise.resolve(), cancel() {}, onfinish: null, play() {}, pause() {} };
  };
  if (!w.requestAnimationFrame) w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
  {
    const aset = /<script id="inlinedAssets">([\s\S]*?)<\/script>/.exec(html);
    if (aset) {
      const body = aset[1]
        .replace(/const ASSET_IMG=/, "window.ASSET_IMG=")
        .replace(/const ASSET_AUD=/, "window.ASSET_AUD=")
        .replace(/:'data:[^']*'/g, ":'data:image/jpeg;base64,'")
        .replace(/:"data:[^"]*"/g, ':"data:image/jpeg;base64,"');
      try { w.eval(body); } catch (e) {}
    }
  }
  try { w.eval(logicSrc); } catch (e) { console.error("logic 注入失败:", e.message); process.exit(1); }
  const blocks = [];
  const re = /<script(?![^>]*inlinedAssets)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) if (m[1].trim()) blocks.push(m[1]);
  for (const code of blocks) { try { w.eval(code); } catch (e) {} }
  return w;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = (w, el) => { if (el) el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };

/* 从 DOM 抓当前所有可见中文（浮层/日志/提示） */
function scrapeDom(w) {
  const doc = w.document;
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);
  const INLINE = new Set(["B", "STRONG", "EM", "I", "U", "S", "SPAN", "BR", "SMALL", "SUP", "SUB"]);
  doc.querySelectorAll("div,p,li,h1,h2,h3,h4,h5,td,th,span,b,em,i,strong,button,a,label,small,dt,dd").forEach(el => {
    if (el.closest("script,style,noscript,textarea")) return;
    const kids = Array.from(el.children);
    if (kids.some(c => !INLINE.has(c.tagName) || c.attributes.length > 0)) return;
    const t = normText(el.textContent || "");
    if (t && CJK.test(t)) add(t, "dom");
  });
  // 属性
  doc.querySelectorAll("[title],[placeholder],[aria-label],[alt],[data-godtip]").forEach(el => {
    ["title", "placeholder", "aria-label", "alt", "data-godtip"].forEach(a => {
      const v = el.getAttribute(a);
      if (v && CJK.test(v)) add(v, "attr:" + a);
    });
  });
}

(async () => {
  const GODS = require(path.join(DIR, "logic.js")).GODS;

  for (const god of GODS) {
    const w = makeDom();
    // 拦包 toast
    const origToast = w.toast;
    w.toast = function (msg, kind) {
      add(msg, "toast");
      try { if (typeof origToast === "function") origToast.call(w, msg, kind); } catch (e) {}
    };

    // 大厅：选神 → 开局
    const card = w.document.querySelector(`.godCard2[data-god="${god.id}"]`);
    if (!card) { // 翻页找
      for (let p = 0; p < 3; p++) {
        click(w, w.document.querySelector("#pgNext"));
        const c = w.document.querySelector(`.godCard2[data-god="${god.id}"]`);
        if (c) { click(w, c); break; }
      }
    } else click(w, card);
    scrapeDom(w);

    click(w, w.document.querySelector("#startBtn"));
    await sleep(400);

    // 打满一局（上限 80 回合防死循环）
    for (let turn = 0; turn < 80; turn++) {
      const st = w.st;
      if (!st || st.phase === "over") break;

      // 优先用「合法动作」驱动：直接调 applyAction 更可控，同时保留 UI 路径
      let acts = [];
      try { acts = w.GemLogic.legalActions(st, 0) || []; } catch (e) {}
      if (acts.length) {
        // 偏向买牌/拿宝石，制造多样日志
        const pick = acts[Math.floor(Math.random() * acts.length)];
        try { w.GemLogic.applyAction(st, pick); } catch (e) {}
      }
      // 让 AI 与渲染推进
      try { if (typeof w.tick === "function") w.tick(); } catch (e) {}
      try { if (typeof w.renderAll === "function") w.renderAll(); } catch (e) {}
      await sleep(40);

      // 累积完整日志
      try {
        const s2 = w.st;
        if (s2 && s2.log) s2.log.forEach(l => add(l, "log"));
      } catch (e) {}
      scrapeDom(w);

      // 悬停若干卡与贵族，抓 tooltip
      if (turn % 5 === 0) {
        const cards = w.document.querySelectorAll("#market .card");
        if (cards.length) {
          const c = cards[Math.floor(Math.random() * cards.length)];
          try {
            c.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true, clientX: 300, clientY: 300 }));
            c.dispatchEvent(new w.MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 300 }));
          } catch (e) {}
          await sleep(30);
          scrapeDom(w);
        }
        const nobles = w.document.querySelectorAll("#nobleBar .noble");
        if (nobles.length) {
          const n = nobles[Math.floor(Math.random() * nobles.length)];
          try { n.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true, clientX: 300, clientY: 300 })); } catch (e) {}
          await sleep(30);
          scrapeDom(w);
        }
      }
    }

    // 终局面板
    try {
      const s = w.st;
      if (s) {
        const me = s.players.find(p => !p.isAI) || s.players[0];
        if (me) me.points = 99;
        if (typeof w.renderAll === "function") w.renderAll();
        await sleep(200);
        scrapeDom(w);
        if (typeof w.showEnd === "function") { w.showEnd(); await sleep(150); scrapeDom(w); }
      }
    } catch (e) {}
  }

  const out = {
    strings: [...collected.entries()].map(([zh, v]) => ({ zh, n: v.n, src: v.src }))
      .sort((a, b) => b.n - a.n || b.zh.length - a.zh.length)
  };
  fs.writeFileSync(path.join(DIR, "i18n_dynamic.json"), JSON.stringify(out, null, 1), "utf8");
  console.log(`写入 i18n_dynamic.json：${out.strings.length} 条`);
  const bySrc = {};
  out.strings.forEach(s => { bySrc[s.src] = (bySrc[s.src] || 0) + 1; });
  console.log("来源分布:", JSON.stringify(bySrc));
  process.exit(0);
})();
