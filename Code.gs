/**
 * USTA KASSA — Google Sheets ombori
 * --------------------------------------------------------------
 * 1) Google Sheets'da jadval oching → Kengaytmalar → Apps Script → shu kodni joylang.
 * 2) ⚙️ Project Settings → Script Properties → Add script property:
 *       Property: KALIT        Value: o'zingiz o'ylab topgan maxfiy so'z
 *    → Save script properties
 * 3) Deploy → New deployment → Web app
 *       Execute as: Me      Who has access: Anyone
 * 4) /exec havolasini va KALIT qiymatini ilovaning Sozlamalariga kiriting.
 */
const KALIT = PropertiesService.getScriptProperties().getProperty("KALIT") || "";

const DB_SHEET = "_db";
const CHUNK = 45000;                    // bitta katakka sig'adigan qism

function doGet(e)  { return handle_(e.parameter || {}); }
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || "{}"); } catch (err) {}
  return handle_(Object.assign({}, e.parameter || {}, body));
}

function handle_(p) {
  if (!KALIT) return out_({ ok: false, error: "Apps Script'da KALIT o'rnatilmagan" });
  if (p.key !== KALIT) return out_({ ok: false, error: "Kalit noto'g'ri" });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    if (p.action === "ping") return out_({ ok: true, name: SpreadsheetApp.getActive().getName() });
    if (p.action === "pull") return out_(Object.assign({ ok: true }, readDb_()));
    if (p.action === "push") {
      if (!p.db) return out_({ ok: false, error: "Ma'lumot yo'q" });
      const cur = readDb_();
      // Eski nusxa yangisining ustiga yozilmasin
      if (cur.updatedAt && p.updatedAt < cur.updatedAt && !p.force) return out_({ ok: false, error: "stale", updatedAt: cur.updatedAt });
      writeDb_(p.db, p.updatedAt);
      writeSheets_(p.db);
      return out_({ ok: true, updatedAt: p.updatedAt });
    }
    return out_({ ok: false, error: "Noma'lum amal" });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- To'liq nusxa (_db varag'i) ---------- */
function readDb_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DB_SHEET);
  if (!sh || sh.getLastRow() < 1) return { db: null, updatedAt: 0 };
  const updatedAt = Number(sh.getRange(1, 2).getValue()) || 0;
  const vals = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => r[0]).join("");
  let db = null; try { db = vals ? JSON.parse(vals) : null; } catch (e) {}
  return { db, updatedAt };
}
function writeDb_(db, updatedAt) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(DB_SHEET);
  if (!sh) { sh = ss.insertSheet(DB_SHEET); sh.hideSheet(); }
  const json = JSON.stringify(db), parts = [];
  for (let i = 0; i < json.length; i += CHUNK) parts.push([json.slice(i, i + CHUNK)]);
  sh.clear();
  if (parts.length) sh.getRange(1, 1, parts.length, 1).setValues(parts);
  sh.getRange(1, 2).setValue(updatedAt || Date.now());
  sh.getRange(2, 2).setValue(new Date());
}

