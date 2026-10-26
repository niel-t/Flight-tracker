// Explore: the cheapest destinations from an airport, for any time or a given month (Google Travel Explore).
// Scheduled runs collect these into data/deals.json; other combinations can be searched live (one credit).

const upcomingMonths = (n = 6) => { const m = new Date().getUTCMonth() + 1; return Array.from({ length: n }, (_, i) => ((m - 1 + i + 1) % 12) + 1); };
const sliceKey = q => `${q.origin}|${q.month}|${q.duration}|${q.cabin}${q.interest ? "|" + q.interest : ""}`;
const exDefaults = () => ({ origin: homeAirport(), month: 0, duration: (config.settings.deal_durations || ["week"])[0], cabin: (config.settings.deal_cabins || ["economy"])[0], interest: "" });

// Trip types are Google's travel interests (see flights/explore.py INTERESTS): Google ranks the places
// for each one with its own travel data, such as reviews of beaches, museums, nature and sights.
const TRIP_TYPES = {
  sun: { label: "Sun & beach", emoji: "☀️", google: "beaches" },
  city: { label: "City trip", emoji: "🏙️", google: "museums" },
  adventure: { label: "Adventure", emoji: "🥾", google: "outdoors" },
  sightseeing: { label: "Sightseeing", emoji: "🏛️", google: "history" },
};
const tripTypeChips = (id, value) => `<div class="chips" id="${id}" role="group" aria-label="Trip type">${[["", "✈️", "All trips"], ...Object.entries(TRIP_TYPES).map(([k, t]) => [k, t.emoji, t.label])]
  .map(([k, e, t]) => `<button type="button" class="chip" data-type="${k}" aria-pressed="${(value || "") === k}"><span aria-hidden="true">${e}</span>${t}</button>`).join("")}</div>`;
const onTripType = (el, fn) => el?.addEventListener("click", e => { const b = e.target.closest("[data-type]"); if (b) fn(b.dataset.type); });
let ex = { ...store.get("explore", {}), view: store.get("exView", "list"), region: "all", sort: "price", maxPrice: null };

function goExplore(q) {
  location.hash = `#/explore/${q.origin}/${q.month ?? 0}/${q.duration || "week"}/${q.cabin || "economy"}${q.interest ? "/" + q.interest : ""}`;
}

/**
 * Destinations of a slice, with country code, region and flag added. Returns null if not collected.
 * A trip type that wasn't searched for this month falls back to the month's popular destinations that
 * Google listed for that trip type in another month (marked `inferred`).
 */
function sliceDestinations(q) {
  const s = deals.slices?.[sliceKey(q)] || session.get("explore:" + sliceKey(q));
  if (s?.destinations) return { ...s, destinations: s.destinations.map(enrichDest) };
  if (!q.interest) return null;
  const popular = deals.slices?.[sliceKey({ ...q, interest: "" })], kinds = typedPlaces(q.origin, q.interest);
  const list = popular?.destinations?.filter(d => kinds.has(`${d.code}|${d.name}`));
  return list?.length ? { ...popular, inferred: true, destinations: list.map(enrichDest) } : null;
}
/** code|name of every place Google listed for a trip type from this origin, in any month. */
function typedPlaces(origin, interest) {
  const out = new Set();
  for (const s of Object.values(deals.slices || {})) if (s.origin === origin && s.interest === interest) for (const d of s.destinations || []) out.add(`${d.code}|${d.name}`);
  return out;
}
function enrichDest(d) {
  const cc = d.cc || countryCode(d.country) || AP[d.code]?.cc || "";
  return { ...d, cc, region: regionOf(cc) };
}

