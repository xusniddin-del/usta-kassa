/**
 * USTA PLATFORMA v0.3 — server (Google Apps Script)
 * ==============================================================
 * Ikki botni (usta va mijoz) va ikki Mini App'ni bitta Google jadvalga ulaydi.
 *
 * O'RNATISH (README.md da batafsil):
 *  1) Yangi Google jadval → Kengaytmalar → Apps Script → shu kodni joylang.
 *  2) Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) → /exec havolani oling.
 *  3) ⚙️ Project Settings → Script Properties:
 *       USTA_BOT_TOKEN   — usta botining tokeni (BotFather)
 *       MIJOZ_BOT_TOKEN  — mijoz botining tokeni
 *       WEB_APP_URL      — 2-qadamdagi /exec havola
 *       USTA_APP_URL     — usta ilovasi (https://...github.io/usta-kassa/)
 *       MIJOZ_APP_URL    — mijoz ilovasi (https://...github.io/usta-kassa/mijoz.html)
 *  4) Yuqoridan "setup" funksiyasini tanlab ▶ Run bosing (ruxsat bering).
 * Kodni o'zgartirsangiz: Deploy → Manage deployments → ✏️ → New version.
 */

const TZ = "Asia/Tashkent";
const P = PropertiesService.getScriptProperties();
const prop = k => P.getProperty(k) || "";

/* ====================== JADVALLAR ====================== */
const TABLES = {
  Users:    ["id", "role", "phone", "name", "pass", "salt", "tgId", "shopId", "profile", "kassaFile", "created"],
  Shops:    ["id", "ownerId", "name", "address", "lat", "lng", "photo", "phone", "created"],
  Bookings: ["id", "masterId", "clientId", "clientName", "clientPhone", "service", "price", "duration", "date", "time", "status", "note", "created", "r1", "r2", "msgId"],
  Favs:     ["clientId", "masterId", "created"],
  Sessions: ["token", "userId", "created"],
  Contacts: ["tgId", "phone", "at"],
  Reklama:  ["phone", "until", "title", "created"]   // siz to'ldirasiz: usta raqami (998...), qaysi kungacha (YYYY-MM-DD), izoh
};
const _tcache = {};
function T(name) {
  if (_tcache[name]) return _tcache[name];
  const head = TABLES[name], ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat("@");   // hammasi matn bo'lib qolsin
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#F47B3C").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
  }
  const n = sh.getLastRow() - 1;
  const vals = n > 0 ? sh.getRange(2, 1, n, head.length).getValues() : [];
  const rows = vals.map((v, i) => { const o = { _r: i + 2 }; head.forEach((h, j) => o[h] = v[j] === "" ? "" : String(v[j])); return o; });
  const t = {
    rows,
    find: f => rows.find(f),
    filter: f => rows.filter(f),
    add(o) {
      const r = sh.getLastRow() + 1;
      sh.getRange(r, 1, 1, head.length).setNumberFormat("@").setValues([head.map(h => o[h] == null ? "" : String(o[h]))]);
      o._r = r; rows.push(o); return o;
    },
    save(o) { sh.getRange(o._r, 1, 1, head.length).setValues([head.map(h => o[h] == null ? "" : String(o[h]))]); return o; },
    remove(o) { sh.deleteRow(o._r); rows.splice(rows.indexOf(o), 1); rows.forEach(x => { if (x._r > o._r) x._r--; }); }
  };
  _tcache[name] = t;
  return t;
}

/* ====================== YORDAMCHILAR ====================== */
const fmtD = (d, f) => Utilities.formatDate(d, TZ, f);
const today = () => fmtD(new Date(), "yyyy-MM-dd");
const toMin = t => { const a = String(t || "0:0").split(":").map(Number); return a[0] * 60 + (a[1] || 0); };
const nowMin = () => toMin(fmtD(new Date(), "HH:mm"));
const toHM = m => ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2);
const addDays = (s, n) => { const a = s.split("-").map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2] + n)).toISOString().slice(0, 10); };
const dow = s => { const a = s.split("-").map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay(); };
const uid = () => Utilities.getUuid().replace(/-/g, "").slice(0, 12);
const hex = b => b.map(x => ("0" + (x & 255).toString(16)).slice(-2)).join("");
const parse = s => { try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; } };
const escH = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const money = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
const WD = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const MON = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const dLong = s => { const a = s.split("-").map(Number); return `${WD[dow(s)]}, ${a[2]}-${MON[a[1] - 1]}`; };
const kindOf = role => role === "mijoz" ? "mijoz" : "usta";
function normPhone(p) { let d = String(p || "").replace(/\D/g, ""); if (d.length === 9) d = "998" + d; return d; }
const showPhone = d => d && d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : (d ? "+" + d : "");
function hashPass(p, salt) {
  let h = salt + ":" + p;
  for (let i = 0; i < 300; i++) h = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8));
  return h;
}
function km(a, b, c, d) {
  const R = 6371, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/* Telegram Mini App initData imzosini tekshirish (soxta foydalanuvchi kira olmasin) */
function checkInit(initData) {
  if (!initData) return null;
  const params = {};
  String(initData).split("&").forEach(kv => { const i = kv.indexOf("="); if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, "%20")); });
  const hash = params.hash; if (!hash) return null; delete params.hash;
  const dcs = Object.keys(params).sort().map(k => k + "=" + params[k]).join("\n");
  for (const bot of ["usta", "mijoz"]) {
    const token = botToken(bot); if (!token) continue;
    const secret = Utilities.computeHmacSha256Signature(Utilities.newBlob(token).getBytes(), Utilities.newBlob("WebAppData").getBytes());
    if (hex(Utilities.computeHmacSha256Signature(Utilities.newBlob(dcs).getBytes(), secret)) === hash) {
      if (Number(params.auth_date) * 1000 < Date.now() - 7 * 864e5) return null;   // 7 kundan eski — yaroqsiz
      const user = parse(params.user);
      return { bot, tgId: String(user.id), user };
    }
  }
  return null;
}

