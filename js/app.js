// Router, header and start-up.

const VIEWS = {
  home: [viewHome, afterHome],
  explore: [viewExplore, afterExplore],
  deals: [viewDeals, afterDeals],
  search: [viewResults, afterResults],
  tracked: [viewTracked, afterTracked],
  route: [viewRoute, afterRoute],
};
const NAV_OF = { home: "home", search: "home", explore: "explore", deals: "deals", tracked: "tracked", route: "tracked" };

function route() {
  const [name, ...params] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (name === "settings") { openSettings(); if (route._rendered) return; }
  route._rendered = true;
  const view = VIEWS[name] ? name : "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.dataset.nav === NAV_OF[view] ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  renderStatus();
  const [render, after] = VIEWS[view];
  $("#app").innerHTML = render(params);
  after(params);
  if (route._last !== location.hash) { scrollTo({ top: 0 }); route._last = location.hash; }
  document.title = { home: "Flight Tracker: cheap flights in every class", explore: "Explore destinations · Flight Tracker", deals: "Flight deals · Flight Tracker",
    search: "Flight results · Flight Tracker", tracked: "Tracked flights · Flight Tracker", route: "Route prices · Flight Tracker" }[view];
}
addEventListener("hashchange", route);

function renderStatus() {
  const s = $("#status"), updated = [latest.updated, deals.updated].filter(Boolean).sort().pop();
  if (updated) {
    const hrs = (Date.now() - new Date(updated)) / 3.6e6;
    s.innerHTML = `<span class="dot ${hrs < 14 ? "good" : hrs < 36 ? "warn" : "crit"}"></span><span class="label">${latest.demo || deals.demo ? "Demo data · " : ""}Updated ${ago(updated)}</span>`;
    s.title = `Prices last checked ${new Date(updated).toLocaleString()}`;
    $("#foot-updated").textContent = `Last check: ${new Date(updated).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  } else s.innerHTML = `<span class="dot"></span><span class="label">No checks yet</span>`;
  const recent = alerts.filter(a => Date.now() - new Date(a.time) < 7 * 864e5).length;
  document.querySelectorAll("[data-count]").forEach(el => { el.textContent = recent; el.classList.toggle("hidden", !recent); });
}

$("#btn-settings").onclick = openSettings;
$("#btn-run").onclick = async () => {
  const b = $("#btn-run"); b.disabled = true; b.innerHTML = `<span class="spin"></span>`;
  try { await runChecksNow(); toast("Checking tracked routes and deals now. New prices appear in a few minutes."); }
  catch (e) { toast(e.message); } finally { b.disabled = false; b.innerHTML = icon("refresh"); }
};
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
addEventListener("unhandledrejection", e => { console.error(e.reason); toast(e.reason?.message || "Something went wrong. Try again."); });
addEventListener("error", e => { if (e.message) toast("Something went wrong on this page. Reload to try again."); });

$("#app").innerHTML = `<div class="page"><div class="wrap"><p class="muted">Loading…</p></div></div>`;
loadData().then(route);
