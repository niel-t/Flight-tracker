// Tracked routes (with the cheapest fare per class) and the price drops they triggered.

function trackedTabs(active) {
  const recent = alerts.filter(a => Date.now() - new Date(a.time) < 7 * 864e5).length;
  return `<nav class="tabs" aria-label="Tracked">
    <a href="#/tracked" ${active === "routes" ? 'aria-current="page"' : ""}>Routes <span class="badge">${config.routes.length}</span></a>
    <a href="#/tracked/drops" ${active === "drops" ? 'aria-current="page"' : ""}>Price drops ${recent ? `<span class="count">${recent}</span>` : ""}</a>
  </nav>`;
}

function viewTracked(params) {
  const tab = params[0] === "drops" ? "drops" : "routes";
  return `
  <section class="band band-tight"><div class="wrap">
    <h1>Tracked flights</h1>
    <p class="sub">Checked automatically twice a day. You get a phone notification (ntfy) when a fare drops ${config.settings.drop_threshold_pct ?? 5}% or more, or below your target.</p>
  </div></section>
  <div class="page"><div class="wrap">
    ${trackedTabs(tab)}
    ${tab === "drops" ? dropsList() : routesTable()}
  </div></div>`;
}

function routesTable() {
  if (!config.routes.length) return emptyState("🔔", "You're not tracking any routes yet", "Search for flights or pick a destination in Explore, then click <b>Track</b>.", `<a class="btn btn-primary" href="#/">${icon("search", "i sm")} Search flights</a>`);
  return `<div class="card" style="overflow:hidden"><table class="list-table">
    <thead><tr><th>Route</th>${CABINS.map(c => `<th class="r hide-sm">${CABIN_SHORT[c]}</th>`).join("")}<th class="r">Lowest</th><th></th></tr></thead>
    <tbody>${config.routes.map(r => {
      const per = Object.fromEntries(cabinsOf(r).map(c => [c, entry(r.id, c).cheapest]));
      const low = Object.entries(per).filter(([, b]) => b).sort((a, b) => a[1].price - b[1].price)[0];
      return `<tr class="click" data-route="${esc(r.id)}">
        <td><div class="with-thumb">${routeImg(r)}<div><b>${esc(routeTitle(r))}</b><br><span class="small ink2">${esc(r.from)} → ${esc(r.to)} · ${tripTxt(r)} · ${datesTxt(r)}</span></div></div></td>
        ${CABINS.map(c => {
          if (!(c in per)) return `<td class="r hide-sm muted">–</td>`;
          const b = per[c], tgt = r.targets?.[c];
          return `<td class="r hide-sm"><a href="#/route/${encodeURIComponent(r.id)}/${c}" class="num ${tgt && b && b.price <= tgt ? "down" : ""}" style="color:inherit;font-weight:600">${b ? money(b.price) : "…"}</a>${b?.level === "low" ? `<br><span class="tiny down">low</span>` : ""}</td>`;
        }).join("")}
        <td class="r">${low ? `<b class="num" style="font-size:17px">${money(low[1].price)}</b><br><span class="tiny muted">${CABIN_SHORT[low[0]]}</span>` : `<span class="small muted">Waiting</span>`}</td>
        <td class="r"><button class="btn-ghost icon-btn" data-edit="${esc(r.id)}" aria-label="Edit ${esc(routeTitle(r))}">${icon("edit", "i sm")}</button></td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
}

function dropsList() {
  if (!alerts.length) return emptyState("📉", "No price drops yet", "They show up here, and on your phone, as soon as a tracked fare drops.");
  return `<div class="card" style="overflow:hidden"><table class="list-table"><tbody>${alerts.slice(0, 50).map(a => `
    <tr class="click" data-route="${esc(a.route)}/${a.cabin}">
      <td><b>${esc(a.name)}</b> <span class="small ink2">· ${CABIN_NAME[a.cabin]}</span><br><span class="small ink2">${fmtDay(a.date)}${a.return_date ? ` – ${fmtDay(a.return_date)}` : ""} · ${ago(a.time)}</span></td>
      <td class="hide-sm"><span class="badge ${a.reason === "below target" ? "target" : "good"}">${esc(a.reason)}</span></td>
      <td class="r"><b class="num down" style="font-size:17px">${money(a.price)}</b>${a.previous ? `<br><s class="small muted">${money(a.previous)}</s>` : ""}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function afterTracked() {
  document.querySelectorAll("#app [data-route]").forEach(tr => tr.onclick = e => { if (!e.target.closest("a, button")) location.hash = `#/route/${tr.dataset.route}`; });
}
