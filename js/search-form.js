// The flight search panel (home page and "Modify search" on results). Leaving "To" empty searches Explore ("Anywhere").

function searchPanel(prefill = null) {
  const r = prefill || {};
  const cabin = r.cabins?.[0] || store.get("cabin", "economy");
  return `<form id="search-form" autocomplete="off" novalidate>
    <div class="search-top">
      <select name="trip" aria-label="Trip type"><option value="return" ${r.trip !== "oneway" ? "selected" : ""}>Round trip</option><option value="oneway" ${r.trip === "oneway" ? "selected" : ""}>One way</option></select>
      <span class="pax" aria-label="Passengers">${icon("person", "i sm")}<b data-pax>${r.adults || 1}</b><button type="button" data-step="-1" aria-label="Fewer passengers">−</button><button type="button" data-step="1" aria-label="More passengers">+</button></span>
      <input type="hidden" name="adults" value="${r.adults || 1}">
      <select name="cabin" aria-label="Cabin class">${CABINS.map(c => `<option value="${c}" ${c === cabin ? "selected" : ""}>${CABIN_NAME[c]}</option>`).join("")}</select>
      <select name="max_stops" aria-label="Stops"><option value="">Any number of stops</option><option value="0" ${r.max_stops === 0 ? "selected" : ""}>Non-stop only</option><option value="1" ${r.max_stops === 1 ? "selected" : ""}>1 stop or fewer</option></select>
    </div>
    <div class="search-card">
      <div class="search-row">
        ${locPicker("from", "From", r.from || store.get("lastFrom", homeAirport()), "City, airport or country")}
        <button type="button" class="swap" id="swap" aria-label="Swap origin and destination">${icon("swap", "i sm")}</button>
        ${locPicker("to", "To", r.to || "", "Anywhere")}
      </div>
      <div class="search-foot">
        ${dateFields(prefill)}
        <button class="btn-primary btn-lg" id="search-go">${icon("search")} Search</button>
      </div>
    </div>
  </form>`;
}

function initSearchPanel(form) {
  form.querySelectorAll("[data-loc]").forEach(initLoc);
  initDates(form.querySelector("[data-dates]"), form);
  form.querySelectorAll("[data-step]").forEach(b => b.onclick = () => {
    const n = Math.min(9, Math.max(1, +form.adults.value + +b.dataset.step));
    form.adults.value = n; form.querySelector("[data-pax]").textContent = n;
  });
  form.querySelector("#swap").onclick = () => {
    const [a, b] = [form.from.value, form.to.value];
    form.querySelector("[data-loc=from]")._set(b); form.querySelector("[data-loc=to]")._set(a);
  };
  form.onsubmit = e => {
    e.preventDefault();
    const cabin = form.cabin.value;
    store.set("cabin", cabin);
    if (!codes(form.from.value)) return toast("Choose where you fly from.");
    store.set("lastFrom", codes(form.from.value));
    if (!codes(form.to.value)) return exploreFromForm(form, cabin);
    const r = buildRoute({ from: form.from.value, to: form.to.value, trip: form.trip.value, adults: form.adults.value, max_stops: form.max_stops.value, cabins: [cabin] }, null, form);
    if (typeof r === "string") return toast(r);
    startSearch(r);
  };
}

/** "Anywhere": open Explore for the chosen dates (as a month and a trip length). */
function exploreFromForm(form, cabin) {
  const d = readDates(form);
  if (typeof d === "string") return toast(d);
  const months = new Set([d.depart_from.slice(0, 7), (d.depart_to || d.depart_from).slice(0, 7)]);
  const month = months.size === 1 ? +d.depart_from.slice(5, 7) : 0;
  let nights = d.nights ?? d.nights_max;
  if (d.date_mode === "exact" && d.return_from) nights = daysBetween(addDays(d.depart_from, d.flex || 0), addDays(d.return_from, d.flex || 0));
  const duration = d.length === "weekend" || (nights && nights <= 3) ? "weekend" : nights && nights > 10 ? "2weeks" : "week";
  goExplore({ origin: codes(form.from.value).split(",")[0], month, duration, cabin });
}
