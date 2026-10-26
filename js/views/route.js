// Route detail: cheapest fare per class, price graph / calendar / date grid, cheapest trips and price history.

let cur = null;
function viewRoute(params) {
  const [id, cabin] = params;
  const r = config.routes.find(x => x.id === id);
  if (!r) return `<div class="page"><div class="wrap">${emptyState("🧭", "This route doesn't exist (anymore)", "", `<a class="btn" href="#/tracked">Back to tracked</a>`)}</div></div>`;
  const c = cabinsOf(r).includes(cabin) ? cabin : cabinsOf(r)[0];
  if (!cur || cur.id !== id || cur.cabin !== c) cur = { id, cabin: c, date: null };
  const e = entry(id, c), best = e.cheapest, cal = e.calendar || {}, tgt = r.targets?.[c];
  const pts = hist[id]?.[c] || [], low = pts.length ? Math.min(...pts.map(p => p[1])) : null;
  const okCount = Object.values(cal).filter(v => v.price).length, total = Object.keys(cal).length;
  const allTrips = tripsOf(r).filter(t => t.date > today()).length;
  if (ui.chart === "grid" && singleStay(r)) ui.chart = "graph";
  return `
  <section class="band band-tight"><div class="wrap">
    <a class="crumb" href="#/tracked">${icon("back", "i sm")} Tracked flights</a>
    <div class="row between" style="align-items:flex-end">
      <div class="with-thumb">${routeImg(r, "thumb lg")}<div><h1>${esc(routeTitle(r))}</h1>
        <p class="sub">${esc(r.from)} → ${esc(r.to)} · ${tripTxt(r)} · ${datesTxt(r)} · ${plural(+r.adults || 1, "passenger")}${r.max_stops != null ? ` · ${r.max_stops === 0 ? "non-stop" : `max ${plural(r.max_stops, "stop")}`}` : ""}</p></div></div>
      <button class="btn" data-edit="${esc(r.id)}" style="background:transparent;color:var(--band-ink);border-color:var(--band-line)">${icon("edit", "i sm")} Edit</button>
    </div>
  </div></section>
  <div class="page"><div class="wrap">
  ${segmented("d-cabin", CABINS.map(x => [x, CABIN_NAME[x], !cabinsOf(r).includes(x)]), c, "Class")}
  <div class="summary" style="margin-top:16px">
    <div class="card card-pad">
      <div class="small ink2">Cheapest ${CABIN_NAME[c].toLowerCase()} fare</div>
      <div class="row" style="align-items:baseline;gap:12px;margin-top:2px"><span class="big-price">${money(best?.price)}</span>${levelBadge(best)}</div>
      <div class="ink2" style="margin-top:4px">${best ? `${fmtDay(best.date)}${best.return_date ? ` – ${fmtDay(best.return_date)}` : ""} · ${esc((best.airlines || []).join(", "))} · ${stopsTxt(best.stops)}` : "Not found yet. The first prices arrive after the next scheduled run."}</div>
      ${insight(best)}
    </div>
    <div class="card card-pad stats">
      <div class="stat"><div class="k">Lowest seen</div><div class="v">${money(low)}</div><div class="k">${pts.length ? `since ${fmtDate(pts[0][0])}` : "–"}</div></div>
      <div class="stat"><div class="k">Your target</div><div class="v ${tgt && best && best.price <= tgt ? "down" : ""}">${money(tgt)}</div><div class="k">${tgt && best ? (best.price <= tgt ? "✓ Reached" : `${money(best.price - tgt)} to go`) : `<a href="#" data-edit="${esc(r.id)}">Set a target</a>`}</div></div>
      <div class="stat"><div class="k">Trips checked</div><div class="v">${total}<span class="small muted">/${allTrips}</span></div><div class="k">${okCount} with fares</div></div>
      <div style="grid-column:1/-1" class="row between">
        <span class="small ink2">Trend</span>${spark(pts, 220, 36).replace('class="spark"', 'class="spark" style="width:100%;max-width:260px;height:36px"')}
      </div>
    </div>
  </div>

  <section class="section">
    <div class="section-head">
      <div><h2>${r.date_mode === "exact" ? "Prices around your dates" : "Prices by departure date"}</h2><p class="small ink2">${chartHint(r)}</p></div>
      ${segmented("d-chart-mode", [["graph", "Price graph"], ["calendar", "Calendar"], ...(singleStay(r) ? [] : [["grid", "Date grid"]])], ui.chart, "Chart type")}
    </div>
    <div class="card card-pad" id="d-chart"></div>
  </section>

  <section class="section">
    <div class="section-head"><div><h2>${cur.date ? "Selected date & cheapest options" : "Cheapest options"}</h2><p class="small ink2">Prices include taxes and fees for ${plural(+r.adults || 1, "passenger")}. Book on Google Flights.</p></div></div>
    <div class="card" style="overflow:hidden" id="d-results"></div>
  </section>

  <section class="section">
    <div class="section-head"><div><h2>Price history</h2><p class="small ink2">Cheapest fare found over time${tgt ? ", with your target" : ""}</p></div></div>
    <div class="card card-pad" id="d-history"></div>
  </section>
  </div></div>`;
}