/* ====================== TELEGRAM ====================== */
const botToken = bot => prop(bot === "usta" ? "USTA_BOT_TOKEN" : "MIJOZ_BOT_TOKEN");
function tgApi(bot, method, payload) {
  const token = botToken(bot); if (!token) return null;
  try {
    const r = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
    return JSON.parse(r.getContentText());
  } catch (e) { console.error(e); return null; }
}
function send(bot, chatId, text, extra) {
  if (!chatId) return null;
  return tgApi(bot, "sendMessage", Object.assign({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }, extra || {}));
}
const appButton = bot => {
  const url = prop(bot === "usta" ? "USTA_APP_URL" : "MIJOZ_APP_URL");
  return url ? { inline_keyboard: [[{ text: bot === "usta" ? "✂️ Kassani ochish" : "💈 Sartarosh topish", web_app: { url } }]] } : undefined;
};

/* ====================== KIRISH NUQTALARI ====================== */
function doGet() { return out({ ok: true, app: "Usta platforma", v: "0.3" }); }
function doPost(e) {
  const q = (e && e.parameter) || {};
  if (q.bot) {   // Telegram webhook
    if (q.s && q.s === prop("HOOK_SECRET")) {
      try { withLock(() => onUpdate(q.bot, JSON.parse(e.postData.contents))); } catch (err) { console.error(err); }
    }
    return HtmlService.createHtmlOutput("ok");   // 200 qaytaradi — Telegram qayta yubormaydi
  }
  let b = {}; try { b = JSON.parse((e.postData && e.postData.contents) || "{}"); } catch (err) {}
  return out(api(b));
}
const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
function withLock(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ====================== API ====================== */
const READ_ONLY = { search: 1, master: 1, slots: 1, contact_status: 1, me: 1, my_bookings: 1, favs: 1, usta_bookings: 1, kassa_pull: 1, kassa_ping: 1, shop_masters: 1 };
function api(b) {
  const a = String(b.action || "");
  try {
    const run = () => {
      if (PUBLIC[a]) return PUBLIC[a](b);
      const s = session(b.token);
      if (!s) return { ok: false, error: "auth", msg: "Qaytadan kiring" };
      const f = PRIVATE[a]; if (!f) return { ok: false, error: "Noma'lum amal" };
      if (USTA_ONLY[a] && kindOf(s.user.role) !== "usta") return { ok: false, error: "Faqat ustalar uchun" };
      return f(b, s.user, s);
    };
    return READ_ONLY[a] ? run() : withLock(run);
  } catch (err) { console.error(err); return { ok: false, error: String((err && err.message) || err) }; }
}
function session(token) {
  if (!token) return null;
  const s = T("Sessions").find(x => x.token === token); if (!s) return null;
  const user = T("Users").find(u => u.id === s.userId); if (!user) return null;
  return { row: s, user };
}
function newSession(u) {
  const token = uid() + uid() + uid();
  T("Sessions").add({ token, userId: u.id, created: new Date().toISOString() });
  return token;
}
/* ---------- Reklama va tavsiyalar ---------- */
function adFor(phone) {
  const r = T("Reklama").find(x => normPhone(x.phone) === phone && (!x.until || String(x.until).slice(0, 10) >= today()));
  return r ? { until: String(r.until || "").slice(0, 10) } : null;
}
function recommended(all, lat, lng) {
  const td = today(), from = addDays(td, -60), ads = {}, score = {};
  T("Reklama").rows.forEach(r => { if (!r.until || String(r.until).slice(0, 10) >= td) ads[normPhone(r.phone)] = 1; });
  T("Bookings").rows.forEach(b => { if ((b.status === "done" || b.status === "confirmed") && b.date >= from) score[b.masterId] = (score[b.masterId] || 0) + 1; });
  const seed = Math.floor(Date.now() / 36e5);   // har soatda reklama tartibi almashadi — hammaga navbat
  const rot = id => { let h = seed; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };
  const ad = all.filter(m => ads[m.phone]).sort((a, b) => rot(a.id) - rot(b.id)).map(m => Object.assign({}, m, { ad: true, tag: "ad" }));
  const used = {}; ad.forEach(m => used[m.id] = 1);
  const top = all.filter(m => !used[m.id] && score[m.id]).sort((a, b) => score[b.id] - score[a.id]).slice(0, 6).map(m => Object.assign({}, m, { tag: "top", visits: score[m.id] }));
  top.forEach(m => used[m.id] = 1);
  const fresh = all.filter(m => !used[m.id]).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, Math.max(0, 8 - ad.length - top.length)).map(m => Object.assign({}, m, { tag: "new" }));
  return ad.concat(top, fresh).slice(0, 12);
}
function pubUser(u) {
  const shop = u.shopId ? T("Shops").find(s => s.id === u.shopId) : null;
  return { id: u.id, role: u.role, phone: u.phone, name: u.name, tg: !!u.tgId, shopId: u.shopId || "", profile: parse(u.profile),
           shop: shop ? shopView(shop) : null, isOwner: !!(shop && shop.ownerId === u.id), ad: adFor(u.phone) };
}
const shopView = s => ({ id: s.id, name: s.name, address: s.address, lat: Number(s.lat) || null, lng: Number(s.lng) || null, photo: s.photo, phone: s.phone, ownerId: s.ownerId });
function masterView(u, lat, lng) {
  const p = parse(u.profile), sh = u.shopId ? T("Shops").find(s => s.id === u.shopId) : null;
  const mlat = Number((sh && sh.lat) || p.lat) || null, mlng = Number((sh && sh.lng) || p.lng) || null;
  const services = (p.services || []).filter(s => s && s.name);
  return {
    id: u.id, name: u.name, phone: u.phone, photo: p.photo || "", bio: p.bio || "",
    shopId: u.shopId || "", shopName: sh ? sh.name : "", shopPhoto: sh ? sh.photo : "",
    address: (sh && sh.address) || p.address || "", lat: mlat, lng: mlng,
    dist: lat != null && lng != null && mlat != null && mlng != null ? km(lat, lng, mlat, mlng) : null,
    services, priceFrom: services.length ? Math.min.apply(null, services.map(s => +s.price || 0)) : 0,
    workStart: p.workStart || "09:00", workEnd: p.workEnd || "20:00", daysOff: (p.daysOff || []).map(Number), step: +p.step || 30
  };
}
const isMaster = u => u && kindOf(u.role) === "usta";
const bookingView = (b, other) => ({ id: b.id, masterId: b.masterId, clientId: b.clientId, clientName: b.clientName, clientPhone: b.clientPhone,
  service: b.service, price: +b.price || 0, duration: +b.duration || 30, date: b.date, time: b.time, status: b.status, note: b.note, created: b.created,
  master: other ? { id: other.id, name: other.name, phone: other.phone } : undefined });

