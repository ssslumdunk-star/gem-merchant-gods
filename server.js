/* 宝石商人 · 诸神篇 —— 网络对战服务端
 * 架构：权威状态机在服务端（复用 logic.js 的纯函数 reducer），客户端只发 action、收 state。
 * 传输：SSE(推送) + POST(动作)，零第三方依赖，穿代理稳定。
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const L = require("./logic.js");

const PORT = process.env.PORT || 3000;
const HERE = __dirname;
const HTML_PATH = path.join(HERE, "index.html");

const ROOMS = new Map();

/* 客户端诊断上报环形缓冲（单人/联机都上报，便于盘中排查；仅持分享链接可见） */
const CLIENT_REPORTS = [];
const CLIENT_REPORTS_MAX = 200;
const MAX_ROOMS = 500;
const ROOM_TTL = 1000 * 60 * 60 * 24;  // 24 小时无活动回收（给好友留足加入窗口）
const AI_DELAY = 780;                  // AI 思考时长（ms）

/* ---------------- 工具 ---------------- */
const rid = (n = 6) => {
  const AB = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混的 I/O/0/1
  let s = "";
  const b = crypto.randomBytes(n);
  for (let i = 0; i < n; i++) s += AB[b[i] % AB.length];
  return s;
};
const pid = () => crypto.randomBytes(9).toString("hex");
const now = () => Date.now();

/* ---------------- 房间持久化（轻量落盘，重启不丢局） ---------------- */
const ROOM_STORE = path.join(HERE, ".rooms.store.json");
let saveTimer = null;

function serializeRoom(room) {
  // 等待中的房间也落盘：否则服务端一重启（部署即重启），已建的经典房直接消失，
  // 房主停在「等待加入」页、好友加入 404 —— 表现为「无神模式卡住了」
  return {
    id: room.id, mode: room.mode, status: room.status,
    winVp: room.winVp || L.WIN_VP,
    noGods: !!room.noGods,     // 经典模式标记必须持久化：丢失会让经典房退化成神战房（人齐也永远开不了局）
    oracleMode: !!room.oracleMode,
    oracleType: room.oracleType || null,
    seed: room.seed, v: room.v,
    createdAt: room.createdAt, touched: room.touched,
    // 连入客户端/AI 计时器不序列化；人类重连后 connected 重置
    humans: room.humans.map(h => ({ pid: h.pid, name: h.name, seat: h.seat, god: h.god, connected: false })),
    st: room.st || null
  };
}
function markDirty() {
  if (saveTimer) return;
  saveTimer = setTimeout(flushRooms, 1500);
}
function flushRooms() {
  saveTimer = null;
  try {
    const data = [];
    for (const room of ROOMS.values()) {
      const r = serializeRoom(room);
      if (r) data.push(r);
    }
    const tmp = ROOM_STORE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, ROOM_STORE);
  } catch (e) { console.error("[store] save failed:", e.message); }
}
function loadRooms() {
  try {
    if (!fs.existsSync(ROOM_STORE)) return;
    const data = JSON.parse(fs.readFileSync(ROOM_STORE, "utf8"));
    const t = now();
    let n = 0;
    for (const r of data) {
      if (!r || t - (r.touched || 0) > ROOM_TTL) continue;
      const room = {
        id: r.id, mode: r.mode, status: r.status, winVp: r.winVp || L.WIN_VP,
        // 经典模式标记：优先用落盘字段；旧存档缺失时从对局状态自愈
        noGods: !!r.noGods || !!(r.st && r.st.noGods),
        oracleMode: !!r.oracleMode || !!(r.st && r.st.oracleMode),
        oracleType: r.oracleType || (r.st && r.st.oracleType) || null,
        createdAt: r.createdAt, touched: r.touched,
        humans: (r.humans || []).map(h => ({ pid: h.pid, name: h.name, seat: h.seat, god: h.god, connected: false })),
        clients: new Set(), st: r.st || null, rng: L.makeRng(r.seed), seed: r.seed,
        v: r.v || 0, lastEvents: [], lastAction: null, lastActorSeat: -1, aiTimer: null
      };
      // 自愈：经典局对局里全员无神，补回丢失的标记（否则快照谎报神战房）
      if (!room.noGods && room.st && room.st.players && room.st.players.every(p => !p.god)) {
        room.noGods = true;
      }
      ROOMS.set(room.id, room);
      n++;
      // 恢复中的对局：若轮到 AI，自动续推；轮到人类则等其重连
      if (room.status === "playing" && room.st) scheduleAI(room);
    }
    if (n) console.log(`[gem-gods] 已从磁盘恢复 ${n} 个房间`);
  } catch (e) { console.error("[store] load failed:", e.message); }
}


