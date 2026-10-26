// The Settings sheet (deal finder, search budget, live search, GitHub, theme) and the route editor.

const RUNS_PER_DAY = 2; // see .github/workflows/check-flights.yml

function openSettings() {
  const f = $("#settings-form"), s = config.settings;
  $("#s-home").innerHTML = locPicker("home_airports", "Home airports", homeAirports().join(","), "Add an airport");
  initLoc($("[data-loc=home_airports]"));
  $("#s-cabins").innerHTML = CABINS.map(c => `<label><input type="checkbox" name="deal_cabin" value="${c}" ${(s.deal_cabins || ["economy"]).includes(c) ? "checked" : ""}>${CABIN_SHORT[c]}</label>`).join("");
  $("#s-durations").innerHTML = Object.entries(TRIP_LENGTH).map(([k, t]) => `<label><input type="checkbox" name="deal_duration" value="${k}" ${(s.deal_durations || ["week"]).includes(k) ? "checked" : ""}>${t}</label>`).join("");
  $("#s-types").innerHTML = Object.entries(TRIP_TYPES).map(([k, t]) => `<label><input type="checkbox" name="deal_interest" value="${k}" ${(s.deal_interests || Object.keys(TRIP_TYPES)).includes(k) ? "checked" : ""}>${t.emoji} ${t.label}</label>`).join("");
  f.elements.explore_per_run.value = s.explore_per_run ?? 1;
  f.elements.searches_per_run.value = s.searches_per_run ?? 1;
  f.elements.currency.value = s.currency || "EUR";
  f.elements.drop_threshold_pct.value = s.drop_threshold_pct ?? 5;
  f.elements.repo.value = gh().repo; f.elements.token.value = gh().token;
  f.elements.passcode.value = store.get("passcode", "");
  $("#s-live").innerHTML = !liveApi ? "Not set up yet. Follow <b>Live search</b> in the README to search Google Flights straight from this page."
    : !liveStatus ? `Can't reach the search service at <code>${esc(liveApi)}</code>.`
    : `Connected${liveStatus.search ? "" : ", but <b>SERPAPI_KEY</b> is missing"}. ${liveStatus.write ? "Saving routes works without a GitHub token." : "Add <b>SEARCH_PASSCODE</b> and <b>TRACKER_GITHUB_TOKEN</b> to save routes from here."}`;
  $("#s-pass-field").hidden = !liveStatus?.passcode;
  const t = store.get("theme", "auto"); $("#s-theme").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === t));
  monthlyEstimate();
  if (!$("#dlg-settings").open) $("#dlg-settings").showModal();
}
function monthlyEstimate() {
  const el = $("#settings-form").elements;
  $("#s-month").textContent = (((+el.explore_per_run.value || 0) + (+el.searches_per_run.value || 0)) * RUNS_PER_DAY * 30).toLocaleString();
}
$("#settings-form").addEventListener("input", monthlyEstimate);
$("#s-test").onclick = runDiagnostics;
$("#s-theme").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  store.set("theme", b.dataset.t); applyTheme(b.dataset.t);
  $("#s-theme").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  route();
};
$("#settings-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, el = f.elements;
  store.set("repo", el.repo.value.trim()); store.set("token", el.token.value.trim()); store.set("passcode", el.passcode.value.trim());
  const checked = name => [...f.querySelectorAll(`input[name=${name}]:checked`)].map(x => x.value);
  const next = {
    home_airports: codes(el.home_airports.value).split(",").filter(Boolean),
    deal_cabins: checked("deal_cabin"), deal_durations: checked("deal_duration"), deal_interests: checked("deal_interest"),
    explore_per_run: Math.max(0, +el.explore_per_run.value || 0), searches_per_run: Math.max(0, +el.searches_per_run.value || 0),
    currency: el.currency.value, drop_threshold_pct: +el.drop_threshold_pct.value || 5,
  };
  if (!next.home_airports.length) return toast("Add at least one home airport.");
  if (!next.deal_cabins.length || !next.deal_durations.length) return toast("Pick at least one class and one trip length.");
  const changed = Object.keys(next).some(k => JSON.stringify(next[k]) !== JSON.stringify(config.settings[k] ?? null));
  try {
    if (changed) await saveConfig(c => { c.settings = { ...(c.settings || {}), ...next }; }, "Update settings");
    $("#dlg-settings").close();
    toast(changed ? "Settings saved. The next scheduled run uses them." : "Saved in this browser.");
  } catch (err) { toast(err.message); }
});
$("#dlg-settings").addEventListener("close", () => { if (location.hash === "#/settings") location.hash = "#/"; });