/* ---------- Bo'sh vaqtlar ---------- */
function freeSlots(u, date, dur, ignoreId) {
  const p = parse(u.profile); dur = +dur || 30;
  if (!/^\d{4}-\d\d-\d\d$/.test(date || "") || date < today() || date > addDays(today(), 30)) return [];
  if ((p.daysOff || []).map(Number).indexOf(dow(date)) >= 0) return [];
  const st = toMin(p.workStart || "09:00"), en = toMin(p.workEnd || "20:00"), step = +p.step || 30;
  const busy = T("Bookings").filter(b => b.masterId === u.id && b.date === date && (b.status === "pending" || b.status === "confirmed") && b.id !== ignoreId)
    .map(b => [toMin(b.time), toMin(b.time) + (+b.duration || 30)]);
  // Usta kassaga o'zi yozgan navbatlar ham band hisoblanadi
  const k = kassaRead(u);
  ((k.db && k.db.appts) || []).filter(a => a.date === date && !a.done && !a.online).forEach(a => busy.push([toMin(a.time), toMin(a.time) + 30]));
  const isT = date === today(), nm = nowMin(), res = [];
  for (let t = st; t + dur <= en; t += step) {
    if (isT && t <= nm + 15) continue;
    if (busy.some(x => t < x[1] && t + dur > x[0])) continue;
    res.push(toHM(t));
  }
  return res;
}

/* ---------- Bron holatini o'zgartirish + xabarlar ---------- */
function setStatus(bk, status, by) {
  const B = T("Bookings"), U = T("Users");
  bk.status = status; B.save(bk);
  const cl = U.find(u => u.id === bk.clientId), ms = U.find(u => u.id === bk.masterId);
  const when = `📅 ${dLong(bk.date)} · ⏰ <b>${bk.time}</b>\n✂️ ${escH(bk.service)} — ${money(bk.price)}`;
  if (cl && by !== "client") {
    const addr = ms ? masterView(ms).address : "";
    if (status === "confirmed") send("mijoz", cl.tgId, `✅ <b>Broningiz tasdiqlandi!</b>\n💈 ${escH(ms ? ms.name : "")}\n${when}${addr ? "\n📍 " + escH(addr) : ""}\n\nVaqtidan oldin eslatib qo'yamiz.`, { reply_markup: appButton("mijoz") });
    if (status === "rejected") send("mijoz", cl.tgId, `❌ <b>Afsus, usta bu vaqtni tasdiqlay olmadi.</b>\n💈 ${escH(ms ? ms.name : "")}\n${when}\n\nBoshqa vaqtni tanlab ko'ring.`, { reply_markup: appButton("mijoz") });
    if (status === "cancelled") send("mijoz", cl.tgId, `🚫 <b>Usta bronni bekor qildi.</b>\n${when}`, { reply_markup: appButton("mijoz") });
    if (status === "done") send("mijoz", cl.tgId, `🙏 Tashrifingiz uchun rahmat! ${escH(ms ? ms.name : "")} sizni yana kutadi.`, { reply_markup: appButton("mijoz") });
  }
  if (ms && by === "client" && status === "cancelled") send("usta", ms.tgId, `🚫 <b>Mijoz bronni bekor qildi</b>\n👤 ${escH(bk.clientName)}\n${when}`);
  if (ms && bk.msgId && by !== "bot") {
    const label = { confirmed: "✅ Tasdiqlandi", rejected: "❌ Rad etildi", cancelled: "🚫 Bekor qilindi", done: "✔️ Bajarildi", noshow: "⚠️ Kelmadi" }[status];
    if (label) tgApi("usta", "editMessageReplyMarkup", { chat_id: ms.tgId, message_id: +bk.msgId, reply_markup: { inline_keyboard: [[{ text: label, callback_data: "x" }]] } });
  }
}

