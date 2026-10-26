// Deals: the best-value fares from the collected Explore data (measured against each destination's usual price)
// and from tracked routes.

let dl = { origin: null, cabin: null, duration: null };

/** Every collected destination for an origin/cabin/trip length, each with the slice it came from. */
function collectedDeals(origin, cabin, duration) {
  const out = [];
  for (const s of Object.values(deals.slices || {})) {
    if (s.origin !== origin || s.cabin !== cabin || (duration && s.duration !== duration) || !s.destinations) continue;
    for (const d of s.destinations) out.push({ ...enrichDest(d), month: s.month, trip: s.duration, checked: s.checked });
  }
  return out;
}
/** One entry per destination: the biggest drop (or the lowest price). */
function bestPerDestination(list, by = "price") {
  const best = new Map();
  for (const d of list) {
    const k = `${d.code}|${d.name}`, cur = best.get(k);
    const better = by === "drop" ? (d.drop_pct ?? -99) > (cur?.drop_pct ?? -99) || ((d.drop_pct ?? -99) === (cur?.drop_pct ?? -99) && d.price < cur.price) : !cur || d.price < cur.price;
    if (better) best.set(k, d);
  }
  return [...best.values()];
}
const collectedOrigins = () => [...new Set(Object.values(deals.slices || {}).map(s => s.origin))];
const collectedCabins = o => CABINS.filter(c => Object.values(deals.slices || {}).some(s => s.origin === o && s.cabin === c));
const collectedDurations = o => Object.keys(TRIP_LENGTH).filter(d => Object.values(deals.slices || {}).some(s => s.origin === o && s.duration === d));

function viewDeals() {
  const origins = collectedOrigins();
  dl.origin = origins.includes(dl.origin) ? dl.origin : origins.includes(homeAirport()) ? homeAirport() : origins[0] || homeAirport();
  const cabins = collectedCabins(dl.origin), durations = collectedDurations(dl.origin);
  dl.cabin = cabins.includes(dl.cabin) ? dl.cabin : cabins[0] || "economy";
  dl.duration = durations.includes(dl.duration) ? dl.duration : durations[0] || "week";
  return `
  <section class="band band-tight">
    <div class="wrap">
      <h1>Flight deals</h1>
      <p class="sub">The best-value flights from ${esc(airportLabel(dl.origin))}, found automatically${deals.updated ? ` · updated ${ago(deals.updated)}` : ""}.</p>
      <div class="ex-row" style="margin-top:16px">
        ${origins.length > 1 ? `<div class="field ex-controls" style="display:block"><span class="label">From</span>${segmented("dl-origin", origins.map(o => [o, airportLabel(o)]), dl.origin, "From")}</div>` : ""}
        ${cabins.length > 1 ? `<div class="field ex-controls" style="display:block"><span class="label">Class</span>${segmented("dl-cabin", cabins.map(c => [c, CABIN_SHORT[c]]), dl.cabin, "Class")}</div>` : ""}
        ${durations.length > 1 ? `<div class="field ex-controls" style="display:block"><span class="label">Trip length</span>${segmented("dl-duration", durations.map(d => [d, TRIP_LENGTH[d]]), dl.duration, "Trip length")}</div>` : ""}
      </div>
    </div>
  </section>
  <div class="page"><div class="wrap" id="dl-body"></div></div>`;
}

function afterDeals() {
  onSeg($("#dl-origin"), v => { dl.origin = v; route(); });
  onSeg($("#dl-cabin"), v => { dl.cabin = v; route(); });
  onSeg($("#dl-duration"), v => { dl.duration = v; route(); });
  const body = $("#dl-body"), ctx = { origin: dl.origin, cabin: dl.cabin };
  const all = collectedDeals(dl.origin, dl.cabin, dl.duration);
  if (!all.length) {
    body.innerHTML = emptyState("🏷️", "No deals collected yet", `The scheduled runs look up the cheapest destinations from your home airports (${esc(homeAirports().join(", "))}). The first ones appear after the next run.`,
      `<a class="btn-primary btn" href="#/explore">${icon("explore", "i sm")} Explore now</a>`) + trackedDealsSection();
    return wireTracked(body);
  }
  const drops = bestPerDestination(all.filter(d => d.drop_pct >= 10), "drop").sort((a, b) => b.drop_pct - a.drop_pct);
  const cheapest = bestPerDestination(all).sort((a, b) => a.price - b.price);
  const short = cheapest.filter(d => d.duration && d.duration <= 180);
  const long = cheapest.filter(d => d.duration && d.duration >= 420);
  const hasHistory = all.some(d => d.usual != null);
  const row = (id, title, sub, list, more) => list.length ? `<section class="section">
      <div class="section-head"><div><h2>${title}</h2><p class="small ink2">${sub}</p></div>${more || ""}</div>
      <div class="scroller" id="${id}">${list.slice(0, 12).map((d, i) => destCard(d, ctx, { actions: false, i })).join("")}</div></section>` : "";
  body.innerHTML = `
    ${drops.length ? row("dl-drops", "Biggest price drops", "Cheaper than these destinations usually cost, based on our own daily price history.", drops)
      : `<div class="banner info" style="margin-bottom:28px">${icon("clock", "i sm")} <span>${hasHistory ? "No destination is clearly below its usual price right now. Here are the cheapest ones." : "Deals are measured against each destination's usual price, which needs a few days of history. Until then, here are the cheapest destinations."}</span></div>`}
    ${row("dl-cheap", "Cheapest destinations", `${TRIP_LENGTH[dl.duration]} round trips in ${CABIN_NAME[dl.cabin].toLowerCase()}, any month.`, cheapest,
      `<a class="btn btn-sm" href="#/explore/${dl.origin}/0/${dl.duration}/${dl.cabin}">See all ${icon("next", "i xs")}</a>`)}
    ${row("dl-short", "Short flights", "Under 3 hours, for a quick getaway.", short)}
    ${row("dl-long", "Long-haul for less", "Flights of 7 hours or more.", long)}
    ${byMonthSection(all, ctx)}
    ${trackedDealsSection()}`;
  for (const [id, list] of [["dl-drops", drops], ["dl-cheap", cheapest], ["dl-short", short], ["dl-long", long]]) {
    const el = $("#" + id); if (el) wireDestCards(el, list, ctx);
  }
  wireTracked(body);
}

