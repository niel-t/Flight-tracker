// Flight results: a live Google Flights search with filters, sorting, the price verdict and price tracking.

const tripKey = (t, cabin) => `${cabin}|${t.date}|${t.ret || ""}`;
const DEP_TIMES = [["night", "Night", 0, 5], ["morning", "Morning", 5, 12], ["afternoon", "Afternoon", 12, 18], ["evening", "Evening", 18, 24]];
const blankFilters = () => ({ stops: null, airlinesOff: [], times: null, maxDur: null, maxPrice: null, minLay: null, maxLay: null, noOvernight: false, viaOff: [] });
const layMins = o => (o.layovers || []).map(l => l.duration).filter(Boolean);
const shortestLay = o => layMins(o).length ? Math.min(...layMins(o)) : null;
const longestLay = o => layMins(o).length ? Math.max(...layMins(o)) : null;
const layTotal = o => layMins(o).reduce((a, b) => a + b, 0);

/** The trips a live search checks: the chosen dates, or up to 5 dates spread over a flexible window. */
function liveTrips(r) {
  if (r.date_mode === "exact") { const v = dateValues(r); return [{ date: v.depart, ret: r.trip === "oneway" ? null : v.ret }]; }
  const tomorrow = addDays(today(), 1);
  const all = tripsOf(r).filter(t => t.date >= tomorrow), dates = [...new Set(all.map(t => t.date))];
  const ns = [...new Set(all.map(t => t.n))], mid = ns[Math.floor((ns.length - 1) / 2)];
  const pick = dates.length <= 5 ? dates : [0, 1, 2, 3, 4].map(i => dates[Math.round(i * (dates.length - 1) / 4)]);
  return pick.map(d => all.find(t => t.date === d && t.n === mid) || all.find(t => t.date === d));
}
function startSearch(r) {
  ui.search = { r, cabin: r.cabins[0], results: {}, failed: {}, sel: null, sort: "best", filters: blankFilters(), shown: 15 };
  session.set("search", ui.search);
  if (location.hash === "#/search") route(); else location.hash = "#/search";
}
const saveSearchState = () => session.set("search", ui.search);

function viewResults() {
  const s = ui.search ||= session.get("search");
  if (!s) return `<div class="page"><div class="wrap">${emptyState("🔎", "No search yet", "Search for flights first.", `<a class="btn btn-primary" href="#/">Search flights</a>`)}</div></div>`;
  s.filters ||= blankFilters(); s.sort ||= "best"; s.shown ||= 15;
  const r = s.r, tracked = config.routes.find(x => routeSig(x) === routeSig(r));
  return `
  <section class="band band-tight">
    <div class="wrap">
      <div class="summary-bar">
        <div><div class="what">${esc(cityOf(r.from))} → ${esc(cityOf(r.to))}</div>
          <div class="meta">${r.trip === "oneway" ? "One way" : "Round trip"} · ${datesTxt(r)} · ${plural(+r.adults || 1, "passenger")} · ${CABIN_NAME[s.cabin]}${limitsTxt(r) ? ` · ${esc(limitsTxt(r))}` : ""}</div></div>
        <button class="btn" id="s-modify">${icon("edit", "i sm")} Modify search</button>
      </div>
      <div id="s-modify-panel" hidden style="margin-top:18px">${searchPanel({ ...r, cabins: [s.cabin] })}</div>
    </div>
  </section>
  <div class="page"><div class="wrap">
    <div class="results-layout">
      <aside class="card filters" id="s-filters" aria-label="Filters"></aside>
      <div>
        <div class="row between" style="margin-bottom:14px">
          ${segmented("s-cabin", CABINS.map(c => [c, CABIN_SHORT[c]]), s.cabin, "Class")}
          <button class="filters-btn" id="s-filters-btn">${icon("filter", "i sm")} Filters <span id="s-filter-count"></span></button>
        </div>
        <div class="card track-box">
          <span class="ic">${icon("bell")}</span>
          <div class="grow"><b>${tracked ? "You're tracking this route" : "Track prices"}</b><br><span class="small ink2">${tracked ? "We check it automatically and tell you when it gets cheaper." : "Get notified when this route gets cheaper. We check every date automatically."}</span></div>
          ${tracked ? `<a class="btn" href="#/route/${encodeURIComponent(tracked.id)}">View prices</a>` : `<button class="btn-primary" id="s-track">${icon("bell", "i sm")} Track</button>`}
        </div>
        <div id="s-body"></div>
      </div>
    </div>
  </div></div>`;
}