function afterRoute() {
  const r = config.routes.find(x => x.id === cur?.id); if (!r) return;
  $("#d-cabin").onclick = e => { const b = e.target.closest("button"); if (!b) return;
    if (!cabinsOf(r).includes(b.dataset.v)) return toast(`${CABIN_NAME[b.dataset.v]} isn't tracked on this route. Use Edit to add it.`);
    location.hash = `#/route/${encodeURIComponent(r.id)}/${b.dataset.v}`; };
  onSeg($("#d-chart-mode"), v => { ui.chart = v; store.set("chart", v); drawChart(r); });
  drawChart(r); drawResults(r); drawHistory(r);
}

function chartHint(r) {
  if (r.trip === "oneway") return "One-way fares. Select a date to see its flight.";
  if (singleStay(r)) return `Round trip with ${r.nights} nights away. Select a date to see its flight.`;
  return "Each date shows its cheapest round trip; the date grid shows every departure and return combination.";
}
const windowDates = r => [...new Set(tripsOf(r).map(t => t.date))];
/** Cheapest trip per departure date. */
function byDepart(cal) {
  const out = {};
  for (const [key, v] of Object.entries(cal)) { const d = key.slice(0, 10); if (v.price && (!out[d] || v.price < out[d].price)) out[d] = { ...v, key }; }
  for (const [key, v] of Object.entries(cal)) { const d = key.slice(0, 10); if (!out[d]) out[d] = { ...v, key }; }
  return out;
}
function pickDate(r, sel) { cur.date = cur.date === sel ? null : sel; drawChart(r); drawResults(r); $("#d-results").scrollIntoView({ behavior: "smooth", block: "nearest" }); }

