// Home: the flight search, then inspiration from the collected deals and a summary of tracked routes.

function viewHome() {
  return `
  <section class="band hero">
    <div class="wrap">
      <h1>Find cheap flights, in every class</h1>
      <p class="sub" style="margin-bottom:22px">Search Google Flights prices, explore where you can go, and let the tracker watch fares for you.</p>
      ${searchPanel()}
    </div>
  </section>
  <div class="page"><div class="wrap" id="home-body"></div></div>`;
}

function afterHome() {
  initSearchPanel($("#search-form"));
  const body = $("#home-body"), origin = homeAirport();
  const cabin = (config.settings.deal_cabins || ["economy"])[0], duration = (config.settings.deal_durations || ["week"])[0];
  const ctx = { origin, cabin };
  const all = collectedDeals(origin, cabin, duration);
  const cheapest = bestPerDestination(all).sort((a, b) => a.price - b.price);
  const drops = bestPerDestination(all.filter(d => d.drop_pct >= 10), "drop").sort((a, b) => b.drop_pct - a.drop_pct);
  body.innerHTML = `
    ${drops.length ? `<section class="section">
      <div class="section-head"><div><h2>Deals right now</h2><p class="small ink2">Below what these destinations usually cost from ${esc(airportLabel(origin))}.</p></div><a class="btn btn-sm" href="#/deals">All deals ${icon("next", "i xs")}</a></div>
      <div class="scroller" id="home-drops">${drops.slice(0, 8).map((d, i) => destCard(d, ctx, { actions: false, i })).join("")}</div></section>` : ""}
    <section class="section">
      <div class="section-head"><div><h2>Cheapest destinations from ${esc(airportLabel(origin))}</h2><p class="small ink2">${TRIP_LENGTH[duration]} round trips in ${CABIN_NAME[cabin].toLowerCase()}, any time in the next six months.</p></div>
        <a class="btn btn-sm" href="#/explore/${origin}/0/${duration}/${cabin}">Explore ${icon("next", "i xs")}</a></div>
      ${cheapest.length ? `<div class="scroller" id="home-cheap">${cheapest.slice(0, 12).map((d, i) => destCard(d, ctx, { actions: false, i })).join("")}</div>`
        : emptyState("🧭", "Destinations appear after the next scheduled run", `The tracker looks up the cheapest destinations from ${esc(homeAirports().join(", "))} twice a day. Change your home airports in Settings.`)}
    </section>
    <section class="section">
      <div class="section-head"><div><h2>Plan by month</h2><p class="small ink2" id="pm-sub"></p></div></div>
      ${tripTypeChips("pm-type", store.get("tripType", ""))}
      <div class="months-grid" id="pm-grid" style="margin-top:14px"></div>
    </section>
    ${homeTracked()}`;
  for (const [id, list] of [["home-drops", drops], ["home-cheap", cheapest]]) { const el = $("#" + id); if (el) wireDestCards(el, list, ctx); }
  const drawMonths = type => {
    const t = TRIP_TYPES[type];
    $("#pm-sub").textContent = t ? `The cheapest ${t.label.toLowerCase()} destination for each month, from Google's ${t.google} picks (ranked with its travel data, such as reviews).`
      : "The lowest fare we found for each month.";
    const tiles = [0, ...upcomingMonths()].map(m => ({ m, best: sliceDestinations({ origin, month: m, duration, cabin, interest: type })?.destinations.slice().sort((a, b) => a.price - b.price)[0] }));
    if (t && !tiles.some(x => x.best)) {
      $("#pm-grid").innerHTML = `<div style="grid-column:1/-1">${emptyState(t.emoji, `${t.label} picks aren't collected yet`, `The scheduled runs fetch Google's ${t.google} picks from ${esc(airportLabel(origin))} soon; they then fill in every month.`)}</div>`;
    } else $("#pm-grid").innerHTML = tiles.map(({ m, best }) => {
      return `<a class="card month-tile" href="#/explore/${origin}/${m}/${duration}/${cabin}${type ? "/" + type : ""}">
        <span class="pic" style="background:${placeGradient(best?.name || monthName(m || 1))}">${best ? placeImg(best) : ""}<span class="m">${m ? monthName(m) : "Any time"}</span></span>
        <span class="txt"><span class="small ink2">${best ? `${flag(best.cc)} ${esc(best.name)}` : "Not collected yet"}</span>
        <span class="p">${best ? `<span class="small muted" style="font-weight:500">from</span> ${money(best.price)}` : "–"}</span></span>
      </a>`;
    }).join("");
    $("#pm-type").querySelectorAll("[data-type]").forEach(b => b.setAttribute("aria-pressed", b.dataset.type === type));
  };
  drawMonths(store.get("tripType", ""));
  onTripType($("#pm-type"), v => { store.set("tripType", v); drawMonths(v); });
  body.querySelectorAll("[data-route]").forEach(tr => tr.onclick = () => location.hash = `#/route/${tr.dataset.route}`);
}

function homeTracked() {
  if (!config.routes.length) return "";
  const rows = config.routes.map(r => {
    const best = cabinsOf(r).map(c => ({ c, b: entry(r.id, c).cheapest })).filter(x => x.b).sort((a, b) => a.b.price - b.b.price)[0];
    return { r, best };
  });
  const recent = alerts.filter(a => Date.now() - new Date(a.time) < 14 * 864e5).slice(0, 3);
  return `<section class="section">
    <div class="section-head"><div><h2>Your tracked routes</h2><p class="small ink2">Checked automatically; you get a notification when a fare drops.</p></div><a class="btn btn-sm" href="#/tracked">All tracked ${icon("next", "i xs")}</a></div>
    <div class="card" style="overflow:hidden"><table class="list-table"><tbody>${rows.map(({ r, best }) => `
      <tr class="click" data-route="${esc(r.id)}${best ? "/" + best.c : ""}">
        <td><div class="with-thumb">${routeImg(r)}<div><b>${esc(routeTitle(r))}</b><br><span class="small ink2">${esc(r.from)} → ${esc(r.to)} · ${datesTxt(r)}</span></div></div></td>
        <td class="hide-sm small ink2">${best ? `${CABIN_NAME[best.c]} · ${fmtDate(best.b.date)}${best.b.return_date ? ` – ${fmtDate(best.b.return_date)}` : ""}` : "Waiting for the first check"}</td>
        <td class="r">${best ? `<span class="small muted">from</span> <b class="num" style="font-size:17px">${money(best.b.price)}</b>` : "–"}</td></tr>`).join("")}</tbody></table></div>
    ${recent.length ? `<div class="card" style="margin-top:12px;overflow:hidden"><table class="list-table"><tbody>${recent.map(a => `
      <tr class="click" data-route="${esc(a.route)}/${a.cabin}"><td>${icon("down", "i sm")} <b>${esc(a.name)}</b> <span class="small ink2">· ${CABIN_NAME[a.cabin]} · ${esc(a.reason)}</span></td>
      <td class="r"><b class="num down">${money(a.price)}</b>${a.previous ? ` <s class="small muted">${money(a.previous)}</s>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </section>`;
}