function afterResults() {
  const s = ui.search; if (!s) return;
  $("#s-modify").onclick = () => { const p = $("#s-modify-panel"); p.hidden = !p.hidden; };
  initSearchPanel($("#search-form"));
  onSeg($("#s-cabin"), v => { s.cabin = v; s.sel = null; s.filters = blankFilters(); saveSearchState(); route(); });
  $("#s-track")?.addEventListener("click", e => trackRoute({ ...s.r, ...limitsFromFilters(s.filters, s.r), id: slug(`${s.r.from.split(",")[0]}-${s.r.to.split(",")[0]}-${Date.now().toString(36).slice(-4)}`), cabins: [s.cabin] }, e.currentTarget));
  $("#s-filters-btn").onclick = () => { $("#dlg-filters").showModal(); };
  runLiveSearch();
}

async function runLiveSearch() {
  const s = ui.search, body = $("#s-body");
  if (!body) return;
  if (!liveApi) { body.replaceChildren(errorPanel(apiError("not-set-up", ""))); return; }
  if (liveStatus?.passcode && !store.get("passcode", "")) return askPasscode(runLiveSearch, null, body);
  const trips = liveTrips(s.r);
  if (!trips.length) { body.innerHTML = emptyState("📅", "These dates are in the past", "Modify the search to pick new dates."); return; }
  const todo = trips.filter(t => !s.results[tripKey(t, s.cabin)]);
  if (todo.length) {
    body.innerHTML = resultsSkeleton(trips.length > 1);
    const p = new URLSearchParams({ from: s.r.from, to: s.r.to, cabin: s.cabin, adults: s.r.adults || 1, stops: s.r.max_stops ?? "", currency: config.settings.currency || "EUR" });
    const out = await Promise.allSettled(todo.map(t => live(`/search?${p}&depart=${t.date}${t.ret ? `&return=${t.ret}` : ""}`)));
    if (ui.search !== s || !$("#s-body")) return; // navigated away meanwhile
    if (out.some(o => o.status === "rejected" && o.reason.code === "passcode")) { store.set("passcode", ""); return askPasscode(runLiveSearch, "That passcode didn't work. Try again.", $("#s-body")); }
    const failed = out.find(o => o.status === "rejected");
    if (failed && out.every(o => o.status === "rejected")) return $("#s-body").replaceChildren(errorPanel(failed.reason, runLiveSearch));
    s.failed = {};
    out.forEach((o, i) => { if (o.status === "fulfilled") s.results[tripKey(todo[i], s.cabin)] = o.value; else s.failed[tripKey(todo[i], s.cabin)] = o.reason.message; });
    saveSearchState();
  }
  drawResultsPage(trips);
}

const depBucket = o => { const h = +hhmm(o.depart_time).slice(0, 2); return DEP_TIMES.find(([, , a, b]) => h >= a && h < b)?.[0]; };
function applyFilters(opts, f) {
  return opts.filter(o => (!f.stops || f.stops.includes(Math.min(o.stops, 2)))
    && !o.airlines.some(a => f.airlinesOff.includes(a))
    && (!f.times || f.times.includes(depBucket(o)))
    && (!f.maxDur || !o.duration || o.duration <= f.maxDur)
    && (!f.maxPrice || o.price <= f.maxPrice)
    && (!f.minLay || !o.stops || (shortestLay(o) ?? f.minLay) >= f.minLay)
    && (!f.maxLay || !o.stops || (longestLay(o) ?? 0) <= f.maxLay)
    && (!f.noOvernight || !(o.layovers || []).some(l => l.overnight))
    && !(o.layovers || []).some(l => (f.viaOff || []).includes(l.id)));
}
const SORTS = {
  best: (a, b) => (b.best - a.best) || (a.rank - b.rank),
  cheapest: (a, b) => a.price - b.price || (a.duration || 0) - (b.duration || 0),
  fastest: (a, b) => (a.duration || 9999) - (b.duration || 9999) || a.price - b.price,
  layover: (a, b) => a.stops - b.stops || layTotal(a) - layTotal(b) || a.price - b.price,
};
const SORT_NAME = { best: "Best", cheapest: "Cheapest", fastest: "Fastest", layover: "Shortest stops" };