/* ---------- Ochiq amallar ---------- */
const PUBLIC = {
  contact_status(b) {
    const v = checkInit(b.initData);
    if (!v) return { ok: false, error: "Ilovani Telegram ichida oching" };
    const c = T("Contacts").find(x => x.tgId === v.tgId);
    const kind = v.bot === "mijoz" ? "mijoz" : "usta";
    return { ok: true, phone: c ? c.phone : null, registered: !!(c && T("Users").find(u => u.phone === c.phone && kindOf(u.role) === kind)), bot: v.bot };
  },
  register(b) {
    const v = checkInit(b.initData);
    if (!v) return { ok: false, error: "Ro'yxatdan o'tish faqat Telegram ichida" };
    const c = T("Contacts").find(x => x.tgId === v.tgId);
    if (!c) return { ok: false, error: "Avval raqamingizni ulashing" };
    const role = v.bot === "mijoz" ? "mijoz" : (b.role === "owner" ? "owner" : "usta");
    const name = String(b.name || "").trim().slice(0, 60), pass = String(b.password || "");
    if (name.length < 2) return { ok: false, error: "Ismingizni kiriting" };
    if (pass.length < 6) return { ok: false, error: "Parol kamida 6 belgi bo'lsin" };
    const U = T("Users");
    if (U.find(u => u.phone === c.phone && kindOf(u.role) === kindOf(role))) return { ok: false, error: "Bu raqam ro'yxatdan o'tgan. Kirish bo'limidan kiring" };
    const salt = uid();
    const u = U.add({ id: uid(), role, phone: c.phone, name, pass: hashPass(pass, salt), salt, tgId: v.tgId, shopId: "", created: new Date().toISOString(),
      profile: kindOf(role) === "usta" ? JSON.stringify({ active: false, services: [], workStart: "09:00", workEnd: "20:00", daysOff: [0], step: 30 }) : "" });
    if (role === "owner") {
      const sh = T("Shops").add({ id: uid(), ownerId: u.id, name: String(b.shopName || "").trim().slice(0, 60) || name + " sartaroshxonasi", address: "", lat: "", lng: "", photo: "", phone: c.phone, created: new Date().toISOString() });
      u.shopId = sh.id; U.save(u);
    }
    send(v.bot, v.tgId, role === "mijoz"
      ? `🎉 Xush kelibsiz, ${escH(name)}!\nEndi yaqin sartaroshlarni topib, navbatsiz yozilishingiz mumkin. Eslatmalar shu botga keladi.`
      : `🎉 Xush kelibsiz, ${escH(name)}!\nYangi bronlar haqidagi xabarlar shu botga keladi. Mijozlar sizni topishi uchun ilovada <b>Profil</b>ni to'ldiring.`, { reply_markup: appButton(v.bot) });
    return { ok: true, token: newSession(u), user: pubUser(u) };
  },
  login(b) {
    const phone = normPhone(b.phone), kind = b.app === "mijoz" ? "mijoz" : "usta";
    const cache = CacheService.getScriptCache(), ck = "lf" + kind + phone, fails = +(cache.get(ck) || 0);
    if (fails >= 5) return { ok: false, error: "Ko'p urinish. 10 daqiqadan so'ng qayta urining" };
    const U = T("Users"), u = U.find(x => x.phone === phone && kindOf(x.role) === kind);
    if (!u || hashPass(String(b.password || ""), u.salt) !== u.pass) { cache.put(ck, String(fails + 1), 600); return { ok: false, error: "Telefon raqam yoki parol noto'g'ri" }; }
    cache.remove(ck);
    const v = checkInit(b.initData);
    if (v && v.tgId && v.tgId !== u.tgId) { u.tgId = v.tgId; U.save(u); }   // yangi Telegram akkaunt — xabarlar shunga boradi
    return { ok: true, token: newSession(u), user: pubUser(u) };
  },
  search(b) {
    const lat = b.lat != null && b.lat !== "" ? +b.lat : null, lng = b.lng != null && b.lng !== "" ? +b.lng : null;
    const q = String(b.q || "").trim().toLowerCase();
    let list = T("Users").filter(u => isMaster(u) && parse(u.profile).active).map(u => masterView(u, lat, lng)).filter(m => m.services.length);
    if (q) list = list.filter(m => (m.name + " " + m.shopName + " " + m.address + " " + m.services.map(s => s.name).join(" ")).toLowerCase().indexOf(q) >= 0);
    if (b.ids) { const ids = [].concat(b.ids); list = list.filter(m => ids.indexOf(m.id) >= 0); }
    list.sort((x, y) => (x.dist == null ? 1e9 : x.dist) - (y.dist == null ? 1e9 : y.dist) || x.name.localeCompare(y.name));
    const ads = {}; T("Reklama").rows.forEach(r => { if (!r.until || String(r.until).slice(0, 10) >= today()) ads[normPhone(r.phone)] = 1; });
    list.forEach(m => { if (ads[m.phone]) m.ad = true; });
    const all = T("Users").filter(u => isMaster(u) && parse(u.profile).active).map(u => Object.assign(masterView(u, lat, lng), { created: u.created })).filter(m => m.services.length);
    const rec = b.ids || q ? [] : recommended(all, lat, lng);
    list.forEach(m => delete m.created); rec.forEach(m => delete m.created);
    return { ok: true, list: list.slice(0, 60), rec };
  },
  master(b) {
    const u = T("Users").find(x => x.id === b.id && isMaster(x));
    if (!u) return { ok: false, error: "Usta topilmadi" };
    return { ok: true, master: masterView(u, b.lat != null ? +b.lat : null, b.lng != null ? +b.lng : null) };
  },
  slots(b) {
    const u = T("Users").find(x => x.id === b.masterId && isMaster(x));
    if (!u) return { ok: false, error: "Usta topilmadi" };
    return { ok: true, date: b.date, slots: freeSlots(u, b.date, b.duration) };
  }
};

