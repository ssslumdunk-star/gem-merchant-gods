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
w.eval(logic);
const re = /<script(?![^>]*inlinedAssets)[^>]*>([\s\S]*?)<\/script>/g; let m; const blocks = [];
while ((m = re.exec(html))) if (m[1].trim()) blocks.push(m[1]);
for (const c of blocks) { try { w.eval(c); } catch (e) {} }
w.eval(i18nEn); w.eval(i18nCore);
const click = el => { if (el) el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const hover = el => { if (el) el.dispatchEvent(new w.MouseEvent("mouseenter", { bubbles: true })); };
try { const g = w.document.querySelector('.godCard2[data-god="midas"]'); if (g) click(g); } catch (e) {}
try { const startBtn = w.document.querySelector("#startBtn"); if (startBtn) click(startBtn); } catch (e) {}
for (let i = 0; i < 30; i++) {
  const gems = w.document.querySelectorAll("#poolBar .gem, #poolBar svg");
  if (gems.length) click(gems[i % gems.length]);
  const cards = w.document.querySelectorAll("#market .card");
  if (cards.length) click(cards[i % cards.length]);
  const acts = w.document.querySelectorAll("#actionBar button, #actionBar .btn");
  if (acts.length) click(acts[i % acts.length]);
}
w.setLang("en-US");
w.applyI18nNow();
const CJK = /[一-鿿]/;
function find(parent, needle) {
  const all = parent.querySelectorAll("*");
  for (const el of all) {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "TEXTAREA") continue;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.indexOf(needle) >= 0) {
        console.log("\nMATCH '" + needle + "' in <" + el.tagName + (el.getAttribute("class") ? "." + el.getAttribute("class") : "") + ">");
        console.log("  raw nodeValue:", JSON.stringify(n.nodeValue));
        console.log("  parent.textContent:", JSON.stringify(el.textContent.slice(0, 120)));
        console.log("  parent.innerHTML:", el.innerHTML.slice(0, 200));
        let p = el, chain = [];
        for (let k = 0; k < 4 && p; k++) { chain.push("<" + p.tagName + (p.getAttribute("id") ? "#" + p.getAttribute("id") : "") + ">"); p = p.parentNode; }
        console.log("  chain:", chain.join(" "));
      }
    }
  }
}
find(w.document, "永久 +1 折扣");
find(w.document, "中");
process.exit(0);