function drawResultsPage(trips) {
  const s = ui.search, body = $("#s-body");
  const res = trips.map(t => ({ t, v: s.results[tripKey(t, s.cabin)] })).filter(x => x.v);
  const cheapestOf = v => v.options?.length ? Math.min(...v.options.map(o => o.price)) : null;
  if (!s.sel || !res.find(x => x.t.date === s.sel)) s.sel = (res.filter(x => cheapestOf(x.v) != null).sort((a, b) => cheapestOf(a.v) - cheapestOf(b.v))[0] || res[0])?.t.date;
  const cur = res.find(x => x.t.date === s.sel);
  const failedTrips = trips.filter(t => s.failed?.[tripKey(t, s.cabin)] && !s.results[tripKey(t, s.cabin)]);
  const failNote = failedTrips.length ? `<div class="banner" style="margin-bottom:14px">⚠️ <span class="grow">${plural(failedTrips.length, "date")} couldn't be checked: ${esc(s.failed[tripKey(failedTrips[0], s.cabin)].replace(/\.$/, ""))}.</span><button class="btn-sm" id="s-retry-failed">Retry</button></div>` : "";
  const strip = trips.length > 1 ? `<div class="card card-pad" style="margin-bottom:14px">
      <div class="row between" style="margin-bottom:10px"><h3>Compare dates</h3><span class="tiny ink2">${trips.length} of ${windowDates(s.r).length} departure dates checked. Track prices to check them all.</span></div>
      <div class="dstrip">${res.map(({ t, v }) => { const c = cheapestOf(v), low = c != null && c === Math.min(...res.map(x => cheapestOf(x.v)).filter(x => x != null));
        return `<button class="dcell ${t.date === s.sel ? "on" : ""}" data-d="${t.date}"><span class="tiny ink2">${fmtDate(t.date, { weekday: "short", day: "numeric", month: "short" })}${t.ret ? `<br>→ ${fmtDate(t.ret)}` : ""}</span><b class="${low ? "down" : ""}">${c != null ? money(c) : "–"}</b></button>`; }).join("")}</div></div>` : "";
  if (!cur || !cur.v.options?.length) {
    body.innerHTML = failNote + strip + emptyState("🛬", "No flights found", esc(cur?.v.message || "Try other dates, more stops or nearby airports."));
    $("#s-filters").innerHTML = ""; wireResultsBody(trips); return;
  }
  const v = cur.v;
  const all = v.options.map((o, i) => ({ ...o, rank: i }));
  const shown = applyFilters(all, s.filters);
  const sorted = shown.slice().sort(SORTS[s.sort]);
  const tabs = Object.keys(SORTS).map(k => { const top = shown.slice().sort(SORTS[k])[0]; return [k, top]; });
  const cheapest = Math.min(...all.map(o => o.price));
  body.innerHTML = `${failNote}${strip}
    ${v.typical ? `<div class="card insight-strip"><div class="grow" style="min-width:260px">${insight({ ...v, price: cheapest })}</div><div class="tiny muted">${v.cached ? "From the last 30 min" : "Live"} · ${ago(v.searched_at)}</div></div>` : ""}
    <div class="sort-tabs" role="group" aria-label="Sort">${tabs.map(([k, top]) => `<button data-sort="${k}" aria-pressed="${s.sort === k}"><b>${SORT_NAME[k]}</b><span>${top ? k === "layover" ? `${money(top.price)} · ${top.stops ? `${dur(layTotal(top))} waiting` : "non-stop"}` : `${money(top.price)} · ${dur(top.duration)}` : "–"}</span></button>`).join("")}</div>
    <p class="small ink2" style="margin:0 0 10px">${plural(shown.length, "flight")}${shown.length < all.length ? ` of ${all.length}` : ""} · ${fmtDay(cur.t.date)}${cur.t.ret ? ` – ${fmtDay(cur.t.ret)}` : ""} · prices include taxes and fees for ${plural(+s.r.adults || 1, "passenger")}${cur.t.ret ? ", round trip" : ""}</p>
    <div id="s-list">${sorted.length ? sorted.slice(0, s.shown).map(o => flightCard(o, v, cheapest)).join("") : emptyState("🔎", "No flights match your filters", "", `<button class="btn" data-reset>Reset filters</button>`)}</div>
    ${sorted.length > s.shown ? `<p style="text-align:center"><button id="s-more">Show ${Math.min(15, sorted.length - s.shown)} more flights</button></p>` : ""}`;
  const fh = filtersHtml(all, s.filters);
  $("#s-filters").innerHTML = fh; $("#f-body").innerHTML = fh;
  const n = activeFilters(s.filters); $("#s-filter-count").textContent = n ? `(${n})` : "";
  wireFilters($("#s-filters"), trips); wireFilters($("#f-body"), trips);
  wireResultsBody(trips);
}

