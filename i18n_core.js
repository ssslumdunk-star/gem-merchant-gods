/* ================= i18n：多语言引擎 =================
 * 设计目标：不改动任何现有文案调用点（852+ 处），降低改造风险。
 * 方案：DOM 层翻译（中文原文即 key），四级回退：
 *   1) HTML 块匹配 —— 整段 innerHTML 替换（保留 <b>/<em> 等粗体）
 *   2) TEXT 文本节点精确匹配
 *   3) PATTERNS —— 日志/提示等动态句正则（捕获组里的实体名再用 WORDS 翻）
 *   4) WORDS —— 神名/贵族名/颜色/神谕等专有名词子串替换
 * 中文模式完全不介入，零开销。切回中文由节点缓存的原文还原。
 */
(function () {
  "use strict";

  var I18N_DATA = window.I18N_DATA || { HTML: {}, TEXT: {}, ATTR: {}, WORDS: {}, PATTERNS: [] };

  var I18N = {
    lang: "zh-CN",
    SUPPORTED: ["zh-CN", "en-US"],
    STORAGE_KEY: "gem_lang",
    enabled: false
  };
  window.I18N = I18N;

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, TEXTAREA: 1 };
  var TR_ATTRS = ["title", "placeholder", "aria-label", "alt", "data-godtip"];

  function normText(s) {
    return String(s == null ? "" : s)
      .replace(/ /g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function hasCJK(s) { return /[一-鿿]/.test(s); }

  // 把 WORDS 里的键按长度降序（最长优先），用于子串替换
  var WORD_KEYS = Object.keys(I18N_DATA.WORDS || {}).sort(function (a, b) { return b.length - a.length; });
  function applyWords(s) {
    if (!hasCJK(s)) return s;
    var out = s, changed = false;
    for (var i = 0; i < WORD_KEYS.length; i++) {
      var k = WORD_KEYS[i], v = I18N_DATA.WORDS[k];
      if (k && out.indexOf(k) !== -1) { out = out.split(k).join(v); changed = true; }
    }
    return changed ? out : s;
  }

  function trTextValue(value) {
    var raw = String(value);
    var t = normText(raw);
    if (!t || !hasCJK(t)) return raw;
    if (I18N_DATA.TEXT && I18N_DATA.TEXT[t] !== undefined) return I18N_DATA.TEXT[t];
    var pats = I18N_DATA.PATTERNS || [];
    for (var i = 0; i < pats.length; i++) {
      var re = pats[i][0], tpl = pats[i][1];
      if (re.test(raw)) {
        try {
          var r = raw.replace(re, tpl);
          r = applyWords(r);
          return r;
        } catch (e) {}
      }
    }
    var w = applyWords(raw);
    return w === raw ? raw : w;
  }

  function cacheText(node) {
    // 只要当前值含中文，就视作「游戏写入的新原文」并刷新缓存：
    // 英文模式下引擎自己只写英文（非中文），不会污染；游戏代码重写节点（如回合提示）时拿到的是最新中文。
    if (node.nodeValue && hasCJK(node.nodeValue)) node.__zh = node.nodeValue;
  }
  function trTextNode(node) {
    var p = node.parentNode;
    if (!p || SKIP_TAGS[p.tagName]) return;
    if (p.closest && p.closest("[data-noi18n]")) return;   // 标记为不翻译的子树（切换按钮等）
    cacheText(node);
    if (node.__zh === undefined) return;   // 无中文原文（空格/纯英文/SVG 结构）——绝不能动，否则会被写成字面量 "undefined"
    var out = trTextValue(node.__zh);
    if (out !== node.__zh && out !== node.nodeValue) node.nodeValue = out;
  }

  function trAttrs(el) {
    if (!el.getAttribute) return;
    if (!el.__zhAttrs) el.__zhAttrs = {};
    for (var i = 0; i < TR_ATTRS.length; i++) {
      var a = TR_ATTRS[i];
      var cur = el.getAttribute(a);
      if (cur == null || !hasCJK(cur)) continue;
      if (el.__zhAttrs[a] === undefined) el.__zhAttrs[a] = cur;
      var src = el.__zhAttrs[a];
      // 属性优先走精确的 ATTR 词典（神技 title 等整句）；否则退回 TEXT/PATTERNS/WORDS
      var out = (I18N_DATA.ATTR && I18N_DATA.ATTR[src] !== undefined) ? I18N_DATA.ATTR[src] : trTextValue(src);
      if (out !== cur) el.setAttribute(a, out);
    }
  }

  function translateEl(el) {
    if (!el || el.nodeType !== 1) return;
    if (SKIP_TAGS[el.tagName]) return;
    if (el.closest && el.closest("[data-noi18n]")) return;   // 标记为不翻译的子树（切换按钮等）
    trAttrs(el);
    var t = normText(el.textContent || "");
    if (t && I18N_DATA.HTML && I18N_DATA.HTML[t] !== undefined) {
      if (el.__zhHtml === undefined) el.__zhHtml = el.innerHTML;
      el.innerHTML = I18N_DATA.HTML[t];
      return; // 已整块替换，不再下钻
    }
    var ch = el.childNodes;
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i];
      if (c.nodeType === 3) trTextNode(c);
      else if (c.nodeType === 1) translateEl(c);
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 1) translateEl(root);
    else if (root.nodeType === 11) {
      var k = root.childNodes;
      for (var i = 0; i < k.length; i++) { if (k[i].nodeType === 1) translateEl(k[i]); }
    } else if (root.nodeType === 3) trTextNode(root);
  }

  function restoreEl(el) {
    if (!el || el.nodeType !== 1) return;
    if (SKIP_TAGS[el.tagName]) return;
    if (el.__zhHtml !== undefined && el.innerHTML !== el.__zhHtml) el.innerHTML = el.__zhHtml;
    var ch = el.childNodes;
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i];
      if (c.nodeType === 3) { if (c.__zh !== undefined && c.nodeValue !== c.__zh) c.nodeValue = c.__zh; }
      else if (c.nodeType === 1) restoreEl(c);
    }
  }
  function restoreTree(root) {
    if (!root) return;
    if (root.nodeType === 1) restoreEl(root);
  }

  function trTitle() {
    if (document.__zhTitle === undefined) document.__zhTitle = document.title;
    var out = trTextValue(document.__zhTitle);
    if (out !== document.title) document.title = out;
  }
  function restoreTitle() {
    if (document.__zhTitle !== undefined && document.title !== document.__zhTitle) document.title = document.__zhTitle;
  }

  function applyLang() {
    if (!I18N.enabled) return;
    var body = document.body;
    if (!body) return;
    if (I18N.lang === "zh-CN") { restoreTree(body); restoreTitle(); }
    else { translateTree(body); trTitle(); }
  }

  /* ---------- MutationObserver：动态内容自动翻译 ---------- */
  var _obs = null;
  var _suppress = false;
  function handleMuts(muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === "childList") {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 1) {
            if (n.__zhHtml !== undefined) continue; // 已翻译块跳过
            translateEl(n);
          } else if (n.nodeType === 3) {
            trTextNode(n);
          }
        }
      } else if (m.type === "characterData") {
        var nd = m.target;
        if (nd.nodeValue && hasCJK(nd.nodeValue)) { cacheText(nd); trTextNode(nd); }
      } else if (m.type === "attributes") {
        trAttrs(m.target);
      }
    }
  }
  function startObserver() {
    if (_obs || typeof MutationObserver === "undefined") return;
    _obs = new MutationObserver(function (muts) {
      if (I18N.lang === "zh-CN" || _suppress) return;
      _suppress = true;
      _obs.disconnect();           // 处理期间断开，避免自己写的 DOM 又触发回调
      _obs = null;                 // 必须置空，否则下方 startObserver 因 _obs 存在而提前 return，观察器永久失效
      try { handleMuts(muts); } catch (e) {}
      startObserver();              // 重新连接（_obs 已被置空，可重建）
      _suppress = false;
    });
    _obs.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: TR_ATTRS
    });
  }

  /* ---------- 语言切换 API ---------- */
  var _btn = null;
  function syncBtn() {
    if (_btn) _btn.textContent = I18N.lang === "zh-CN" ? "EN" : "中";
  }
  function setLang(lang) {
    if (I18N.SUPPORTED.indexOf(lang) === -1) return;
    I18N.lang = lang;
    try { localStorage.setItem(I18N.STORAGE_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang === "en-US" ? "en" : "zh-CN";
    applyLang();
    syncBtn();
    // 重渲染以刷新由 JS 生成的内容，再由 observer 翻译
    try {
      if (typeof renderAll === "function" && typeof st !== "undefined" && st) renderAll();
      else if (typeof renderAll === "function") renderAll();
    } catch (e) {}
  }
  function toggleLang() { setLang(I18N.lang === "zh-CN" ? "en-US" : "zh-CN"); }
  window.toggleLang = toggleLang;
  window.setLang = setLang;

  function addToggleButton() {
    var b = document.createElement("button");
    b.id = "i18nToggle";
    b.setAttribute("data-noi18n", "");   // 自身文案由 syncBtn 管理，不进翻译（否则「中」会被 WORDS 误伤）
    b.textContent = "EN";
    b.style.cssText = "position:fixed;top:8px;right:8px;z-index:99999;" +
      "padding:4px 10px;font-size:12px;border:1px solid rgba(255,255,255,.4);" +
      "border-radius:6px;background:rgba(0,0,0,.5);color:#fff;cursor:pointer;font-family:inherit;";
    b.onclick = function () { toggleLang(); };
    document.body.appendChild(b);
    _btn = b;
    syncBtn();
  }

  function initLang() {
    var saved = null;
    try { saved = localStorage.getItem(I18N.STORAGE_KEY); } catch (e) {}
    if (saved && I18N.SUPPORTED.indexOf(saved) !== -1) I18N.lang = saved;
    else {
      var nav = (navigator.language || "zh").toLowerCase();
      I18N.lang = nav.indexOf("zh") === 0 ? "zh-CN" : "en-US";
    }
    document.documentElement.lang = I18N.lang === "en-US" ? "en" : "zh-CN";
    I18N.enabled = true;
  }

  function boot() {
    if (I18N._booted) return;   // 幂等：DOMContentLoaded 与 setTimeout 兜底可能各触发一次
    I18N._booted = true;
    initLang();
    addToggleButton();
    startObserver();
    if (I18N.lang === "en-US") applyLang();
    // 安全网：异步/延迟渲染的内容在 load 与短延时后再翻一次
    window.addEventListener("load", function () { if (I18N.lang === "en-US") applyLang(); });
    setTimeout(function () { if (I18N.lang === "en-US") applyLang(); }, 600);
  }

  // 初始化：i18n 脚本位于 <body> 末尾，此时 document.body 已存在即可安全 boot。
  // 兜底：若处于 loading 且无 body（<head> 注入场景），等 DOMContentLoaded；setTimeout 再保一次。
  (function start() {
    if (I18N._booted) return;
    if (document.readyState === "loading" && !document.body) {
      document.addEventListener("DOMContentLoaded", boot);
      setTimeout(boot, 0);
    } else {
      boot();
    }
  })();

  window.applyI18nNow = applyLang;
})();