/* ---------- Kirgan foydalanuvchi amallari ---------- */
const USTA_ONLY = { profile_save: 1, usta_bookings: 1, set_booking: 1, kassa_push: 1, kassa_pull: 1, kassa_ping: 1, usta_notify: 1, shop_save: 1, shop_masters: 1, shop_add_master: 1, shop_remove_master: 1 };
const PRIVATE = {
  me: (b, u) => ({ ok: true, user: pubUser(u) }),
  logout(b, u, s) { T("Sessions").remove(s.row); return { ok: true }; },
  set_password(b, u) {
    if (hashPass(String(b.old || ""), u.salt) !== u.pass) return { ok: false, error: "Eski parol noto'g'ri" };
    if (String(b.password || "").length < 6) return { ok: false, error: "Parol kamida 6 belgi bo'lsin" };
    u.salt = uid(); u.pass = hashPass(String(b.password), u.salt); T("Users").save(u); return { ok: true };
  },
  set_name(b, u) { const n = String(b.name || "").trim().slice(0, 60); if (n.length < 2) return { ok: false, error: "Ism juda qisqa" }; u.name = n; T("Users").save(u); return { ok: true, user: pubUser(u) }; },

  /* ---- Mijoz ---- */
  book(b, u) {
    const U = T("Users"), m = U.find(x => x.id === b.masterId && isMaster(x));
    if (!m || !parse(m.profile).active) return { ok: false, error: "Usta hozir bron qabul qilmaydi" };
    if (m.id === u.id) return { ok: false, error: "O'zingizga yozila olmaysiz" };
    const svc = (parse(m.profile).services || []).find(s => s.name === b.service);
    if (!svc) return { ok: false, error: "Xizmat topilmadi" };
    const dur = +svc.duration || 30;
    if (freeSlots(m, b.date, dur).indexOf(b.time) < 0) return { ok: false, error: "Bu vaqt band bo'lib qoldi. Boshqa vaqtni tanlang", slots: freeSlots(m, b.date, dur) };
    const B = T("Bookings");
    if (B.filter(x => x.clientId === u.id && x.status === "pending").length >= 3) return { ok: false, error: "Sizda 3 ta tasdiqlanmagan bron bor. Javobni kuting" };
    const bk = B.add({ id: uid(), masterId: m.id, clientId: u.id, clientName: u.name, clientPhone: u.phone, service: svc.name, price: +svc.price || 0, duration: dur,
      date: b.date, time: b.time, status: "pending", note: String(b.note || "").slice(0, 200), created: new Date().toISOString(), r1: "", r2: "", msgId: "" });
    const r = send("usta", m.tgId, `🆕 <b>Yangi bron</b>\n👤 ${escH(u.name)} · ${showPhone(u.phone)}\n✂️ ${escH(svc.name)} — ${money(svc.price)}\n📅 ${dLong(bk.date)} · ⏰ <b>${bk.time}</b>${bk.note ? "\n💬 " + escH(bk.note) : ""}`,
      { reply_markup: { inline_keyboard: [[{ text: "✅ Tasdiqlash", callback_data: "ok:" + bk.id }, { text: "❌ Rad etish", callback_data: "no:" + bk.id }]] } });
    if (r && r.ok) { bk.msgId = String(r.result.message_id); B.save(bk); }
    return { ok: true, booking: bookingView(bk, m) };
  },
  my_bookings(b, u) {
    const U = T("Users");
    const list = T("Bookings").filter(x => x.clientId === u.id).map(x => bookingView(x, U.find(m => m.id === x.masterId)))
      .sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)).slice(0, 80);
    return { ok: true, list };
  },
  cancel_booking(b, u) {
    const bk = T("Bookings").find(x => x.id === b.id && x.clientId === u.id);
    if (!bk || (bk.status !== "pending" && bk.status !== "confirmed")) return { ok: false, error: "Bekor qilib bo'lmaydi" };
    setStatus(bk, "cancelled", "client"); return { ok: true };
  },
  fav(b, u) {
    const F = T("Favs"), f = F.find(x => x.clientId === u.id && x.masterId === b.masterId);
    if (b.on && !f) F.add({ clientId: u.id, masterId: b.masterId, created: new Date().toISOString() });
    if (!b.on && f) F.remove(f);
    return { ok: true, on: !!b.on };
  },
  favs(b, u) {
    const ids = T("Favs").filter(x => x.clientId === u.id).map(x => x.masterId);
    const U = T("Users");
    return { ok: true, ids, list: ids.map(id => U.find(x => x.id === id && isMaster(x))).filter(Boolean).map(m => masterView(m, b.lat != null ? +b.lat : null, b.lng != null ? +b.lng : null)) };
  },

  /* ---- Usta ---- */
  profile_save(b, u) {
    const p = parse(u.profile), n = b.profile || {};
    if (n.photo != null) { if (String(n.photo).length > 45000) return { ok: false, error: "Rasm juda katta" }; p.photo = String(n.photo); }
    ["bio", "address"].forEach(k => { if (n[k] != null) p[k] = String(n[k]).slice(0, 300); });
    ["workStart", "workEnd"].forEach(k => { if (/^\d\d:\d\d$/.test(n[k] || "")) p[k] = n[k]; });
    if (n.lat != null) p.lat = n.lat === "" ? "" : +n.lat;
    if (n.lng != null) p.lng = n.lng === "" ? "" : +n.lng;
    if (Array.isArray(n.daysOff)) p.daysOff = n.daysOff.map(Number).filter(x => x >= 0 && x <= 6);
    if (n.step) p.step = [15, 20, 30, 60].indexOf(+n.step) >= 0 ? +n.step : 30;
    if (Array.isArray(n.services)) p.services = n.services.slice(0, 30).map(s => ({ name: String(s.name || "").trim().slice(0, 60), price: Math.max(0, Math.round(+s.price || 0)), duration: Math.min(480, Math.max(5, Math.round(+s.duration || 30))) })).filter(s => s.name);
    if (n.active != null) p.active = !!n.active;
    if (toMin(p.workStart || "09:00") >= toMin(p.workEnd || "20:00")) return { ok: false, error: "Ish vaqti noto'g'ri" };
    u.profile = JSON.stringify(p);
    if (u.profile.length > 49000) return { ok: false, error: "Profil juda katta" };
    if (n.name) { const nm = String(n.name).trim().slice(0, 60); if (nm.length >= 2) u.name = nm; }
    T("Users").save(u);
    return { ok: true, user: pubUser(u) };
  },
  usta_bookings(b, u) {
    const from = addDays(today(), -14);
    const list = T("Bookings").filter(x => x.masterId === u.id && x.date >= from).map(x => bookingView(x))
      .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
    return { ok: true, list, pending: list.filter(x => x.status === "pending").length };
  },
  set_booking(b, u) {
    const bk = T("Bookings").find(x => x.id === b.id && x.masterId === u.id);
    if (!bk) return { ok: false, error: "Bron topilmadi" };
    if (["confirmed", "rejected", "cancelled", "done", "noshow"].indexOf(b.status) < 0) return { ok: false, error: "Noto'g'ri holat" };
    if (bk.status === b.status) return { ok: true };
    setStatus(bk, b.status, "usta"); return { ok: true, booking: bookingView(bk) };
  },
  usta_notify(b, u) {
    const phone = normPhone(b.phone), U = T("Users");
    const cl = U.find(x => x.phone === phone && x.role === "mijoz");
    if (!cl || !cl.tgId) return { ok: false, error: "Mijoz botda ro'yxatdan o'tmagan" };
    const known = T("Bookings").find(x => x.masterId === u.id && x.clientId === cl.id) || T("Favs").find(x => x.masterId === u.id && x.clientId === cl.id);
    if (!known) return { ok: false, error: "Bu mijoz sizga hali yozilmagan" };
    const r = send("mijoz", cl.tgId, `💈 <b>${escH(u.name)}</b>:\n${escH(String(b.text || "").slice(0, 1000))}`, { reply_markup: appButton("mijoz") });
    return r && r.ok ? { ok: true } : { ok: false, error: "Yuborib bo'lmadi (mijoz botni to'xtatgan bo'lishi mumkin)" };
  },
  kassa_ping: (b, u) => ({ ok: true, name: "Usta platforma" }),
  kassa_pull(b, u) { const k = kassaRead(u); return { ok: true, db: k.db || null, updatedAt: k.updatedAt || 0 }; },
  kassa_push(b, u) {
    if (!b.db) return { ok: false, error: "Ma'lumot yo'q" };
    const cur = kassaRead(u);
    if (cur.updatedAt && b.updatedAt < cur.updatedAt && !b.force) return { ok: false, error: "stale", updatedAt: cur.updatedAt };
    kassaWrite(u, b.db, b.updatedAt); return { ok: true, updatedAt: b.updatedAt };
  },

  /* ---- Sartaroshxona egasi ---- */
  shop_save(b, u) {
    const S = T("Shops"), sh = S.find(s => s.id === u.shopId && s.ownerId === u.id);
    if (!sh) return { ok: false, error: "Siz sartaroshxona egasi emassiz" };
    const n = b.shop || {};
    if (n.name != null && String(n.name).trim().length >= 2) sh.name = String(n.name).trim().slice(0, 60);
    if (n.address != null) sh.address = String(n.address).slice(0, 200);
    if (n.phone != null) sh.phone = normPhone(n.phone);
    if (n.lat != null) sh.lat = n.lat === "" ? "" : String(+n.lat);
    if (n.lng != null) sh.lng = n.lng === "" ? "" : String(+n.lng);
    if (n.photo != null) { if (String(n.photo).length > 45000) return { ok: false, error: "Rasm juda katta" }; sh.photo = String(n.photo); }
    S.save(sh); return { ok: true, user: pubUser(u) };
  },
  shop_masters(b, u) {
    if (!u.shopId) return { ok: true, list: [] };
    return { ok: true, list: T("Users").filter(x => x.shopId === u.shopId && isMaster(x)).map(x => ({ id: x.id, name: x.name, phone: x.phone, active: !!parse(x.profile).active, owner: x.id === u.id })) };
  },
  shop_add_master(b, u) {
    const sh = T("Shops").find(s => s.id === u.shopId && s.ownerId === u.id);
    if (!sh) return { ok: false, error: "Siz sartaroshxona egasi emassiz" };
    const U = T("Users"), m = U.find(x => x.phone === normPhone(b.phone) && isMaster(x));
    if (!m) return { ok: false, error: "Bu raqamda usta topilmadi. U avval usta botida ro'yxatdan o'tsin" };
    if (m.shopId && m.shopId !== sh.id) return { ok: false, error: "Bu usta boshqa sartaroshxonada" };
    m.shopId = sh.id; U.save(m);
    send("usta", m.tgId, `🏠 Siz <b>${escH(sh.name)}</b> sartaroshxonasiga qo'shildingiz. Manzil va joylashuv sartaroshxonaniki bo'ladi.`);
    return PRIVATE.shop_masters(b, u);
  },
  shop_remove_master(b, u) {
    const sh = T("Shops").find(s => s.id === u.shopId && s.ownerId === u.id);
    if (!sh) return { ok: false, error: "Siz sartaroshxona egasi emassiz" };
    if (b.id === u.id) return { ok: false, error: "O'zingizni chiqara olmaysiz" };
    const U = T("Users"), m = U.find(x => x.id === b.id && x.shopId === sh.id);
    if (m) { m.shopId = ""; U.save(m); send("usta", m.tgId, `ℹ️ Siz ${escH(sh.name)} sartaroshxonasidan chiqarildingiz.`); }
    return PRIVATE.shop_masters(b, u);
  }
};