function wireResultsBody(trips) {
  const s = ui.search, body = $("#s-body");
  $("#s-retry-failed")?.addEventListener("click", runLiveSearch);
  body.querySelectorAll(".dcell").forEach(b => b.onclick = () => { s.sel = b.dataset.d; s.filters = blankFilters(); saveSearchState(); drawResultsPage(trips); });
  body.querySelectorAll("[data-sort]").forEach(b => b.onclick = () => { s.sort = b.dataset.sort; saveSearchState(); drawResultsPage(trips); });
  body.querySelector("[data-reset]")?.addEventListener("click", () => { s.filters = blankFilters(); saveSearchState(); drawResultsPage(trips); });
  $("#s-more")?.addEventListener("click", () => { s.shown += 15; drawResultsPage(trips); });
  body.querySelectorAll(".flight .toggle").forEach(b => b.onclick = () => { const f = b.closest(".flight"); f.classList.toggle("open"); b.setAttribute("aria-expanded", f.classList.contains("open")); b.innerHTML = f.classList.contains("open") ? `Hide details ${icon("chev", "i xs")}` : `Flight details ${icon("chev", "i xs")}`; });
}

function flightCard(o, v, cheapest) {
  const legs = o.legs || [], first = legs[0] || {}, last = legs[legs.length - 1] || {};
  const lays = o.layovers || [], short = lays.some(l => l.duration && l.duration < SHORT_LAYOVER), long = lays.some(l => l.duration >= LONG_LAYOVER), night = lays.some(l => l.overnight);
  const warn = [short && "short connection", long && "long layover", night && "overnight"].filter(Boolean);
  const dots = Array.from({ length: o.stops }, (_, i) => `<i style="left:${(i + 1) / (o.stops + 1) * 100}%"></i>`).join("");
  return `<article class="flight">
    <div class="flight-main">
      <div class="flight-info">
        ${airlineLogo(o)}
        <div><div class="times">${hhmm(o.depart_time)} – ${hhmm(o.arrive_time)}${plusDays(o.depart_time, o.arrive_time)}</div><div class="small ink2">${esc(o.airlines.join(", "))}</div></div>
        <div class="route-line"><span>${dur(o.duration)}</span><div class="line">${dots}</div><span class="${o.stops ? "" : "stops0"}">${stopsTxt(o.stops)}${lays.length ? ` · ${esc(layoverTxt(lays))}` : ""}${warn.length ? `<br><span class="lay-warn">${warn.join(" · ")}</span>` : ""}</span></div>
        <div class="small ink2 co2" style="text-align:right">${esc(first.from || "")}–${esc(last.to || "")}${o.co2_diff != null && o.co2_diff <= -5 ? `<br><span class="down">${o.co2_diff}% CO₂</span>` : ""}</div>
      </div>
      <div class="flight-price">
        <div><div class="p ${o.price === cheapest ? "down" : ""}">${money(o.price)}</div><div class="tiny muted">${v.query?.ret ? "round trip" : "one way"}${o.best ? " · top pick" : ""}</div></div>
        ${v.url ? `<a class="btn btn-primary btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">View deal ${icon("ext", "i xs")}</a>` : ""}
      </div>
    </div>
    <button class="btn-ghost toggle" aria-expanded="false">Flight details ${icon("chev", "i xs")}</button>
    <div class="flight-more">
      <div class="legs">${legs.map((l, i) => `
        <div><b>${hhmm(l.depart)}</b> ${esc(l.from_name || l.from)} (${esc(l.from)})</div>
        <div class="tiny ink2" style="padding-left:12px">${dur(l.duration) ? `Travel time ${dur(l.duration)} · ` : ""}${esc(l.airline)} ${esc(l.flight)}${l.airplane ? ` · ${esc(l.airplane)}` : ""}${l.legroom ? ` · legroom ${esc(l.legroom)}` : ""}${l.overnight ? " · overnight" : ""}</div>
        <div><b>${hhmm(l.arrive)}</b> ${esc(l.to_name || l.to)} (${esc(l.to)})</div>
        ${lays[i] ? `<div class="layover ${lays[i].duration < SHORT_LAYOVER ? "warn" : ""}">${dur(lays[i].duration)} layover · ${esc(lays[i].name || lays[i].id)}${lays[i].overnight ? " · overnight" : ""}${lays[i].duration < SHORT_LAYOVER ? " · tight connection" : lays[i].duration >= LONG_LAYOVER ? " · long wait" : ""}</div>` : ""}`).join("")}</div>
      ${o.co2 ? `<p class="small ink2">${Math.round(o.co2 / 1000)} kg CO₂e${o.co2_diff != null ? ` (${o.co2_diff > 0 ? "+" : ""}${o.co2_diff}% vs typical for this route)` : ""}</p>` : ""}
    </div>
  </article>`;
}