const gfUrl = ({ from, to, depart, ret, cabin = "economy", adults = 1 }) =>
  `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from} to ${to} on ${depart}${ret ? ` returning ${ret}` : " one way"} ${CABIN_NAME[cabin].toLowerCase()}${adults > 1 ? ` ${adults} adults` : ""}`)}&curr=${deals.currency || config.settings.currency || "EUR"}`;

function dealBadge(d) {
  if (d.drop_pct >= 10) return `<span class="badge good">${icon("down", "i xs")}${d.drop_pct}% below usual</span>`;
  if (d.new_low) return `<span class="badge good">Lowest price yet</span>`;
  return "";
}

/** A destination card. ctx = { origin, cabin } of the slice it came from. */
function destCard(d, ctx, opts = {}) {
  const nights = d.start_date && d.end_date ? daysBetween(d.start_date, d.end_date) : null;
  return `<article class="dest" data-i="${opts.i}">
    <div class="pic" style="background:${placeGradient(d.name)}">${placeImg(d)}<span class="flag" aria-hidden="true">${flag(d.cc)}</span>${dealBadge(d) ? `<span class="tag">${dealBadge(d)}</span>` : ""}</div>
    <div class="body">
      <div class="city">${esc(d.name)}</div>
      <div class="k">${esc(d.country)}${d.code ? ` · ${esc(d.code)}` : ""}</div>
      <div class="k">${d.start_date ? `${fmtDate(d.start_date)}${d.end_date ? ` – ${fmtDate(d.end_date)}` : ""}${nights ? ` · ${plural(nights, "night")}` : ""}` : ""}</div>
      <div class="k">${[stopsTxt(d.stops), dur(d.duration), d.airline].filter(Boolean).map(esc).join(" · ")}</div>
      <div class="foot">
        <div>${d.usual && d.usual > d.price ? `<div class="was">${money(d.usual)}</div>` : ""}<div class="price">${money(d.price)}</div></div>
        <span class="tiny muted">${opts.from ? `from ${esc(opts.from)}` : d.end_date ? "round trip" : ""}</span>
      </div>
    </div>
    ${opts.actions === false ? "" : `<div class="dest-actions">
      <button class="btn-primary btn-sm" data-act="flights">See flights</button>
      <button class="btn-sm" data-act="track" title="Watch this price">${icon("bell", "i xs")} Track</button>
    </div>`}
  </article>`;
}
/** Wires the See flights / Track buttons of destination cards inside `root`. */
function wireDestCards(root, list, ctx) {
  root.onclick = e => {
    const b = e.target.closest("[data-act]"), card = e.target.closest("[data-i]");
    if (!card) return;
    const d = list[+card.dataset.i];
    if (!d) return;
    if (!b) return openDest(d, ctx);
    if (b.dataset.act === "flights") openDest(d, ctx);
    if (b.dataset.act === "track") trackDest(d, ctx, b);
  };
}
function openDest(d, ctx) {
  if (d.code && d.start_date && liveApi) {
    const r = { id: "search", from: ctx.origin, to: d.code, trip: d.end_date ? "return" : "oneway", date_mode: "exact", flex: 0,
      depart_from: d.start_date, depart_to: d.start_date, ...(d.end_date ? { return_from: d.end_date, return_to: d.end_date } : {}),
      cabins: [ctx.cabin], adults: 1, max_stops: null, targets: {} };
    return startSearch(r);
  }
  window.open(d.link || gfUrl({ from: ctx.origin, to: d.code || d.name, depart: d.start_date, ret: d.end_date, cabin: ctx.cabin }), "_blank", "noopener");
}
function trackDest(d, ctx, btn) {
  if (!d.code || !d.start_date) return toast("This destination has no airport code or dates to track.");
  const nights = d.end_date ? daysBetween(d.start_date, d.end_date) : null;
  const r = { id: slug(`${ctx.origin}-${d.code}-${Date.now().toString(36).slice(-4)}`), name: `${d.name} deal`, from: ctx.origin, to: d.code,
    trip: nights ? "return" : "oneway", date_mode: "flexible", depart_from: addDays(d.start_date, -3) < today() ? addDays(today(), 1) : addDays(d.start_date, -3),
    depart_to: addDays(d.start_date, 3), ...(nights ? { length: "custom", nights } : {}), cabins: [ctx.cabin], adults: 1, max_stops: null, targets: {} };
  trackRoute(r, btn);
}

// ---------- page ----------
function viewExplore(params) {
  const [origin, month, duration, cabin, interest] = params;
  ex = { ...ex, ...exDefaults(), ...store.get("explore", {}), ...(origin ? { origin, month: +month || 0, duration: duration || "week", cabin: cabin || "economy", interest: interest in TRIP_TYPES ? interest : "" } : {}) };
  store.set("explore", { origin: ex.origin, month: ex.month, duration: ex.duration, cabin: ex.cabin, interest: ex.interest });
  const type = TRIP_TYPES[ex.interest];
  const months = [0, ...upcomingMonths()];
  return `
  <section class="band band-tight">
    <div class="wrap">
      <h1>Explore destinations</h1>
      <p class="sub">The cheapest ${type ? `${type.label.toLowerCase()} destinations` : "places to fly"} from ${esc(airportLabel(ex.origin))}, ${ex.month ? `in ${monthName(ex.month)}` : "any time in the next six months"}.</p>
      <div class="ex-controls" style="margin-top:18px">
        ${locPicker("ex-from", "From", ex.origin, "Airport")}
        <div class="field"><span class="label">When</span>${segmented("ex-month", months.map(m => [m, m ? monthName(m, "short") : "Any time"]), ex.month, "Month")}</div>
        <div class="ex-row" style="grid-column:1/-1">
          <div class="field"><span class="label">Trip length</span>${segmented("ex-duration", Object.entries(TRIP_LENGTH), ex.duration, "Trip length")}</div>
          <div class="field" style="width:200px"><span class="label">Class</span><select id="ex-cabin">${CABINS.map(c => `<option value="${c}" ${c === ex.cabin ? "selected" : ""}>${CABIN_NAME[c]}</option>`).join("")}</select></div>
        </div>
        <div class="field" style="grid-column:1/-1"><span class="label">Trip type</span>${tripTypeChips("ex-type", ex.interest)}</div>
      </div>
    </div>
  </section>
  <div class="page"><div class="wrap" id="ex-body"></div></div>`;
}

function afterExplore() {
  const pick = $("[data-loc=ex-from]");
  initLoc(pick);
  pick.querySelector("input[type=hidden]").addEventListener("input", e => {
    // one origin at a time: take the airport just added (the first one of a whole city)
    const code = codes(e.target.value).split(",").find(c => c !== ex.origin);
    if (code) goExplore({ ...ex, origin: code });
  });
  onSeg($("#ex-month"), v => goExplore({ ...ex, month: +v }));
  onSeg($("#ex-duration"), v => goExplore({ ...ex, duration: v }));
  $("#ex-cabin").onchange = e => goExplore({ ...ex, cabin: e.target.value });
  onTripType($("#ex-type"), v => goExplore({ ...ex, interest: v }));
  drawExplore();
}

function drawExplore() {
  const body = $("#ex-body"), slice = sliceDestinations(ex);
  if (!slice) return body.replaceChildren(notCollected());
  if (!slice.destinations.length) return body.innerHTML = emptyState("🛫", "No destinations found", slice.error ? esc(slice.error) : "Try another month or trip length.");
  const all = slice.destinations, regions = [...new Set(all.map(d => d.region))].sort();
  const top = Math.max(...all.map(d => d.price));
  if (ex.maxPrice == null || ex.maxPrice > top) ex.maxPrice = top;
  const shown = all.filter(d => (ex.region === "all" || d.region === ex.region) && d.price <= ex.maxPrice)
    .sort(ex.sort === "deal" ? (a, b) => (b.drop_pct ?? -99) - (a.drop_pct ?? -99) || a.price - b.price
        : ex.sort === "duration" ? (a, b) => (a.duration ?? 9999) - (b.duration ?? 9999) : (a, b) => a.price - b.price);
  body.innerHTML = `
    <div class="toolbar">
      <div class="grow"><b>${plural(shown.length, "destination")}</b> <span class="muted">· from ${money(Math.min(...all.map(d => d.price)))} · ${TRIP_LENGTH[ex.duration].toLowerCase()} trips · ${CABIN_NAME[ex.cabin].toLowerCase()} · checked ${ago(slice.checked || slice.searched_at)}</span></div>
      <label class="price-filter">Max <input type="range" id="ex-max" min="${Math.min(...all.map(d => d.price))}" max="${top}" step="5" value="${ex.maxPrice}"><b class="num" id="ex-max-v">${money(ex.maxPrice)}</b></label>
      <select id="ex-sort" style="width:auto"><option value="price">Cheapest first</option><option value="deal" ${ex.sort === "deal" ? "selected" : ""}>Best deals first</option><option value="duration" ${ex.sort === "duration" ? "selected" : ""}>Shortest flight</option></select>
      ${segmented("ex-view", [["list", `${icon("list", "i sm")} List`], ["map", `${icon("map", "i sm")} Map`]], ex.view, "View")}
    </div>
    ${ex.interest ? `<p class="small ink2" style="margin:-4px 0 14px">${TRIP_TYPES[ex.interest].emoji} ${slice.inferred
      ? `Not searched for ${monthName(ex.month)} yet: these are this month's destinations that Google also lists for ${TRIP_TYPES[ex.interest].google} in other months.`
      : `Destinations Google ranks for ${TRIP_TYPES[ex.interest].google}, based on its travel data such as reviews.`}</p>` : ""}
    <div class="chips" style="margin-bottom:18px">${[["all", "All regions"], ...regions.map(r => [r, r])].map(([v, t]) => `<button class="chip" data-region="${esc(v)}" aria-pressed="${ex.region === v}">${esc(t)}</button>`).join("")}</div>
    <div id="ex-results"></div>`;
  const results = $("#ex-results");
  if (!shown.length) results.innerHTML = emptyState("🔎", "Nothing matches these filters", "Raise the maximum price or pick another region.");
  else if (ex.view === "map") drawExploreMap(results, shown);
  else { results.innerHTML = `<div class="dest-grid">${shown.map((d, i) => destCard(d, ex, { i })).join("")}</div>`; wireDestCards(results, shown, { ...ex }); }
  $("#ex-max").oninput = e => { $("#ex-max-v").textContent = money(+e.target.value); };
  $("#ex-max").onchange = e => { ex.maxPrice = +e.target.value; drawExplore(); };
  $("#ex-sort").onchange = e => { ex.sort = e.target.value; drawExplore(); };
  onSeg($("#ex-view"), v => { ex.view = v; store.set("exView", v); drawExplore(); });
  body.querySelectorAll("[data-region]").forEach(b => b.onclick = () => { ex.region = b.dataset.region; drawExplore(); });
}

