/* ===== i18n 验证：加载 index.html + i18n，切英文，扫描残留中文 ===== */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const logic = fs.readFileSync(path.join(DIR, "logic.js"), "utf8");
const i18nEn = fs.readFileSync(path.join(DIR, "i18n_en.js"), "utf8");
const i18nCore = fs.readFileSync(path.join(DIR, "i18n_core.js"), "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://127.0.0.1:3919/" });
const w = dom.window;
w.HTMLMediaElement.prototype.play = () => Promise.resolve();
w.HTMLMediaElement.prototype.pause = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};
w.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {}, onfinish: null, play() {}, pause() {} }; };
if (!w.requestAnimationFrame) w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);

try {
  const aset = /<script id="inlinedAssets">([\s\S]*?)<\/script>/.exec(html);
  if (aset) {
    const body = aset[1]
      .replace(/const ASSET_IMG=/, "window.ASSET_IMG=")
      .replace(/const ASSET_AUD=/, "window.ASSET_AUD=")
      .replace(/:'data:[^']*'/g, ":'data:image/jpeg;base64,'")
      .replace(/:"data:[^"]*"/g, ':"data:image/jpeg;base64,"');
    try { w.eval(body); } catch (e) { console.log("资产:", e.message); }
  }
} catch (e) {}
try { w.eval(logic); } catch (e) { console.log("logic:", e.message); }

// 内联游戏脚本
const blocks = [];
const re = /<script(?![^>]*inlinedAssets)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) if (m[1].trim()) blocks.push(m[1]);
for (const code of blocks) { try { w.eval(code); } catch (e) { console.log("inline err:", e.message); } }

// i18n
try { w.eval(i18nEn); } catch (e) { console.log("i18n_en:", e.message); }
try { w.eval(i18nCore); } catch (e) { console.log("i18n_core:", e.message); }

// 强制英文
try { w.setLang("en-US"); } catch (e) { console.log("setLang:", e.message); }
try { if (w.applyI18nNow) w.applyI18nNow(); } catch (e) {}

// 驱动一些界面以覆盖更多
const click = el => { if (el) el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const hover = el => { if (el) el.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true })); };
try {
  const tabs = w.document.querySelectorAll(".lobbyTabs button");
  for (const t of tabs) { click(t); }
  const g = w.document.querySelector('.godCard2[data-god="midas"]');
  if (g) click(g);
  const hb = w.document.querySelector("#helpBtn"); if (hb) { click(hb); }
  const hb2 = w.document.querySelector("#helpBtn2"); if (hb2) { click(hb2); }
  const sb = w.document.querySelector("#statsBtn"); if (sb) { click(sb); }
  const tb = w.document.querySelector("#tutBtn2"); if (tb) { click(tb); for (let i=0;i<6;i++){ const nx=w.document.querySelector("#tutNext"); if(nx)click(nx); } }
} catch (e) { console.log("drive:", e.message); }
try { w.applyI18nNow(); } catch (e) {}

// 进入单人局并走若干回合，覆盖对局内中文（面板/提示/结算）
try {
  const startBtn = w.document.querySelector("#startBtn");
  if (startBtn) click(startBtn);
  for (let i = 0; i < 25; i++) {
    const gems = w.document.querySelectorAll("#poolBar .gem, #poolBar svg");
    if (gems.length) click(gems[i % gems.length]);
    const cards = w.document.querySelectorAll("#market .card");
    if (cards.length) click(cards[i % cards.length]);
    const acts = w.document.querySelectorAll("#actionBar button, #actionBar .btn");
    if (acts.length) click(acts[i % acts.length]);
    const closeBtns = w.document.querySelectorAll(".overlay .close, .modal .close");
    closeBtns.forEach(b => click(b));
    w.applyI18nNow();
  }
  // 悬停卡牌/贵族 tooltip
  w.document.querySelectorAll("#market .card, #nobleBar .noble").forEach(c => hover(c));
  w.applyI18nNow();
} catch (e) { console.log("gameplay drive:", e.message); }

