/* ===== i18n 采集器 v2：按「文本块」采集 =====
 * 一个「文本块」= 含中文、且直接子节点中没有块级元素的元素。
 * 其 innerHTML 作为词典 key（保留 <b>/<em> 内联结构），英文译文同结构。
 *
 * 这样 <p>① <b>拿取宝石</b> —— 3 枚不同色。</p> 整段是一个 key，
 * 而不是被 <b> 切成的 3 个碎片，翻译语序可控、粗体能保留。
 *
 * 输出 i18n_collected.json：
 *   { blocks: [{zh, html, tag, n}], texts: [...], attrs: [...] }
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const logic = fs.readFileSync(path.join(DIR, "logic.js"), "utf8");

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
    try { w.eval(body); } catch (e) { console.log("资产注入警告:", e.message); }
  }
}
try { w.eval(logic); } catch (e) { console.error("logic 注入失败:", e.message); process.exit(1); }

const blocks = [];
const re = /<script(?![^>]*inlinedAssets)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) if (m[1].trim()) blocks.push(m[1]);
for (const code of blocks) { try { w.eval(code); } catch (e) {} }

const doc = w.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));

/* ---------- 采集逻辑 ---------- */
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6",
  "TABLE", "TR", "TD", "TH", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "FORM"]);
/* 允许作为「内联子元素」存在的标签：这些标签包在文本里，整块替换 innerHTML 安全 */
const INLINE_TAGS = new Set(["B", "STRONG", "EM", "I", "U", "S", "SPAN", "BR", "SMALL",
  "SUP", "SUB", "CODE", "FONT", "MARK", "ABBR", "DEL", "INS", "KBD", "TIME"]);
/* 一旦块内出现这些元素，说明它是「容器」而非「文案叶子」，跳过（其子元素会各自被采集） */
const CONTAINER_TAGS = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "IMG", "SVG",
  "CANVAS", "VIDEO", "AUDIO", "TABLE", "UL", "OL", "LI", "DIV", "P", "H1", "H2", "H3", "H4"]);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);
const CJK = /[\u4e00-\u9fa5]/;
const ATTRS = ["title", "placeholder", "aria-label", "alt", "data-godtip"];

const blockMap = new Map();  // zh(规范化 textContent) -> {html, tag, n}
const textMap = new Map();   // 纯文本节点（无内联标签的散句）
const attrMap = new Map();

function normText(s) { return String(s).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function normHtml(s) {
  return String(s)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}
const hasBlockChild = el => Array.from(el.children).some(c => BLOCK_TAGS.has(c.tagName));

function harvest(root) {
  if (!root) return;
  const all = [];
  if (root.nodeType === 1) all.push(root);
  all.push(...Array.from(root.querySelectorAll ? root.querySelectorAll("*") : []));

  all.forEach(el => {
    if (SKIP.has(el.tagName)) return;
    if (el.closest && el.closest("script,style,noscript,textarea")) return;

    // 属性
    ATTRS.forEach(a => {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && CJK.test(v)) {
        const k = normText(v);
        if (k) attrMap.set(k, (attrMap.get(k) || 0) + 1);
      }
    });

    // 文本块：含中文 + 只含「纯排版型内联子元素」+ 有实际文字
    const txt = normText(el.textContent || "");
    if (!txt || !CJK.test(txt)) return;
    const kids = Array.from(el.children);
    // 子元素必须是纯排版标签（无 class/id/data 等属性），否则说明它是容器
    if (kids.some(c => !INLINE_TAGS.has(c.tagName) || c.attributes.length > 0)) return;
    if (el.tagName === "IMG" || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const htmlKey = normHtml(el.innerHTML || "");
    if (!htmlKey || !CJK.test(htmlKey)) return;

    const key = txt;
    const prev = blockMap.get(key);
    if (prev) prev.n++;
    else blockMap.set(key, { html: htmlKey, tag: el.tagName, n: 1 });
  });
}

const click = el => { if (el) el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  harvest(doc.body);

  // 大厅标签页
  const tabs = $$(".lobbyTabs button");
  for (let i = 0; i < tabs.length; i++) { click(tabs[i]); await sleep(70); harvest(doc.body); }

  // 神祇 13 位逐一点选（3 页 × 5）
  for (let p = 0; p < 3; p++) {
    $$(".godCard2").forEach(c => { click(c); harvest(doc.body); });
    click($("#pgNext")); await sleep(50);
  }
  $$(".vpChip").forEach(c => click(c));
  harvest(doc.body);

  // 帮助 / 战绩 / 教学
  click($("#helpBtn")); await sleep(80); harvest(doc.body);
  click($("#closeHelp")); await sleep(50);
  click($("#helpBtn2")); await sleep(80); harvest(doc.body);
  click($("#closeHelp")); await sleep(50);
  click($("#tutBtn2")); await sleep(80);
  for (let i = 0; i < 10; i++) { harvest(doc.body); click($("#tutNext")); await sleep(60); }
  click($("#tutClose")); await sleep(50);
  click($("#statsBtn")); await sleep(80); harvest(doc.body);
  click($("#closeStats")); await sleep(50);
  harvest(doc.body);

  // 单人开局
  click($("#startBtn")); await sleep(500);
  harvest(doc.body);

  // 走回合
  for (let turn = 0; turn < 40; turn++) {
    const gems = $$("#poolBar .gem, #poolBar svg");
    if (gems.length) click(gems[Math.floor(Math.random() * gems.length)]);
    const cards = $$("#market .card");
    if (cards.length) click(cards[Math.floor(Math.random() * cards.length)]);
    const btns = $$("#actionBar button, #actionBar .btn").filter(b => b.offsetParent !== null || true);
    if (btns.length) click(btns[Math.floor(Math.random() * btns.length)]);
    await sleep(100);
    harvest(doc.body);
    if (!$("#humanPanel")) break;
  }

  // 悬停提示（tooltip 内容）
  $$("#market .card").slice(0, 6).forEach(c => {
    c.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true }));
    harvest(doc.body);
  });
  $$("#nobleBar .noble").slice(0, 3).forEach(n => {
    n.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true }));
    harvest(doc.body);
  });

  // 终局
  try {
    if (w.st && w.renderAll) {
      const me = w.st.players.find(p => !p.isAI);
      if (me) { me.points = 99; w.renderAll(); await sleep(200); harvest(doc.body); }
      const endBtn = $("#endAnalysis");
      if (endBtn) { click(endBtn); await sleep(200); harvest(doc.body); }
      $$(".overlay button").forEach(b => { if (/再来|返回|重开|新局/.test(b.textContent || "")) click(b); });
      await sleep(200);
      harvest(doc.body);
    }
  } catch (e) { console.log("终局触发失败:", e.message); }

  const out = {
    blocks: [...blockMap.entries()]
      .map(([zh, v]) => ({ zh, html: v.html, tag: v.tag, n: v.n }))
      .sort((a, b) => b.zh.length - a.zh.length),
    attrs: [...attrMap.keys()].sort((a, b) => b.length - a.length)
  };
  fs.writeFileSync(path.join(DIR, "i18n_collected.json"), JSON.stringify(out, null, 1), "utf8");
  console.log(`\n写入 i18n_collected.json：文本块 ${out.blocks.length} 条，属性 ${out.attrs.length} 条`);
  const inline = out.blocks.filter(b => b.html !== b.zh && /</.test(b.html)).length;
  console.log(`其中含内联标签（粗体等）的块: ${inline} 条`);
  process.exit(0);
})();