function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", c => {
      n += c.length;
      if (n > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { reject(new Error("bad json")); }
    });
    req.on("error", reject);
  });
}

/* ---------------- 当前该谁行动 ---------------- */
function currentActor(st) {
  if (!st || st.phase === "over") return -1;
  if (st.phase === "hera") {
    const hi = L.godIdx(st, "hera");
    return hi >= 0 ? hi : st.turn;
  }
  if (st.phase === "distribute" && st.dist && st.dist.queue && st.dist.queue.length) {
    return st.dist.queue[0];
  }
  return st.turn;
}
function seatIsHuman(room, seat) {
  const p = room.st && room.st.players[seat];
  return !!(p && p.isHuman);
}

/* ---------------- 广播 ---------------- */
function snapshot(room) {
  return {
    roomId: room.id,
    v: room.v,
    status: room.status,       // waiting | playing | over
    mode: room.mode,           // 1v1 | 2p1ai
    noGods: !!room.noGods,     // 经典模式：禁用神
    winVp: room.winVp || L.WIN_VP,
    hostSeat: 0,
    seats: room.humans.map(h => ({
      seat: h.seat, name: h.name, god: h.god, connected: h.connected, pid: h.pid
    })),
    st: room.st,
    events: room.lastEvents || [],
    action: room.lastAction || null,
    actor: room.st ? currentActor(room.st) : -1
  };
}

function broadcast(room) {
  const payload = JSON.stringify(snapshot(room));
  for (const c of room.clients) {
    try { c.res.write("data: " + payload + "\n\n"); } catch (e) { /* 断开的连接稍后清理 */ }
  }
}

function bump(room) {
  room.v++;
  room.touched = now();
  broadcast(room);
  scheduleAI(room);
  markDirty();
}

/* ---------------- AI 驱动 ---------------- */
function scheduleAI(room) {
  if (room.aiTimer) return;
  const st = room.st;
  if (!st || st.phase === "over" || room.status !== "playing") return;
  const actor = currentActor(st);
  if (actor < 0 || seatIsHuman(room, actor)) return;
  // 上一步若接待了贵族，多等一会儿，让客户端把「金光→横幅→飞入」播完再推进
  const noblePause = (room.lastEvents || []).some(e => e.k === "noble");

  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    const s = room.st;
    if (!s || s.phase === "over" || room.status !== "playing") return;
    const act = currentActor(s);
    if (act < 0 || seatIsHuman(room, act)) return;
    let a = null;
    try { a = L.aiChoose(s, act, room.rng); } catch (e) { console.error("[ai] choose", room.id, e.message); }
    if (!a) {
      try {
        const acts = L.legalActions(s, act);
        a = acts && acts.length ? acts[0] : null;
      } catch (e) { /* ignore */ }
    }
    if (!a) { console.error("[ai] no action", room.id, s.phase); return; }
    try {
      const r = L.applyAction(s, a, room.rng);
      room.st = r.state;
      room.lastEvents = r.events;
      room.lastAction = a;
      room.lastActorSeat = act;
      if (room.st.phase === "over") room.status = "over";
      bump(room);
    } catch (e) {
      console.error("[ai] apply failed, try pass:", room.id, e.message, JSON.stringify(a));
      try {
        const r2 = L.applyAction(s, { type: "pass" }, room.rng);
        room.st = r2.state;
        room.lastEvents = r2.events;
        room.lastAction = { type: "pass" };
        room.lastActorSeat = act;
        if (room.st.phase === "over") room.status = "over";
        bump(room);
      } catch (e2) {
        console.error("[ai] pass also failed, ending:", room.id, e2.message);
        room.status = "over";
        room.lastEvents = [];
        broadcast(room);
      }
    }
  }, noblePause ? 2000 : AI_DELAY);
}