// ---------- filters ----------
/** The stop and layover filters as route limits, so tracking keeps them (see routes.json in the README). */
function limitsFromFilters(f, r) {
  const out = {};
  const maxStops = f.stops?.length ? Math.max(...f.stops) : null;
  if (maxStops != null && maxStops < 2) out.max_stops = r.max_stops != null ? Math.min(r.max_stops, maxStops) : maxStops;
  if (f.minLay) out.min_layover = f.minLay;
  if (f.maxLay) out.max_layover = f.maxLay;
  if (f.noOvernight) out.no_overnight = true;
  if (f.viaOff?.length) out.avoid = f.viaOff.join(",");
  return out;
}
const activeFilters = f => [f.stops, f.airlinesOff.length, f.times, f.maxDur, f.maxPrice, f.minLay, f.maxLay, f.noOvernight, f.viaOff?.length].filter(Boolean).length;
function filtersHtml(all, f) {
  const min = list => list.length ? money(Math.min(...list.map(o => o.price))) : "";
  const airlines = [...new Set(all.flatMap(o => o.airlines))].sort();
  const durs = all.map(o => o.duration).filter(Boolean), prices = all.map(o => o.price);
  const maxDur = Math.max(...durs, 60), minDur = Math.min(...durs, maxDur), maxP = Math.max(...prices), minP = Math.min(...prices);
  const opt = (name, value, label, list, checked) => `<label class="fopt ${list.length ? "" : "disabled"}"><input type="checkbox" data-f="${name}" value="${esc(value)}" ${checked ? "checked" : ""} ${list.length ? "" : "disabled"}><span>${esc(label)}</span><span class="p">${min(list)}</span></label>`;
  return `
    <div class="fgroup"><div class="row between"><h3 style="margin:0">Filters</h3>${activeFilters(f) ? `<button class="btn-ghost btn-sm" data-freset>Reset</button>` : ""}</div></div>
    <div class="fgroup"><h3>Stops</h3>
      ${[[0, "Non-stop"], [1, "1 stop"], [2, "2+ stops"]].map(([n, t]) => opt("stops", n, t, all.filter(o => Math.min(o.stops, 2) === n), !f.stops || f.stops.includes(n))).join("")}</div>
    ${layoverFilters(all, f, opt)}
    <div class="fgroup"><h3>Airlines</h3>
      ${airlines.map(a => opt("airline", a, a, all.filter(o => o.airlines.includes(a)), !f.airlinesOff.includes(a))).join("")}</div>
    <div class="fgroup"><h3>Departure time</h3>
      ${DEP_TIMES.map(([k, t, a, b]) => opt("time", k, `${t} (${String(a).padStart(2, "0")}–${String(b).padStart(2, "0")})`, all.filter(o => depBucket(o) === k), !f.times || f.times.includes(k))).join("")}</div>
    ${durs.length && maxDur > minDur ? `<div class="fgroup"><h3>Max travel time</h3>
      <input type="range" data-f="maxDur" min="${minDur}" max="${maxDur}" step="15" value="${f.maxDur || maxDur}"><div class="small ink2">Up to <b data-out="maxDur">${dur(f.maxDur || maxDur)}</b></div></div>` : ""}
    ${maxP > minP ? `<div class="fgroup"><h3>Max price</h3>
      <input type="range" data-f="maxPrice" min="${minP}" max="${maxP}" step="5" value="${f.maxPrice || maxP}"><div class="small ink2">Up to <b data-out="maxPrice">${money(f.maxPrice || maxP)}</b></div></div>` : ""}`;
}
/** Layover filters: connection time, longest wait, overnight layovers and connecting airports. */
function layoverFilters(all, f, opt) {
  const withStops = all.filter(o => o.stops && layMins(o).length);
  if (!withStops.length) return "";
  const shortest = Math.min(...withStops.map(shortestLay)), longest = Math.max(...withStops.map(longestLay));
  const minTop = Math.min(180, Math.max(...withStops.map(shortestLay)));
  const via = [...new Set(withStops.flatMap(o => o.layovers.map(l => l.id)).filter(Boolean))].sort();
  const name = id => AP[id]?.city || withStops.flatMap(o => o.layovers).find(l => l.id === id && l.name)?.name || id;
  return `<div class="fgroup"><h3>Layovers</h3>
      ${minTop > shortest ? `<div class="small ink2" style="margin-top:2px">Connection time at least <b data-out="minLay">${f.minLay ? dur(f.minLay) : "any"}</b></div>
      <input type="range" data-f="minLay" min="0" max="${Math.ceil(minTop / 15) * 15}" step="15" value="${f.minLay || 0}" aria-label="Minimum connection time">` : ""}
      ${longest > shortest ? `<div class="small ink2" style="margin-top:8px">Longest layover at most <b data-out="maxLay">${dur(f.maxLay || longest)}</b></div>
      <input type="range" data-f="maxLay" min="${Math.floor(shortest / 15) * 15}" max="${longest}" step="15" value="${f.maxLay || longest}" aria-label="Maximum layover">` : ""}
      ${withStops.some(o => o.layovers.some(l => l.overnight)) ? `<label class="fopt" style="margin-top:6px"><input type="checkbox" data-f="overnight" ${f.noOvernight ? "checked" : ""}><span>No overnight layovers</span></label>` : ""}
    </div>
    ${via.length ? `<div class="fgroup"><h3>Connecting airports</h3>
      ${via.map(id => opt("via", id, `${name(id)} (${id})`, withStops.filter(o => o.layovers.some(l => l.id === id)), !(f.viaOff || []).includes(id))).join("")}</div>` : ""}`;
}
function wireFilters(root, trips) {
  const s = ui.search, f = s.filters, redraw = () => { s.shown = 15; saveSearchState(); drawResultsPage(trips); };
  root.querySelector("[data-freset]")?.addEventListener("click", () => { s.filters = blankFilters(); redraw(); });
  root.querySelectorAll("input[type=checkbox][data-f]").forEach(cb => cb.onchange = () => {
    const vals = name => [...root.querySelectorAll(`input[data-f=${name}]:checked`)].map(x => x.value);
    if (cb.dataset.f === "stops") { const v = vals("stops").map(Number); f.stops = v.length === 3 ? null : v; }
    if (cb.dataset.f === "time") { const v = vals("time"); f.times = v.length === DEP_TIMES.length ? null : v; }
    if (cb.dataset.f === "airline") f.airlinesOff = [...root.querySelectorAll("input[data-f=airline]:not(:checked)")].map(x => x.value);
    if (cb.dataset.f === "via") f.viaOff = [...root.querySelectorAll("input[data-f=via]:not(:checked)")].map(x => x.value);
    if (cb.dataset.f === "overnight") f.noOvernight = cb.checked;
    redraw();
  });
  root.querySelectorAll("input[type=range][data-f]").forEach(r => {
    const k = r.dataset.f, out = root.querySelector(`[data-out=${k}]`);
    r.oninput = () => { out.textContent = k === "maxPrice" ? money(+r.value) : k === "minLay" && !+r.value ? "any" : dur(+r.value); };
    r.onchange = () => { f[k] = k === "minLay" ? +r.value || null : +r.value >= +r.max ? null : +r.value; redraw(); };
  });
}

function resultsSkeleton(withStrip) {
  const card = `<div class="flight"><div class="flight-main"><div class="flight-info"><i class="sk" style="width:40px;height:40px;border-radius:8px"></i><span><i class="sk" style="width:120px"></i><i class="sk" style="width:80px;margin-top:6px"></i></span><i class="sk" style="width:100%"></i><span></span></div><div class="flight-price"><i class="sk" style="width:80px;height:22px;margin-left:auto"></i></div></div></div>`;
  return `${withStrip ? `<div class="card card-pad" style="margin-bottom:14px"><i class="sk" style="width:30%"></i><div class="dstrip" style="margin-top:10px">${"<i class='sk' style='height:56px;border-radius:10px'></i>".repeat(5)}</div></div>` : ""}
    <div class="card insight-strip"><span class="spin" style="width:14px;height:14px"></span><span class="small ink2">Searching Google Flights…</span></div>
    ${card.repeat(5)}`;
}