// 扫描残留中文
const doc = w.document;
const CJK = /[一-鿿]/;
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);
let textHits = [], attrHits = [];
const all = doc.querySelectorAll("*");
all.forEach(el => {
  if (SKIP.has(el.tagName)) return;
  el.childNodes.forEach(n => {
    if (n.nodeType === 3) {
      const t = (n.nodeValue || "").replace(/\s+/g, " ").trim();
      if (t && CJK.test(t) && !/^\s*$/.test(t)) textHits.push(t);
    }
  });
  ["title", "placeholder", "aria-label", "alt", "data-godtip"].forEach(a => {
    const v = el.getAttribute(a);
    if (v && CJK.test(v)) attrHits.push(a + "=" + v);
  });
});
// 去重
const ut = {}; textHits.forEach(t => ut[t] = (ut[t] || 0) + 1);
const ua = {}; attrHits.forEach(t => ua[t] = (ua[t] || 0) + 1);

console.log("\n===== 英文模式残留中文统计 =====");
console.log("文本节点未翻译条数(去重):", Object.keys(ut).length, " 总出现:", textHits.length);
console.log("属性未翻译条数(去重):", Object.keys(ua).length);

// 过滤掉明显的"玩家名/动态实体名"误报：仅列出含动词/句号的真正 UI 文案
const suspicious = Object.keys(ut).filter(t => t.length > 4 || /[。：，、—·]/.test(t));
console.log("\n--- 疑似 UI 文案（较长或带标点，优先修）---");
suspicious.slice(0, 60).forEach(t => console.log("  ", t.slice(0, 80)));
console.log("\n--- 短标签残留 ---");
Object.keys(ut).filter(t => !(t.length > 4 || /[。：，、—·]/.test(t))).slice(0, 40).forEach(t => console.log("  ", JSON.stringify(t)));
if (Object.keys(ua).length) { console.log("\n--- 属性 ---"); Object.keys(ua).slice(0, 30).forEach(t => console.log("  ", t)); }

// 还原检查：切回中文，确认中文能回来（验证 __zh 缓存未被英文污染）
try {
  w.setLang("zh-CN");
  const enLeft = w.document.body.textContent.indexOf("Gem Merchant") >= 0 || w.document.body.textContent.indexOf("Take Gems") >= 0;
  // 切回英文再数一次残留，确保开关幂等
  w.setLang("en-US");
} catch (e) { console.log("restore:", e.message); }
// 重新扫描（用英文）
let textHits2 = [], attrHits2 = [];
w.document.querySelectorAll("*").forEach(el => {
  if (SKIP.has(el.tagName)) return;
  el.childNodes.forEach(n => { if (n.nodeType === 3) { const t = (n.nodeValue || "").replace(/\s+/g, " ").trim(); if (t && CJK.test(t)) textHits2.push(t); } });
  ["title", "placeholder", "aria-label", "alt", "data-godtip"].forEach(a => { const v = el.getAttribute(a); if (v && CJK.test(v)) attrHits2.push(a + "=" + v); });
});
const ut2 = {}; textHits2.forEach(t => ut2[t] = (ut2[t] || 0) + 1);
const ua2 = {}; attrHits2.forEach(t => ua2[t] = (ua2[t] || 0) + 1);
console.log("\n===== 二次扫描（英文，切回后再切回）=====");
console.log("文本节点未翻译(去重):", Object.keys(ut2).length, " 属性:", Object.keys(ua2).length);
Object.keys(ut2).slice(0, 30).forEach(t => console.log("  [T]", t.slice(0, 70)));
Object.keys(ua2).slice(0, 20).forEach(t => console.log("  [A]", t));

// 强制退出
process.exit(0);

// 强制退出：游戏内联脚本可能遗留 setInterval/requestAnimationFrame 循环，使 Node 事件循环不释放
process.exit(0);