function drawChart(r) {
  const el = $("#d-chart"), full = entry(r.id, cur.cabin).calendar || {}, best = entry(r.id, cur.cabin).cheapest, cal = byDepart(full);
  const dates = windowDates(r), prices = dates.map(d => cal[d]?.price).filter(Boolean);
  if (!prices.length) { el.innerHTML = `<div class="empty" style="padding:24px"><p>No dates checked yet for this class.</p></div>`; return; }
  if (ui.chart === "calendar") return drawCalendar(r, el, cal, best);
  if (ui.chart === "grid") return drawGrid(r, el, full, best);
  const bw = 22, gap = 6, H = 220, T = 28, B = 34, L = 8;
  const W = Math.max(L * 2 + dates.length * (bw + gap), el.clientWidth - 40);
  const hi = Math.max(...prices) * 1.08, Y = v => T + (1 - v / hi) * (H - T - B);
  const step = Math.pow(10, Math.floor(Math.log10(hi / 3))), gstep = Math.ceil(hi / 4 / step) * step;
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Price by departure date">`;
  for (let g = gstep; g < hi; g += gstep) s += `<line x1="0" x2="${W}" y1="${Y(g)}" y2="${Y(g)}" stroke="var(--border)"/><text x="${W - 4}" y="${Y(g) - 4}" text-anchor="end" font-size="11" fill="var(--muted)">${compact(g)}</text>`;
  s += `<line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--border-strong)"/>`;
  dates.forEach((d, i) => {
    const x = L + i * (bw + gap), v = cal[d]?.price, dt = new Date(d + "T12:00:00Z"), isBest = best?.date === d, sel = cur.date?.slice(0, 10) === d;
    if (v) {
      const y = Y(v), h = H - B - y;
      s += `<path class="bar" data-d="${d}" tabindex="0" role="button" aria-label="${fmtDay(d)}: ${money(v)}" d="M${x},${H - B}V${y + 5}q0,-5 5,-5h${bw - 10}q5,0 5,5V${H - B}z" fill="${isBest ? "#34a853" : sel ? "var(--bar-hover)" : "var(--bar)"}"/>`;
      if (isBest) s += `<text x="${x + bw / 2}" y="${y - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--good)">${money(v)}</text>`;
    } else s += `<rect x="${x}" y="${H - B - 4}" width="${bw}" height="4" rx="2" fill="var(--bar-empty)"><title>${fmtDay(d)}: ${cal[d] ? "no flights" : "not checked yet"}</title></rect>`;
    if (sel) s += `<rect x="${x - 3}" y="${T - 6}" width="${bw + 6}" height="${H - B - T + 10}" rx="8" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
    const dow = dt.getUTCDay();
    s += `<text x="${x + bw / 2}" y="${H - B + 15}" text-anchor="middle" font-size="11" fill="${dow === 0 || dow === 6 ? "var(--ink-2)" : "var(--muted)"}">${dt.getUTCDate()}</text>`;
    if (dt.getUTCDate() === 1 || i === 0) s += `<text x="${x}" y="${H - 4}" font-size="11" font-weight="600" fill="var(--ink-2)">${dt.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}</text>`;
  });
  s += `</svg>`;
  el.innerHTML = `<div class="chart-wrap">${s}<div class="tip" id="tip"></div></div>
    <div class="row tiny ink2" style="margin-top:8px;gap:16px"><span class="row" style="gap:6px"><i style="width:10px;height:10px;border-radius:3px;background:#34a853;display:inline-block"></i>Cheapest date</span>
    <span class="row" style="gap:6px"><i style="width:10px;height:4px;border-radius:2px;background:var(--bar-empty);display:inline-block"></i>Not checked yet</span></div>`;
  const wrap = el.querySelector(".chart-wrap"), tip = el.querySelector("#tip");
  if (best && !drawChart._scrolled?.[r.id + cur.cabin]) {
    const i = dates.indexOf(best.date); wrap.scrollLeft = Math.max(0, L + i * (bw + gap) - wrap.clientWidth / 2);
    (drawChart._scrolled ||= {})[r.id + cur.cabin] = true;
  }
  wrap.onpointermove = e => {
    const b = e.target.closest(".bar"); if (!b) { tip.style.display = "none"; return; }
    const v = cal[b.dataset.d], box = wrap.getBoundingClientRect(), bb = b.getBoundingClientRect();
    tip.innerHTML = `<b>${singleStay(r) ? "" : "from "}${money(v.price)}</b><br><span class="ink2">${fmtDay(b.dataset.d)}${v.return_date ? ` – ${fmtDay(v.return_date)}` : ""}</span><br><span class="tiny muted">${esc((v.airlines || []).join(", "))} · ${stopsTxt(v.stops)}</span>`;
    tip.style.display = "block";
    const left = bb.left - box.left + wrap.scrollLeft + bb.width / 2 - tip.offsetWidth / 2;
    tip.style.left = Math.max(wrap.scrollLeft, Math.min(left, wrap.scrollLeft + wrap.clientWidth - tip.offsetWidth)) + "px";
    tip.style.top = Math.max(0, bb.top - box.top - tip.offsetHeight - 8) + "px";
  };
  wrap.onpointerleave = () => tip.style.display = "none";
  wrap.onclick = e => { const b = e.target.closest(".bar"); if (b) pickDate(r, b.dataset.d); };
  wrap.onkeydown = e => { const b = e.target.closest(".bar"); if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickDate(r, b.dataset.d); } };
}

function drawCalendar(r, el, cal, best) {
  const prices = Object.values(cal).filter(v => v.price).map(v => v.price).sort((a, b) => a - b);
  const step = p => prices.length < 2 ? 7 : 7 - Math.min(6, Math.floor(prices.findIndex(x => x >= p) / (prices.length - 1) * 7));
  const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
  const start = new Date(r.depart_from + "T00:00:00Z"), end = new Date(r.depart_to + "T00:00:00Z"), departDays = new Set(windowDates(r));
  let html = "";
  for (let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); m <= end; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const y = m.getUTCFullYear(), mo = m.getUTCMonth(), days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 6) % 7;
    let cells = ["M", "T", "W", "T", "F", "S", "S"].map(d => `<div class="wd">${d}</div>`).join("") + "<div></div>".repeat(lead);
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, v = cal[iso];
      if (!departDays.has(iso)) { cells += `<div class="d out"><span>${d}</span></div>`; continue; }
      if (!v?.price) { cells += `<div class="d" title="${fmtDay(iso)}: ${v ? "no flights" : "not checked yet"}"><span>${d}</span><span class="p">${v ? "×" : ""}</span></div>`; continue; }
      const s = step(v.price), lightText = dark ? s <= 4 : s >= 5;
      cells += `<button type="button" class="d has ${lightText ? "dark" : "light"} ${best?.date === iso ? "best" : ""} ${cur.date?.slice(0, 10) === iso ? "sel" : ""}" data-d="${iso}" style="background:var(--seq-${s})" aria-label="${fmtDay(iso)}: ${money(v.price)}"><span>${d}</span><span class="p">${compact(v.price)}</span></button>`;
    }
    html += `<div class="month"><h4>${new Date(Date.UTC(y, mo, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</h4><div class="cal">${cells}</div></div>`;
  }
  el.innerHTML = `<div class="row between" style="margin-bottom:12px"><span class="legend"><span>Cheaper</span><span class="sw">${[7, 6, 5, 4, 3, 2, 1].map(i => `<i style="background:var(--seq-${i})"></i>`).join("")}</span><span>Pricier</span></span>
    <span class="legend"><i style="width:12px;height:12px;border-radius:4px;box-shadow:inset 0 0 0 2px #34a853;display:inline-block"></i>Cheapest</span></div><div class="months">${html}</div>`;
  el.querySelector(".months").onclick = e => { const b = e.target.closest("button.d"); if (b) pickDate(r, b.dataset.d); };
}

/** Departure dates across, return dates (or nights) down, like Google Flights' date grid. */
function drawGrid(r, el, cal, best) {
  const trips = tripsOf(r), byKey = Object.fromEntries(trips.map(t => [t.key, t]));
  const cols = [...new Set(trips.map(t => t.date))], useRet = !!r.return_from;
  const rows = [...new Set(trips.map(t => useRet ? t.ret : t.n))].sort((a, b) => a < b ? -1 : 1);
  const prices = Object.values(cal).filter(v => v.price).map(v => v.price).sort((a, b) => a - b);
  const step = p => prices.length < 2 ? 7 : 7 - Math.min(6, Math.floor(prices.findIndex(x => x >= p) / (prices.length - 1) * 7));
  const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
  const cell = (d, rv) => {
    const t = trips.find(x => x.date === d && (useRet ? x.ret === rv : x.n === rv));
    if (!t) return `<td class="gx"></td>`;
    const v = cal[t.key];
    if (!v?.price) return `<td class="g0" title="${fmtDay(d)} – ${fmtDay(t.ret)}: ${v ? "no flights" : "not checked yet"}">${v ? "×" : "·"}</td>`;
    const s = step(v.price), light = dark ? s <= 4 : s >= 5;
    return `<td><button type="button" class="gc ${light ? "dark" : "light"} ${best && best.date === d && best.return_date === t.ret ? "best" : ""} ${cur.date === t.key ? "sel" : ""}" data-k="${t.key}" style="background:var(--seq-${s})"
      aria-label="${fmtDay(d)} to ${fmtDay(t.ret)}: ${money(v.price)}">${compact(v.price)}</button></td>`;
  };
  el.innerHTML = `<div class="row between" style="margin-bottom:12px"><span class="legend"><span>Cheaper</span><span class="sw">${[7, 6, 5, 4, 3, 2, 1].map(i => `<i style="background:var(--seq-${i})"></i>`).join("")}</span><span>Pricier</span></span>
    <span class="tiny ink2">Departure → · ${useRet ? "Return" : "Nights"} ↓</span></div>
    <div class="grid-wrap"><table class="dgrid"><thead><tr><th class="corner">${useRet ? "Return" : "Nights"}</th>${cols.map(d => `<th>${fmtDate(d, { weekday: "short" })}<br><b>${fmtDate(d)}</b></th>`).join("")}</tr></thead>
    <tbody>${rows.map(rv => `<tr><th>${useRet ? `${fmtDate(rv, { weekday: "short" })}<br><b>${fmtDate(rv)}</b>` : `<b>${rv}</b> night${rv === 1 ? "" : "s"}`}</th>${cols.map(d => cell(d, rv)).join("")}</tr>`).join("")}</tbody></table></div>`;
  el.querySelector(".dgrid").onclick = e => { const b = e.target.closest(".gc"); if (b) pickDate(r, b.dataset.k); };
}

function drawResults(r) {
  const cal = entry(r.id, cur.cabin).calendar || {};
  let rows = Object.entries(cal).filter(([, v]) => v.price).sort((a, b) => a[1].price - b[1].price);
  if (cur.date) { const hit = ([k]) => cur.date.includes("+") || cur.date.length > 10 ? k === cur.date : k.slice(0, 10) === cur.date; rows = [...rows.filter(hit), ...rows.filter(x => !hit(x))]; }
  rows = rows.slice(0, 10).map(([k, v]) => [k.slice(0, 10), v, k]);
  const el = $("#d-results");
  if (!rows.length) { el.innerHTML = `<div class="empty"><p>No fares found yet.</p></div>`; return; }
  el.innerHTML = rows.map(([d, v, k], i) => {
    const legs = v.legs || [], from = legs[0]?.from || r.from.split(",")[0], to = legs[legs.length - 1]?.to || r.to.split(",")[0];
    const isSel = cur.date && (cur.date === k || cur.date === d) && i === 0;
    const nights = v.return_date ? daysBetween(d, v.return_date) : null;
    return `<a class="res-row ${isSel ? "sel" : ""}" href="${esc(v.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">
        ${airlineLogo(v)}
        <span><b class="num">${!hhmm(v.depart_time) ? fmtDay(d) : hhmm(v.arrive_time) ? `${hhmm(v.depart_time)} – ${hhmm(v.arrive_time)}${plusDays(v.depart_time, v.arrive_time)}` : `Departs ${hhmm(v.depart_time)}`}</b><br>
          <span class="small ink2">${fmtDay(d)}${v.return_date ? ` → ${fmtDay(v.return_date)}` : ""} · ${esc((v.airlines || []).join(", "))}</span></span>
        <span class="c3"><b>${dur(v.duration) || "–"}</b><br><span class="small ink2">${esc(from)}–${esc(to)}</span></span>
        <span class="c4"><b>${stopsTxt(v.stops)}</b><br><span class="small ink2">${[legs.length > 1 ? esc(legs.slice(0, -1).map(l => l.to).join(", ")) : "", `checked ${ago(v.checked)}`].filter(Boolean).join(" · ")}</span></span>
        <span style="text-align:right"><b class="num ${v.price === entry(r.id, cur.cabin).cheapest?.price ? "down" : ""}" style="font-size:18px">${money(v.price)}</b><br><span class="small ink2">${v.return_date ? `round trip · ${plural(nights, "night")}` : "one way"} ${icon("ext", "i xs")}</span></span>
      </a>`;
  }).join("");
}

function drawHistory(r) {
  const el = $("#d-history"), pts = hist[r.id]?.[cur.cabin] || [], tgt = r.targets?.[cur.cabin];
  if (pts.length < 2) { el.innerHTML = `<p class="small muted">The trend appears after a few search runs.</p>`; return; }
  const W = Math.max(320, el.clientWidth - 40), H = 220, L = 8, R = 44, T = 16, B = 28;
  const xs = pts.map(p => +new Date(p[0])), ys = pts.map(p => p[1]).concat(tgt ? [tgt] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys) * .94, hi = Math.max(...ys) * 1.04;
  const X = t => L + (t - x0) / (x1 - x0 || 1) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  let d = `M${X(xs[0])},${Y(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `H${X(xs[i])}V${Y(pts[i][1])}`;
  const area = `${d}H${X(xs[xs.length - 1])}V${H - B}H${X(xs[0])}Z`;
  const ticks = [0, 1, 2, 3].map(i => lo + (hi - lo) * (i + .5) / 4);
  el.innerHTML = `<div class="chart-wrap" style="overflow:visible"><svg width="${W}" height="${H}" role="img" aria-label="Cheapest fare over time">
    <defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".22"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)"/><text x="${W - R + 6}" y="${Y(v) + 4}" font-size="11" fill="var(--muted)">${compact(Math.round(v))}</text>`).join("")}
    <text x="${L}" y="${H - 8}" font-size="11" fill="var(--muted)">${fmtDate(pts[0][0])}</text><text x="${W - R}" y="${H - 8}" font-size="11" fill="var(--muted)" text-anchor="end">${fmtDate(pts[pts.length - 1][0])}</text>
    ${tgt ? `<line x1="${L}" x2="${W - R}" y1="${Y(tgt)}" y2="${Y(tgt)}" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - R + 6}" y="${Y(tgt) + 4}" font-size="11" font-weight="600" fill="var(--good)">target</text>` : ""}
    <path d="${area}" fill="url(#hg)"/><path d="${d}" fill="none" stroke="var(--brand)" stroke-width="2"/>
    <line id="hx" y1="${T}" y2="${H - B}" stroke="var(--border-strong)" visibility="hidden"/><circle id="hd" r="5" fill="var(--brand)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
  </svg><div class="tip" id="htip"></div></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector("#htip"), hx = el.querySelector("#hx"), hd = el.querySelector("#hd");
  svg.onpointermove = e => {
    const box = svg.getBoundingClientRect(), t = x0 + (e.clientX - box.left - L) / (W - L - R) * (x1 - x0);
    let i = 0; while (i < xs.length - 1 && xs[i + 1] <= t) i++;
    const px = X(xs[i]), py = Y(pts[i][1]);
    for (const [k, v] of [["x1", px], ["x2", px]]) hx.setAttribute(k, v);
    hd.setAttribute("cx", px); hd.setAttribute("cy", py); hx.setAttribute("visibility", "visible"); hd.setAttribute("visibility", "visible");
    tip.style.display = "block"; tip.innerHTML = `<b>${money(pts[i][1])}</b><br><span class="tiny ink2">${new Date(pts[i][0]).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>`;
    tip.style.left = Math.min(px + 12, W - tip.offsetWidth) + "px"; tip.style.top = Math.max(0, py - tip.offsetHeight - 10) + "px";
  };
  svg.onpointerleave = () => { tip.style.display = "none"; hx.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); };
}
let resizeT; addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const r = config.routes.find(x => x.id === cur?.id); if (r && location.hash.startsWith("#/route/")) { drawChart(r); drawHistory(r); } }, 150); });