/* ---------------- 开局 ---------------- */
function tryStart(room) {
  if (room.status !== "waiting") return;
  const need = 2; // 两种模式都需要 2 名真人
  if (room.humans.length < need) return;
  // 神战模式等双方选神；经典模式（noGods）无需选神
  if (!room.noGods && room.humans.some(h => !h.god)) return;

  const h = room.humans;
  const seats = h.map((p, i) => ({
    name: p.name,
    role: i === 0 ? "房主" : "挑战者",
    img: i === 0 ? "char_player" : "char_ai1",
    human: true
  }));
  if (room.mode === "2p1ai") {
    seats.push({ name: "皮帕", role: "矿工鉴定师", img: "char_ai2", human: false });
  }
  let godAssign = h.map(p => p.god);
  if (room.mode === "2p1ai") godAssign.push(null);

  room.seed = (Math.random() * 0xffffffff) >>> 0;
  room.rng = L.makeRng(room.seed);
  try {
    room.st = L.newGame(room.seed, { seats, godAssign, playerCount: seats.length, winVp: room.winVp || L.WIN_VP, noGods: !!room.noGods, oracleMode: !!room.oracleMode, oracleType: room.oracleType || undefined });
  } catch (e) {
    console.error("[start]", room.id, e.message);
    room.status = "error";
    broadcast(room);
    return;
  }
  room.status = "playing";
  room.lastEvents = [];
  room.lastAction = null;
  bump(room);
}

/* ---------------- 房间 ---------------- */
function newRoom(mode) {
  let id;
  do { id = rid(6); } while (ROOMS.has(id));
  const room = {
    id, mode: mode === "1v1" ? "1v1" : "2p1ai",
    createdAt: now(), touched: now(),
    status: "waiting",
    humans: [],            // [{pid, name, seat, god, connected}]
    clients: new Set(),    // [{res, pid}]
    st: null, rng: null, seed: 0, v: 0,
    lastEvents: [], lastAction: null, lastActorSeat: -1,
    aiTimer: null
  };
  ROOMS.set(id, room);
  return room;
}
function findHuman(room, p) { return room.humans.find(h => h.pid === p); }