function notCollected() {
  const el = document.createElement("div"), isHome = homeAirports().includes(ex.origin);
  el.innerHTML = emptyState(TRIP_TYPES[ex.interest]?.emoji || "🧭", `${TRIP_TYPES[ex.interest] ? TRIP_TYPES[ex.interest].label + " · " : ""}${ex.month ? monthName(ex.month) : "Any time"} from ${esc(airportLabel(ex.origin))} hasn't been collected yet`,
    !isHome ? `${esc(ex.origin)} isn't one of your home airports. Add it in Settings → Deal finder to collect it automatically.`
    : ex.interest && !collectsType(ex) ? `Trip types are collected for any time and the next ${plural(+(config.settings.deal_interest_months ?? 3), "month")}, to save search credits. Pick another month or search now.`
    : "The scheduled runs collect one combination at a time, so this one follows soon.",
    liveApi ? `<button class="btn-primary" data-live>${icon("search", "i sm")} Search now (1 search credit)</button>` : "");
  el.querySelector("[data-live]")?.addEventListener("click", liveExplore);
  return el;
}
/** Whether the scheduled runs collect this trip type and month (see flights/explore.py slices). */
function collectsType(q) {
  const st = config.settings;
  return (st.deal_interests || Object.keys(TRIP_TYPES)).includes(q.interest)
    && [0, ...upcomingMonths(+(st.deal_interest_months ?? 3))].includes(q.month);
}
async function liveExplore() {
  const body = $("#ex-body"), q = { ...ex };
  if (liveStatus?.passcode && !store.get("passcode", "")) return askPasscode(liveExplore, null, body);
  body.innerHTML = `<div class="dest-grid">${`<div class="card" style="height:300px;padding:14px"><i class="sk" style="height:120px"></i><i class="sk" style="width:60%;margin-top:14px"></i><i class="sk" style="width:40%;margin-top:8px"></i></div>`.repeat(8)}</div>`;
  try {
    const p = new URLSearchParams({ from: q.origin, month: q.month, duration: q.duration, cabin: q.cabin, currency: config.settings.currency || "EUR", ...(q.interest ? { interest: q.interest } : {}) });
    const res = await live(`/explore?${p}`);
    session.set("explore:" + sliceKey(q), { ...res, checked: res.searched_at });
    if (sliceKey(q) === sliceKey(ex)) drawExplore();
  } catch (e) {
    if (e.code === "passcode") { store.set("passcode", ""); return askPasscode(liveExplore, "That passcode didn't work. Try again.", body); }
    body.replaceChildren(errorPanel(e, liveExplore));
  }
}

