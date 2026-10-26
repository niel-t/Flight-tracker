// Shared helpers, app state and formatting. Plain scripts (no build step), loaded in order from index.html.

const CABINS = ["economy", "premium", "business", "first"];
const CABIN_NAME = { economy: "Economy", premium: "Premium economy", business: "Business", first: "First" };
const CABIN_SHORT = { economy: "Economy", premium: "Premium", business: "Business", first: "First" };
const TRIP_LENGTH = { weekend: "Weekend", week: "1 week", "2weeks": "2 weeks" };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (n, cls = "i") => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem("ft." + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ft." + k, JSON.stringify(v)); } catch {} },
};
const session = {
  get(k) { try { return JSON.parse(sessionStorage.getItem("ft." + k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem("ft." + k, JSON.stringify(v)); } catch {} },
};

// data from the repository (see api.js load())
let config = { settings: {}, routes: [] }, latest = { routes: {} }, hist = {}, alerts = [], deals = { slices: {} };
const ui = { chart: store.get("chart", "graph") };

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.style.display = "block"; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = "none", 4500); }
function money(v, cur) {
  if (v == null) return "–";
  cur ||= latest.currency || deals.currency || config.settings.currency || "EUR";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v); } catch { return `${cur} ${v}`; }
}
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso, o = { day: "numeric", month: "short" }) => iso ? new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString(undefined, { ...o, timeZone: "UTC" }) : "";
const fmtDay = iso => fmtDate(iso, { weekday: "short", day: "numeric", month: "short" });
const monthName = (m, style = "long") => new Date(Date.UTC(2020, m - 1, 1)).toLocaleDateString(undefined, { month: style, timeZone: "UTC" });
const ago = iso => { const m = (Date.now() - new Date(iso)) / 60000; return m < 90 ? `${Math.max(1, Math.round(m))} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const dur = m => m ? `${Math.floor(m / 60)}h ${m % 60 ? String(m % 60).padStart(2, "0") + "m" : ""}`.trim() : "";
const stopsTxt = n => n == null ? "" : n === 0 ? "Non-stop" : `${n} stop${n > 1 ? "s" : ""}`;
const hhmm = t => (t || "").slice(11, 16);
const plusDays = (a, b) => { if (!a || !b) return ""; const d = (new Date(b.slice(0, 10)) - new Date(a.slice(0, 10))) / 864e5; return d > 0 ? `<sup>+${d}</sup>` : ""; };
const compact = p => p >= 10000 ? Math.round(p / 1000) + "k" : p >= 1000 ? (p / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(p);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function airlineLogo(row) {
  const code = row?.airline_code || (row?.legs?.[0]?.flight || "").split(" ")[0];
  const src = row?.logo || (code ? `https://www.gstatic.com/flights/airline_logos/70px/${code}.png` : "");
  const name = row?.airlines?.[0] || row?.airline || "?";
  const initials = esc(name.split(/\s+/).map(w => w[0]).join("").slice(0, 2));
  return `<span class="alogo" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${initials}'))">` : initials}</span>`;
}
function levelBadge(b) {
  if (!b?.level) return "";
  const t = { low: "Low price", typical: "Typical price", high: "High price" }[b.level] || b.level;
  return `<span class="badge ${b.level}">${b.level === "low" ? icon("down", "i xs") : ""}${t}</span>`;
}
function spark(points, w = 96, h = 28) {
  if (!points || points.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const pts = points.slice(-40), ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys);
  const X = i => 2 + i / (pts.length - 1) * (w - 4), Y = v => h - 3 - (v - lo) / (hi - lo || 1) * (h - 6);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const last = pts[pts.length - 1][1], first = pts[0][1], color = last <= first ? "var(--good)" : "var(--crit)";
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(pts.length - 1)}" cy="${Y(last)}" r="2.5" fill="${color}"/></svg>`;
}
function segmented(id, options, current, label) {
  return `<div class="seg" role="group" aria-label="${label}" ${id ? `id="${id}"` : ""}>${options.map(([v, t, off]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(current)}" class="${off ? "off" : ""}">${t}</button>`).join("")}</div>`;
}
/** Wires a segmented control: calls onPick(value) and updates the pressed state. */
function onSeg(el, onPick) {
  if (!el) return;
  el.onclick = e => { const b = e.target.closest("button"); if (!b) return; el.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); onPick(b.dataset.v); };
}

/** Google's price verdict on a low / typical / high bar. `b` has price, level and typical [lo, hi]. */
function insight(b) {
  if (!b?.typical) return "";
  const [a, c] = b.typical, lo = Math.min(a * .7, b.price * .95), hi = Math.max(c * 1.3, b.price * 1.05);
  const z1 = (a - lo) / (hi - lo), z2 = (c - a) / (hi - lo), z3 = (hi - c) / (hi - lo);
  const pos = Math.min(98, Math.max(2, (b.price - lo) / (hi - lo) * 100));
  const msg = { low: "Prices are currently <b class=\"down\">low</b>", typical: "Prices are currently <b>typical</b>", high: "Prices are currently <b class=\"up\">high</b>" }[b.level] || "";
  return `<div class="insight"><div class="small">${msg} for this search. Usually ${money(a)} – ${money(c)}.</div>
    <div class="range" role="img" aria-label="${money(b.price)} compared to the usual ${money(a)} to ${money(c)}">
      <i class="z1" style="flex:${z1}"></i><i class="z2" style="flex:${z2}"></i><i class="z3" style="flex:${z3}"></i>
      <span class="knob" style="left:${pos}%"></span><span class="pin" style="left:${pos}%">${money(b.price)}</span></div>
    <div class="range-labels"><span>Low</span><span>${money(a)}</span><span>${money(c)}</span><span>High</span></div></div>`;
}

function emptyState(emoji, title, text = "", actions = "") {
  return `<div class="card empty"><div class="em">${emoji}</div><h3>${title}</h3>${text ? `<p>${text}</p>` : ""}${actions ? `<p class="row" style="justify-content:center;margin-top:14px">${actions}</p>` : ""}</div>`;
}

function applyTheme(t) { if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; }
applyTheme(store.get("theme", "auto"));