/* ---------------- HTTP ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const p = u.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    });
    return res.end();
  }

  /* --- 静态页面 --- */
  if (req.method === "GET" && (p === "/" || p === "/index.html")) {
    fs.readFile(HTML_PATH, (err, buf) => {
      if (err) { res.writeHead(500); return res.end("missing index.html"); }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, must-revalidate",
        "Content-Length": buf.length
      });
      res.end(buf);
    });
    return;
  }

  /* --- 引擎脚本（前后端共用同一份） --- */
  if (req.method === "GET" && p === "/logic.js") {
    fs.readFile(path.join(HERE, "logic.js"), (err, buf) => {
      if (err) { res.writeHead(404); return res.end("missing logic.js"); }
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, must-revalidate",
        "Content-Length": buf.length
      });
      res.end(buf);
    });
    return;
  }

  /* --- 根目录脚本（i18n 引擎与英文词典等，与 index.html 同级） --- */
  if (req.method === "GET" && /^\/[A-Za-z0-9_-]+\.js$/.test(p)) {
    const fp = path.join(HERE, p.slice(1));
    if (!fp.startsWith(HERE + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(fp, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("missing " + p.slice(1)); }
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, must-revalidate",
        "Content-Length": buf.length
      });
      res.end(buf);
    });
    return;
  }

  /* --- 静态资源（assets/：音频、图片等，本地测试需要完整资源才有音乐） --- */
  if (req.method === "GET" && p.startsWith("/assets/")) {
    const rel = path.normalize(p.replace(/^\/+/, "")).replace(/^(\.\.[/\\])+/, "");
    const fp = path.join(HERE, rel);
    if (!fp.startsWith(HERE)) { res.writeHead(403); return res.end(); }
    const MIME = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
      ".png": "image/png", ".jpg": "image/jpeg",
      ".webp": "image/webp", ".json": "application/json", ".css": "text/css" };
    return fs.readFile(fp, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("nf"); }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream",
        "Content-Length": buf.length, "Cache-Control": "public, max-age=3600"
      });
      res.end(buf);
    });
  }

  /* --- 健康检查 --- */
  if (p === "/api/ping") return json(res, 200, { ok: true, rooms: ROOMS.size, t: now() });

  /* --- 房间信息（加入前探明规则，判断是否经典房/是否已满/是否已开局） --- */
  if (p === "/api/roominfo" && req.method === "GET") {
    const room = ROOMS.get(String(u.searchParams.get("room") || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在或已过期" });
    return json(res, 200, {
      ok: true, roomId: room.id, mode: room.mode, noGods: !!room.noGods,
      oracleMode: !!room.oracleMode, oracleType: room.oracleType || null,
      winVp: room.winVp || L.WIN_VP, status: room.status,
      seats: room.humans.length, maxSeats: 2,
      takenGods: room.humans.map(h => h.god).filter(Boolean),
      bannedGods: (room.oracleMode && room.oracleType && L.oracleBannedGods) ? L.oracleBannedGods(room.oracleType) : []
    });
  }

  /* --- 创建房间 --- */
  if (p === "/api/create" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const name = String(b.name || "").trim().slice(0, 12) || "房主";
    const god = b.god && L.GOD_BY_ID[b.god] ? b.god : null;
    if (ROOMS.size >= MAX_ROOMS) return json(res, 503, { error: "房间已满，稍后再试" });
    const room = newRoom(b.mode);
    room.winVp = Math.max(L.WIN_VP_MIN, Math.min(L.WIN_VP_MAX, parseInt(b.winVp, 10) || L.WIN_VP));
    room.noGods = !!b.noGods;   // 经典模式：禁用神
    // 神谕模式：房主大厅已定目标 → 记录到房间，据此剔除冲突神（目标必须开局前固定，否则选神无从避开）
    room.oracleMode = !!b.oracleMode;
    room.oracleType = (room.oracleMode && L.ORACLE_KEYS && L.ORACLE_KEYS.indexOf(b.oracleType) >= 0)
      ? b.oracleType : null;
    // 神谕房：房主自己的神也不能与目标冲突（大厅已灰显，这里兜底）
    if (god && room.oracleMode && room.oracleType && L.oracleBannedGods && L.oracleBannedGods(room.oracleType).indexOf(god) >= 0) {
      return json(res, 409, { error: "这个神与本局神谕目标冲突，已被禁用" });
    }
    const me = { pid: pid(), name, seat: 0, god: room.noGods ? null : god, connected: true };
    room.humans.push(me);
    room.touched = now();
    markDirty();                 // 立即排队落盘：等待中的房间也要扛得住服务端重启
    return json(res, 200, { roomId: room.id, pid: me.pid, seat: 0, mode: room.mode });
  }

  /* --- 加入房间 --- */
  if (p === "/api/join" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const room = ROOMS.get(String(b.roomId || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在或已过期" });
    if (room.humans.length >= 2) return json(res, 409, { error: "房间已满" });
    if (room.status !== "waiting") return json(res, 409, { error: "对局已开始" });
    const name = String(b.name || "").trim().slice(0, 12) || "挑战者";
    const god = room.noGods ? null : (b.god && L.GOD_BY_ID[b.god] ? b.god : null);
    if (god && room.humans.some(h => h.god === god)) return json(res, 409, { error: "这个神已被对手选走" });
    // 神谕房：与本局目标冲突的神不可选（大厅会灰显，这里兜底防绕过）
    if (god && room.oracleMode && room.oracleType && L.oracleBannedGods && L.oracleBannedGods(room.oracleType).indexOf(god) >= 0) {
      return json(res, 409, { error: "这个神与本局神谕目标冲突，已被禁用" });
    }
    const me = { pid: pid(), name, seat: room.humans.length, god, connected: true };
    room.humans.push(me);
    room.touched = now();
    broadcast(room);
    tryStart(room);
    return json(res, 200, { roomId: room.id, pid: me.pid, seat: me.seat, mode: room.mode });
  }

  /* --- 选神 / 改名 --- */
  if (p === "/api/pick" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const room = ROOMS.get(String(b.roomId || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在" });
    const me = findHuman(room, b.pid);
    if (!me) return json(res, 403, { error: "你不在这个房间" });
    if (room.status !== "waiting") return json(res, 409, { error: "对局已开始，不能改神" });
    if (room.noGods) {
      // 经典模式：禁用神，忽略选神请求，仅允许改名
      if (b.name) me.name = String(b.name).trim().slice(0, 12) || me.name;
      room.touched = now();
      broadcast(room);
      return json(res, 200, { ok: true, noGods: true });
    }
    if (b.god) {
      if (!L.GOD_BY_ID[b.god]) return json(res, 400, { error: "没有这个神" });
      // 同房间不能重复选神
      if (room.humans.some(h => h !== me && h.god === b.god)) {
        return json(res, 409, { error: "这个神已被对手选走" });
      }
      // 神谕房：冲突神禁选（防绕过大厅灰显直接发请求）
      if (room.oracleMode && room.oracleType && L.oracleBannedGods && L.oracleBannedGods(room.oracleType).indexOf(b.god) >= 0) {
        return json(res, 409, { error: "这个神与本局神谕目标冲突，已被禁用" });
      }
      me.god = b.god;
    }
    if (b.name) me.name = String(b.name).trim().slice(0, 12) || me.name;
    room.touched = now();
    broadcast(room);
    tryStart(room);
    return json(res, 200, { ok: true });
  }

  /* --- 房主手动开始（对手机选神，本机代选） --- */
  if (p === "/api/start" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const room = ROOMS.get(String(b.roomId || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在" });
    const me = findHuman(room, b.pid);
    if (!me || me.seat !== 0) return json(res, 403, { error: "只有房主能开始" });
    if (room.status !== "waiting") return json(res, 409, { error: "已开始" });
    if (room.humans.length < 2) return json(res, 409, { error: "还等对手加入" });
    // 给没选神的补一个不重复的随机神（经典模式除外）
    if (!room.noGods) {
      const used = new Set(room.humans.map(h => h.god).filter(Boolean));
      const pool = L.GODS.map(g => g.id).filter(g => !used.has(g));
      for (const h of room.humans) {
        if (!h.god) h.god = pool.pop() || "zeus";
      }
    } else {
      for (const h of room.humans) h.god = null;
    }
    tryStart(room);
    return json(res, 200, { ok: true, started: room.status === "playing" });
  }

  /* --- 心跳保活 --- */
  if (p === "/api/alive" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const room = ROOMS.get(String(b.roomId || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在" });
    const me = findHuman(room, b.pid);
    if (me) { me.connected = true; me.lastSeen = now(); room.touched = now(); }
    return json(res, 200, { ok: true });
  }

  /* --- 一次性状态拉取（首屏/重连） --- */
  if (p === "/api/state" && req.method === "GET") {
    const room = ROOMS.get(String(u.searchParams.get("room") || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在或已过期" });
    const me = findHuman(room, u.searchParams.get("pid") || "");
    if (!me) return json(res, 403, { error: "你不在这个房间" });
    me.connected = true; me.lastSeen = now();
    return json(res, 200, snapshot(room));
  }

  /* --- 诊断接口（盘中排查用）：列出所有房间状态/日志；或 ?room=CODE 拉全量快照 ---
     仅对持有分享链接的人可见（反向代理已用 sharecode cookie 把关）。 */
  if (p === "/api/debug" && req.method === "GET") {
    const want = String(u.searchParams.get("room") || "").toUpperCase();
    if (want) {
      const room = ROOMS.get(want);
      if (!room) return json(res, 404, { error: "房间不存在或已过期" });
      return json(res, 200, { code: room.id, mode: room.mode, status: room.status, seed: room.seed, v: room.v, snapshot: snapshot(room) });
    }
    const rooms = [];
    for (const room of ROOMS.values()) {
      const st = room.st;
      const actor = st ? currentActor(st) : -1;
      let acts = [], stuck = false;
      try { acts = st ? L.legalActions(st, actor) : []; } catch (e) {}
      const humanHere = !!(st && st.players[actor] && st.players[actor].isHuman);
      if (humanHere && st.phase === "action" && acts.length && acts.every(a => a.type === "pass")) stuck = true;
      rooms.push({
        code: room.id, mode: room.mode, status: room.status, seed: room.seed, v: room.v,
        phase: st ? st.phase : null, turn: st ? st.turn : null, currentActor: actor, stuck,
        legalTypes: acts.map(a => a.type),
        players: st ? st.players.map(p => ({
          seat: p.idx, name: p.name, god: p.god, isHuman: p.isHuman,
          connected: (room.humans.find(h => h.seat === p.idx) || {}).connected,
          cards: p.cards.length, nobles: (p.nobles || []).length,
          tokens: L.totalTokens ? L.totalTokens(p) : null, reserved: (p.reserved || []).length
        })) : [],
        pool: st ? st.pool : null,
        discardNeed: st ? st.discardNeed : null,
        lastLog: st && st.log ? st.log.slice(-15) : [],
        lastHist: st && st.hist ? st.hist.slice(-8) : []
      });
    }
    return json(res, 200, { serverTime: now(), rooms, reports: CLIENT_REPORTS.slice(-30) });
  }

  /* --- 客户端诊断上报（单人/联机都会上报当前局面，便于盘中排查） --- */
  if (p === "/api/report" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const rep = Object.assign({ t: now() }, b && typeof b === "object" ? b : {});
    if (CLIENT_REPORTS.length >= CLIENT_REPORTS_MAX) CLIENT_REPORTS.shift();
    CLIENT_REPORTS.push(rep);
    return json(res, 200, { ok: true });
  }

  /* --- SSE 事件流 --- */
  if (p === "/api/events" && req.method === "GET") {
    const room = ROOMS.get(String(u.searchParams.get("room") || "").toUpperCase());
    if (!room) { res.writeHead(404); return res.end(); }
    const me = findHuman(room, u.searchParams.get("pid") || "");
    if (!me) { res.writeHead(403); return res.end(); }

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("retry: 2000\n\n");

    const client = { res, pid: me.pid };
    room.clients.add(client);
    me.connected = true; me.lastSeen = now(); room.touched = now();

    // 首帧立即推当前快照
    try { res.write("data: " + JSON.stringify(snapshot(room)) + "\n\n"); } catch (e) {}

    const hb = setInterval(() => {
      try { res.write(": ping\n\n"); } catch (e) { clearInterval(hb); }
    }, 20000);

    const cleanup = () => {
      clearInterval(hb);
      room.clients.delete(client);
      if (room.clients.size === 0) {
        me.connected = false;
        room.touched = now();
      }
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
    res.on("error", cleanup);
    return;
  }

  /* --- 提交动作 --- */
  if (p === "/api/action" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const room = ROOMS.get(String(b.roomId || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在或已过期" });
    const me = findHuman(room, b.pid);
    if (!me) return json(res, 403, { error: "你不在这个房间" });
    if (room.status !== "playing" || !room.st) return json(res, 409, { error: "对局未开始或已结束" });

    const actor = currentActor(room.st);
    if (actor !== me.seat) return json(res, 409, { error: "还没轮到你" });

    let r;
    try {
      r = L.applyAction(room.st, b.action, room.rng);
    } catch (e) {
      return json(res, 400, { error: e.message || "无效操作" });
    }
    room.st = r.state;
    room.lastEvents = r.events;
    room.lastAction = b.action;
    room.lastActorSeat = me.seat;
    if (room.st.phase === "over") room.status = "over";
    bump(room);
    return json(res, 200, { ok: true, v: room.v });
  }

  /* --- 离开 --- */
  if (p === "/api/leave" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const room = ROOMS.get(String(b.roomId || "").toUpperCase());
    if (room) {
      const me = findHuman(room, b.pid);
      if (me) me.connected = false;
      room.touched = now();
      broadcast(room);
      markDirty();
    }
    return json(res, 200, { ok: true });
  }

  /* --- 重开一局（同房间同模式，重新选神） --- */
  if (p === "/api/rematch" && req.method === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return json(res, 400, { error: "bad body" }); }
    const room = ROOMS.get(String(b.roomId || "").toUpperCase());
    if (!room) return json(res, 404, { error: "房间不存在" });
    const me = findHuman(room, b.pid);
    if (!me) return json(res, 403, { error: "你不在这个房间" });
    if (room.humans.length < 2) return json(res, 409, { error: "对手已离开" });
    room.status = "waiting";
    room.st = null; room.v = 0;
    room.lastEvents = []; room.lastAction = null;
    if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
    room.humans.forEach(h => { h.god = null; });
    room.touched = now();
    broadcast(room);
    return json(res, 200, { ok: true });
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

/* ---------------- 定期清理 ---------------- */
setInterval(() => {
  const t = now();
  for (const [id, room] of ROOMS) {
    const idle = t - room.touched;
    const noClients = room.clients.size === 0;
    if (idle > ROOM_TTL || (noClients && idle > 1000 * 60 * 30)) {
      if (room.aiTimer) clearTimeout(room.aiTimer);
      ROOMS.delete(id);
    }
  }
}, 60000).unref?.();

function shutdown() {
  console.log("[gem-gods] shutting down, flushing rooms...");
  try { flushRooms(); } catch (e) {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

loadRooms();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[gem-gods] listening on 0.0.0.0:${PORT}`);
});