function byMonthSection(all, ctx) {
  const rows = upcomingMonths().map(m => {
    const list = bestPerDestination(all.filter(d => d.month === m)).sort((a, b) => a.price - b.price);
    return { m, list };
  });
  if (!rows.some(r => r.list.length)) return "";
  return `<section class="section">
    <div class="section-head"><div><h2>Cheapest by month</h2><p class="small ink2">The lowest fares for each of the coming months.</p></div></div>
    <div class="card" style="overflow:hidden"><table class="list-table">
      <thead><tr><th>Month</th><th>Cheapest</th><th class="hide-sm">Also cheap</th><th class="r">From</th><th></th></tr></thead>
      <tbody>${rows.map(({ m, list }) => `<tr class="click" data-month="${m}">
        <td><b>${monthName(m)}</b></td>
        <td>${list[0] ? `${flag(list[0].cc)} ${esc(list[0].name)} <span class="muted small">${esc(list[0].country)}</span>` : `<span class="muted">Not collected yet</span>`}</td>
        <td class="hide-sm small ink2">${list.slice(1, 4).map(d => `${esc(d.name)} ${money(d.price)}`).join(" · ")}</td>
        <td class="r"><b class="num">${list[0] ? money(list[0].price) : "–"}</b></td>
        <td class="r">${icon("next", "i sm")}</td></tr>`).join("")}</tbody></table></div></section>`;
}

function trackedDealsSection() {
  const rows = [];
  for (const r of config.routes) for (const c of cabinsOf(r)) {
    const best = entry(r.id, c).cheapest; if (!best) continue;
    const tgt = r.targets?.[c], typ = best.typical?.[0];
    rows.push({ r, c, best, tgt, score: Math.max(typ ? 1 - best.price / typ : 0, tgt ? 1 - best.price / tgt : 0) + (best.level === "low" ? .05 : 0) });
  }
  if (!rows.length) return "";
  rows.sort((a, b) => b.score - a.score);
  return `<section class="section">
    <div class="section-head"><div><h2>Your tracked routes</h2><p class="small ink2">Best fare per route and class right now.</p></div><a class="btn btn-sm" href="#/tracked">Manage ${icon("next", "i xs")}</a></div>
    <div class="card" style="overflow:hidden"><table class="list-table"><tbody>${rows.slice(0, 8).map(({ r, c, best, tgt }) => `
      <tr class="click" data-route="${esc(r.id)}/${c}">
        <td><b>${esc(routeTitle(r))}</b><br><span class="small ink2">${CABIN_NAME[c]} · ${fmtDate(best.date)}${best.return_date ? ` – ${fmtDate(best.return_date)}` : ""} · ${stopsTxt(best.stops)}</span></td>
        <td class="hide-sm">${levelBadge(best)} ${tgt && best.price <= tgt ? `<span class="badge target">Below your target</span>` : ""}</td>
        <td class="r"><b class="num" style="font-size:17px">${money(best.price)}</b></td></tr>`).join("")}</tbody></table></div></section>`;
}
function wireTracked(body) {
  body.querySelectorAll("[data-route]").forEach(tr => tr.onclick = () => location.hash = `#/route/${tr.dataset.route}`);
  body.querySelectorAll("[data-month]").forEach(tr => tr.onclick = () => goExplore({ origin: dl.origin, month: +tr.dataset.month, duration: dl.duration, cabin: dl.cabin }));
}