// ---------- route editor ----------
function openRoute(id) {
  const r = config.routes.find(x => x.id === id); if (!r) return;
  const f = $("#route-form"); f.dataset.id = id;
  for (const k of ["name", "trip", "adults"]) f.elements[k].value = r[k] ?? "";
  f.elements.max_stops.value = r.max_stops ?? "";
  const pick = (sel, v) => { if (v && ![...sel.options].some(o => +o.value === v)) sel.add(new Option(dur(v), v)); sel.value = v || ""; };
  pick(f.elements.min_layover, r.min_layover); pick(f.elements.max_layover, r.max_layover);
  f.elements.avoid.value = (r.avoid || "").replace(/,/g, ", "); f.elements.no_overnight.checked = !!r.no_overnight;
  $("#r-dates").innerHTML = dateFields(r);
  $("#r-locs").innerHTML = locPicker("from", "From", r.from, "City, airport or country") + locPicker("to", "To", r.to, "City, airport or country");
  f.querySelectorAll("[data-loc]").forEach(initLoc);
  initDates($("#r-dates [data-dates]"), f);
  $("#r-cabins").innerHTML = CABINS.map(c => `<div class="tcard"><label class="top"><input type="checkbox" name="cab-${c}" ${cabinsOf(r).includes(c) ? "checked" : ""}>${CABIN_NAME[c]}</label>
    <input type="number" min="1" name="tgt-${c}" value="${r.targets?.[c] ?? ""}" placeholder="Target (optional)" aria-label="${CABIN_NAME[c]} target price"></div>`).join("");
  editorSync(); $("#dlg-route").showModal();
}
function editorSync() {
  const f = $("#route-form"), el = f.elements, d = readDates(f);
  const n = typeof d === "string" ? 0 : tripsOf({ trip: el.trip.value, ...d }).length, cabs = CABINS.filter(c => el["cab-" + c]?.checked).length;
  $("#r-cost").textContent = n && cabs ? `${n} trips × ${cabs} classes = ${n * cabs} searches to check everything once. Each run does ${config.settings.searches_per_run ?? 1}, shared by all routes.` : "";
}
$("#route-form").addEventListener("input", editorSync);
$("#route-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, el = f.elements, cabins = CABINS.filter(c => el["cab-" + c].checked);
  const r = buildRoute({ from: el.from.value, to: el.to.value, name: el.name.value, trip: el.trip.value, adults: el.adults.value, max_stops: el.max_stops.value, cabins,
    min_layover: el.min_layover.value, max_layover: el.max_layover.value, no_overnight: el.no_overnight.checked, avoid: el.avoid.value,
    targets: Object.fromEntries(cabins.filter(c => +el["tgt-" + c].value > 0).map(c => [c, +el["tgt-" + c].value])) }, f.dataset.id, f);
  if (typeof r === "string") return toast(r);
  const btn = $("#r-save"); btn.disabled = true;
  try { await saveConfig(c => { c.routes = c.routes.map(x => x.id === r.id ? r : x); }, `Edit route ${r.from} → ${r.to}`); $("#dlg-route").close(); toast("Saved. A new check starts right away."); }
  catch (err) { toast(err.message); } finally { btn.disabled = false; }
});
$("#r-delete").onclick = async () => {
  const id = $("#route-form").dataset.id, r = config.routes.find(x => x.id === id);
  if (!r || !confirm(`Stop tracking ${routeTitle(r)}? Its price history is deleted too.`)) return;
  try { await saveConfig(c => { c.routes = c.routes.filter(x => x.id !== id); }, `Delete route ${r.from} → ${r.to}`); $("#dlg-route").close(); location.hash = "#/tracked"; toast("Route deleted."); }
  catch (err) { toast(err.message); }
};
document.addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) { e.preventDefault(); e.stopPropagation(); openRoute(b.dataset.edit); } });