// ---------- map ----------
const HOME_COORDS = { AMS: [52.31, 4.76], RTM: [51.96, 4.44], EIN: [51.45, 5.37], BRU: [50.90, 4.48], DUS: [51.29, 6.77], CGN: [50.87, 7.14], FRA: [50.04, 8.56],
  MUC: [48.35, 11.79], LHR: [51.47, -0.45], LGW: [51.15, -0.18], CDG: [49.01, 2.55], ZRH: [47.46, 8.55], CPH: [55.62, 12.65], MAD: [40.49, -3.57], JFK: [40.64, -73.78] };
let leafletReady = null;
function loadLeaflet() {
  return leafletReady ||= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css"; // Leaflet 1.9.4 (BSD-2), kept in the repo
    document.head.append(css);
    const js = document.createElement("script");
    js.src = "vendor/leaflet/leaflet.js";
    js.onload = () => resolve(window.L); js.onerror = () => { leafletReady = null; reject(new Error("The map couldn't load.")); };
    document.head.append(js);
  });
}
async function drawExploreMap(el, list) {
  const withPos = list.filter(d => d.lat != null && d.lon != null);
  el.innerHTML = `<div class="map" id="ex-map"></div>${withPos.length < list.length ? `<p class="tiny muted" style="margin-top:8px">${list.length - withPos.length} destinations have no map position and are only in the list.</p>` : ""}`;
  let L;
  try { L = await loadLeaflet(); } catch (e) { el.innerHTML = emptyState("🗺️", e.message, "Switch to the list view."); return; }
  const node = $("#ex-map"); if (!node) return;
  const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
  const map = L.map(node, { worldCopyJump: true, zoomControl: true, attributionControl: true });
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`, {
    maxZoom: 10, subdomains: "abcd", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
  const home = HOME_COORDS[ex.origin];
  if (home) L.marker(home, { icon: L.divIcon({ className: "", html: `<span class="map-pin home">${esc(ex.origin)}</span>`, iconSize: [0, 0] }), interactive: false }).addTo(map);
  const bounds = [];
  for (const d of withPos) {
    const deal = d.drop_pct >= 10 || d.new_low;
    const m = L.marker([d.lat, d.lon], { icon: L.divIcon({ className: "", html: `<span class="map-pin ${deal ? "deal" : ""}">${money(d.price)}</span>`, iconSize: [0, 0] }), title: `${d.name}: ${money(d.price)}` }).addTo(map);
    const pop = document.createElement("div");
    pop.style.minWidth = "200px";
    pop.innerHTML = `<b style="font-size:15px">${flag(d.cc)} ${esc(d.name)}</b><br><span class="small ink2">${d.start_date ? `${fmtDate(d.start_date)} – ${fmtDate(d.end_date)} · ` : ""}${esc(stopsTxt(d.stops))}</span>
      <div class="row between" style="margin-top:8px"><b style="font-size:18px">${money(d.price)}</b>${dealBadge(d)}</div>
      <button class="btn-primary btn-sm" style="width:100%;margin-top:8px">See flights</button>`;
    pop.querySelector("button").onclick = () => openDest(d, { ...ex });
    m.bindPopup(pop);
    bounds.push([d.lat, d.lon]);
  }
  if (home) bounds.push(home);
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5 }); else map.setView([30, 10], 2);
}