/* ---------- O'qish uchun qulay varaqlar ---------- */
function writeSheets_(db) {
  const clients = {}; (db.clients || []).forEach(c => clients[c.id] = c);
  const name = id => (clients[id] && clients[id].name) || "Mijoz";
  const txt = v => v ? "'" + v : "";   // telefon raqam sonlarga aylanib ketmasin
  const phone = id => txt(clients[id] && clients[id].phone);
  const byDate = (a, b) => ((a.date || "") + (a.time || "")).localeCompare((b.date || "") + (b.time || ""));
  const visits = (db.visits || []).slice().sort(byDate);
  const pays = (db.payments || []).slice().sort(byDate);
  const exps = (db.expenses || []).slice().sort(byDate);
  const appts = (db.appts || []).slice().sort(byDate);

  // Mijoz statistikasi
  const st = {};
  visits.forEach(v => { if (!v.clientId) return; const s = st[v.clientId] = st[v.clientId] || { n: 0, sum: 0, debt: 0, last: "" }; s.n++; s.sum += v.total; s.debt += v.debt; if (v.date > s.last) s.last = v.date; });
  pays.forEach(p => { const s = st[p.clientId] = st[p.clientId] || { n: 0, sum: 0, debt: 0, last: "" }; s.debt -= p.amount; });

  put_("Tashriflar", ["Sana", "Vaqt", "Mijoz", "Telefon", "Xizmatlar", "Summa", "Chegirma", "Jami", "Naqd", "Karta", "Nasiya", "Izoh"],
    visits.map(v => [v.date, v.time, v.clientId ? name(v.clientId) : "Mijoz", phone(v.clientId), (v.items || []).map(i => i.name).join(", "), v.subtotal, v.discount, v.total, v.cash, v.card, v.debt, v.note || ""]), [6, 7, 8, 9, 10, 11]);
  put_("Mijozlar", ["Ism", "Telefon", "Telegram", "Tashriflar", "Jami sarf", "Qarz", "Oxirgi tashrif", "Qo'shilgan", "Izoh"],
    (db.clients || []).map(c => { const s = st[c.id] || { n: 0, sum: 0, debt: 0, last: "" }; return [c.name, txt(c.phone), c.tg ? "@" + c.tg : "", s.n, s.sum, Math.max(0, s.debt), s.last, c.createdAt || "", c.note || ""]; })
      .sort((a, b) => String(b[6]).localeCompare(String(a[6]))), [5, 6]);
  put_("Qarzdorlar", ["Ism", "Telefon", "Qarz"],
    (db.clients || []).map(c => [c.name, txt(c.phone), Math.max(0, (st[c.id] || { debt: 0 }).debt)]).filter(r => r[2] > 0).sort((a, b) => b[2] - a[2]), [3]);
  put_("Qarz to'lovlari", ["Sana", "Vaqt", "Mijoz", "Summa", "Usul"],
    pays.map(p => [p.date, p.time || "", name(p.clientId), p.amount, p.method === "card" ? "Karta" : "Naqd"]), [4]);
  put_("Xarajatlar", ["Sana", "Turi", "Summa", "Usul", "Izoh"],
    exps.map(e => [e.date, e.category, e.amount, e.method === "card" ? "Karta" : "Naqd", e.note || ""]), [3]);
  put_("Navbatlar", ["Sana", "Vaqt", "Mijoz", "Telefon", "Izoh", "Holat"],
    appts.map(a => [a.date, a.time, name(a.clientId), phone(a.clientId), a.note || "", a.done ? "Keldi" : "Kutilmoqda"]), []);

  // Oylik hisobot
  const M = {};
  const m = d => String(d || "").slice(0, 7), row = k => M[k] = M[k] || { v: 0, sales: 0, cash: 0, card: 0, disc: 0, debt: 0, back: 0, exp: 0, ids: {} };
  visits.forEach(v => { const r = row(m(v.date)); r.v++; r.sales += v.total; r.cash += v.cash; r.card += v.card; r.disc += v.discount; r.debt += v.debt; if (v.clientId) r.ids[v.clientId] = 1; });
  pays.forEach(p => { const r = row(m(p.date)); r.back += p.amount; p.method === "card" ? r.card += p.amount : r.cash += p.amount; });
  exps.forEach(e => { row(m(e.date)).exp += e.amount; });
  put_("Oylik hisobot", ["Oy", "Tashriflar", "Noyob mijoz", "Xizmatlar summasi", "Chegirma", "Naqd", "Karta", "Nasiyaga", "Qarz qaytdi", "Tushum", "Xarajat", "Sof foyda", "O'rtacha chek"],
    Object.keys(M).sort().reverse().map(k => { const r = M[k], inc = r.cash + r.card;
      return ["'" + k, r.v, Object.keys(r.ids).length, r.sales, r.disc, r.cash, r.card, r.debt, r.back, inc, r.exp, inc - r.exp, r.v ? Math.round(r.sales / r.v) : 0]; }),
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
}

function put_(title, head, rows, moneyCols) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(title);
  if (!sh) sh = ss.insertSheet(title);
  sh.clearContents();
  const data = [head].concat(rows);
  sh.getRange(1, 1, data.length, head.length).setValues(data);
  sh.getRange(1, 1, 1, head.length).setFontWeight("bold").setBackground("#F47B3C").setFontColor("#FFFFFF");
  sh.setFrozenRows(1);
  if (rows.length) moneyCols.forEach(c => sh.getRange(2, c, rows.length, 1).setNumberFormat("#,##0"));
  const extra = sh.getMaxRows() - data.length;
  if (extra > 50) sh.deleteRows(data.length + 1, extra - 50);
}