/* ====================== KASSA (har bir usta uchun Drive'dagi fayl) ====================== */
function kassaFolder() {
  const id = prop("KASSA_FOLDER");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder("UstaPlatforma_kassa"); P.setProperty("KASSA_FOLDER", f.getId()); return f;
}
function kassaRead(u) {
  if (!u.kassaFile) return { db: null, updatedAt: 0 };
  try { return JSON.parse(DriveApp.getFileById(u.kassaFile).getBlob().getDataAsString()); } catch (e) { return { db: null, updatedAt: 0 }; }
}
function kassaWrite(u, db, at) {
  const s = JSON.stringify({ db, updatedAt: at || Date.now() });
  if (u.kassaFile) { try { DriveApp.getFileById(u.kassaFile).setContent(s); return; } catch (e) {} }
  u.kassaFile = kassaFolder().createFile("kassa_" + u.id + ".json", s, "application/json").getId();
  T("Users").save(u);
}

/* ====================== BOT XABARLARI ====================== */
function onUpdate(bot, upd) {
  const cache = CacheService.getScriptCache(), key = "u" + bot + upd.update_id;
  if (cache.get(key)) return; cache.put(key, "1", 21600);
  if (upd.callback_query) return onCallback(bot, upd.callback_query);
  const m = upd.message; if (!m || !m.chat || m.chat.type !== "private") return;
  const chat = m.chat.id, tgId = String(m.from.id);
  if (m.contact) {
    if (String(m.contact.user_id) !== tgId) return send(bot, chat, "Iltimos, <b>o'zingizning</b> raqamingizni ulashing 👇");
    const phone = normPhone(m.contact.phone_number), C = T("Contacts"), c = C.find(x => x.tgId === tgId);
    if (c) { c.phone = phone; c.at = new Date().toISOString(); C.save(c); } else C.add({ tgId, phone, at: new Date().toISOString() });
    send(bot, chat, `✅ Raqamingiz qabul qilindi: <b>${showPhone(phone)}</b>`, { reply_markup: { remove_keyboard: true } });
    return send(bot, chat, "Endi ilovaga qaytib, ro'yxatdan o'tishni yakunlang 👇", { reply_markup: appButton(bot) });
  }
  const t = String(m.text || "");
  if (bot === "mijoz" && /^\/bronlarim/.test(t)) {
    const U = T("Users"), u = U.find(x => x.tgId === tgId && x.role === "mijoz");
    const list = u ? T("Bookings").filter(b => b.clientId === u.id && b.date >= today() && (b.status === "pending" || b.status === "confirmed")).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) : [];
    if (!list.length) return send(bot, chat, "Sizda kelgusi bronlar yo'q.", { reply_markup: appButton(bot) });
    return send(bot, chat, "<b>Kelgusi bronlaringiz:</b>\n\n" + list.map(b => { const ms = U.find(x => x.id === b.masterId);
      return `${b.status === "confirmed" ? "✅" : "⏳"} ${dLong(b.date)}, ${b.time}\n💈 ${escH(ms ? ms.name : "")} · ✂️ ${escH(b.service)}`; }).join("\n\n"), { reply_markup: appButton(bot) });
  }
  // /start va boshqa har qanday xabar
  send(bot, chat, bot === "usta"
    ? "✂️ <b>Usta Kassa</b>\nKassa, mijozlar, qarzdorlar, hisobot va onlayn bronlar — bitta ilovada."
    : "💈 <b>Sartarosh topish</b>\nYaqin atrofdagi sartaroshlarni toping, sevimlilarga qo'shing va navbatsiz yoziling. Eslatmalar shu botga keladi.\n\n/bronlarim — kelgusi bronlar", { reply_markup: appButton(bot) });
  if (!T("Contacts").find(x => x.tgId === tgId)) {
    send(bot, chat, "Ro'yxatdan o'tish uchun telefon raqamingizni ulashing 👇", { reply_markup: { keyboard: [[{ text: "📱 Raqamni ulashish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
  }
}
function onCallback(bot, cq) {
  const ans = text => tgApi(bot, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: false });
  const mt = /^(ok|no):(\w+)$/.exec(cq.data || "");
  if (bot !== "usta" || !mt) return ans("");
  const bk = T("Bookings").find(x => x.id === mt[2]); if (!bk) return ans("Bron topilmadi");
  const ms = T("Users").find(x => x.id === bk.masterId);
  if (!ms || String(ms.tgId) !== String(cq.from.id)) return ans("Bu bron sizga tegishli emas");
  if (bk.status !== "pending") return ans("Bu bron allaqachon ko'rib chiqilgan");
  setStatus(bk, mt[1] === "ok" ? "confirmed" : "rejected", "bot");
  const label = mt[1] === "ok" ? "✅ Tasdiqlandi — mijozga xabar yuborildi" : "❌ Rad etildi — mijozga xabar yuborildi";
  tgApi("usta", "editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: (cq.message.text || "") + "\n\n" + label });
  return ans(mt[1] === "ok" ? "Tasdiqlandi" : "Rad etildi");
}

/* ====================== ESLATMALAR (har 15 daqiqada) ====================== */
function remindTick() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return;
  try {
    const B = T("Bookings"), U = T("Users"), td = today(), tm = addDays(td, 1), nm = nowMin(), hour = Math.floor(nm / 60);
    B.rows.slice().forEach(b => {
      if (b.status === "pending" && (b.date < td || (b.date === td && toMin(b.time) <= nm))) { b.status = "expired"; B.save(b); return; }
      if (b.status !== "confirmed") return;
      const cl = U.find(x => x.id === b.clientId), ms = U.find(x => x.id === b.masterId); if (!cl || !ms) return;
      const addr = masterView(ms).address;
      if (!b.r1 && b.date === tm && hour >= 18) {
        send("mijoz", cl.tgId, `🔔 <b>Eslatma:</b> ertaga soat <b>${b.time}</b> da ${escH(ms.name)} sizni kutadi.\n✂️ ${escH(b.service)}${addr ? "\n📍 " + escH(addr) : ""}`, { reply_markup: appButton("mijoz") });
        b.r1 = "1"; B.save(b);
      }
      if (!b.r2 && b.date === td) {
        const left = toMin(b.time) - nm;
        if (left > 0 && left <= 120) {
          send("mijoz", cl.tgId, `⏰ <b>${left <= 60 ? "1 soatdan" : "2 soatdan"} kam vaqt qoldi!</b> Soat ${b.time} da ${escH(ms.name)} sizni kutadi.${addr ? "\n📍 " + escH(addr) : ""}`);
          send("usta", ms.tgId, `⏰ Soat <b>${b.time}</b> da: ${escH(b.clientName)} · ${escH(b.service)}`);
          b.r2 = "1"; B.save(b);
        }
      }
    });
  } finally { lock.releaseLock(); }
}

/* ====================== BIR MARTALIK SOZLASH ====================== */
function setup() {
  const url = prop("WEB_APP_URL");
  if (!/\/exec$/.test(url)) throw new Error("Script Properties'ga WEB_APP_URL (…/exec) qo'shing");
  if (!botToken("usta") || !botToken("mijoz")) throw new Error("USTA_BOT_TOKEN va MIJOZ_BOT_TOKEN ni qo'shing");
  if (!prop("HOOK_SECRET")) P.setProperty("HOOK_SECRET", uid() + uid());
  Object.keys(TABLES).forEach(n => T(n));
  const res = {};
  ["usta", "mijoz"].forEach(bot => {
    const w = tgApi(bot, "setWebhook", { url: url + "?bot=" + bot + "&s=" + prop("HOOK_SECRET"), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    res[bot + " webhook"] = w && w.ok ? "✅" : "❌ " + JSON.stringify(w);
    const app = prop(bot === "usta" ? "USTA_APP_URL" : "MIJOZ_APP_URL");
    if (app) {
      const mb = tgApi(bot, "setChatMenuButton", { menu_button: { type: "web_app", text: bot === "usta" ? "Kassa" : "Sartarosh topish", web_app: { url: app } } });
      res[bot + " menyu tugmasi"] = mb && mb.ok ? "✅" : "❌ " + JSON.stringify(mb);
    }
    tgApi(bot, "setMyCommands", { commands: bot === "usta" ? [{ command: "start", description: "Ilovani ochish" }] : [{ command: "start", description: "Sartarosh topish" }, { command: "bronlarim", description: "Kelgusi bronlarim" }] });
  });
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "remindTick") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("remindTick").timeBased().everyMinutes(15).create();
  res["eslatmalar (har 15 daq)"] = "✅";
  kassaFolder();
  console.log(JSON.stringify(res, null, 2));
  return res;
}
