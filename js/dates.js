// Date modes (specific ± flexibility, or a flexible window with a trip length) and the trips they expand to.

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const LENGTHS = { weekend: { label: "Weekend (Thu/Fri – Sun/Mon)", weekdays: [3, 4], nights_min: 2, nights_max: 3 }, week: { label: "1 week", nights: 7 }, "2weeks": { label: "2 weeks", nights: 14 }, custom: { label: "Custom number of nights" } };

/** A route's date settings as form values. Routes made before date modes count as flexible. */
function dateValues(r) {
  const today = new Date().toISOString().slice(0, 10);
  if (!r) return { mode: "exact", flex: 0, depart: addDays(today, 30), ret: addDays(today, 37), from: addDays(today, 30), to: addDays(today, 90), len: "week", nmin: 5, nmax: 9 };
  if (r.date_mode === "exact") {
    const flex = +r.flex || 0;
    return { mode: "exact", flex, depart: addDays(r.depart_from, flex), ret: r.return_from ? addDays(r.return_from, flex) : addDays(r.depart_from, flex + 7), from: r.depart_from, to: r.depart_to, len: "week", nmin: 5, nmax: 9 };
  }
  const len = r.length || (r.weekdays ? "weekend" : r.nights_min != null ? "custom" : r.nights == 7 ? "week" : r.nights == 14 ? "2weeks" : "custom");
  return { mode: "flexible", flex: 0, depart: r.depart_from, ret: addDays(r.depart_from, r.nights || 7), from: r.depart_from, to: r.depart_to, len,
           nmin: r.nights_min ?? r.nights ?? 7, nmax: r.nights_max ?? r.nights ?? 7 };
}
function dateFields(r) {
  const v = dateValues(r);
  return `<div class="dates-box" data-dates>
    <input type="hidden" name="d_mode" value="${v.mode}">
    ${segmented("", [["exact", "Specific dates"], ["flexible", "Flexible dates"]], v.mode, "Date type").replace('<div class="seg"', '<div class="seg" data-dmode')}
    <div class="dates-row" data-panel="exact">
      <label class="field"><span>Departure</span><input type="date" name="d_depart" value="${v.depart}"></label>
      <label class="field" data-ret><span>Return</span><input type="date" name="d_return" value="${v.ret}"></label>
      <label class="field"><span>Flexibility</span><select name="d_flex">${[0, 1, 2, 3].map(n => `<option value="${n}" ${n === v.flex ? "selected" : ""}>${n ? `± ${n} day${n > 1 ? "s" : ""}` : "Exact dates"}</option>`).join("")}</select></label>
    </div>
    <div class="dates-row" data-panel="flexible">
      <label class="field"><span>Leave from</span><input type="date" name="d_from" value="${v.from}"></label>
      <label class="field"><span>Leave until</span><input type="date" name="d_to" value="${v.to}"></label>
      <label class="field" data-len><span>Trip length</span><select name="d_len">${Object.entries(LENGTHS).map(([k, l]) => `<option value="${k}" ${k === v.len ? "selected" : ""}>${l.label}</option>`).join("")}</select></label>
      <div class="field" data-custom><span>Nights</span><div class="nights"><input type="number" name="d_nmin" min="1" max="60" value="${v.nmin}" aria-label="Fewest nights"><span class="muted">to</span><input type="number" name="d_nmax" min="1" max="60" value="${v.nmax}" aria-label="Most nights"></div></div>
    </div>
    <p class="tiny muted" data-dsum></p>
  </div>`;
}
function initDates(root, form) {
  const el = form.elements, seg = root.querySelector("[data-dmode]");
  const sync = () => {
    if (!root.isConnected) return;
    const mode = el.d_mode.value, round = el.trip.value === "return";
    root.querySelectorAll("[data-panel]").forEach(p => p.hidden = p.dataset.panel !== mode);
    root.querySelector("[data-ret]").hidden = !round;
    root.querySelector("[data-len]").hidden = !round;
    root.querySelector("[data-custom]").hidden = !round || el.d_len.value !== "custom";
    const d = readDates(form), sum = root.querySelector("[data-dsum]");
    sum.textContent = typeof d === "string" ? d : tripSummary({ trip: el.trip.value, ...d });
  };
  seg.onclick = e => { const b = e.target.closest("button"); if (!b) return; el.d_mode.value = b.dataset.v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); sync(); };
  form.addEventListener("input", sync); form.addEventListener("change", sync);
  sync();
}
/** Form values -> route date fields, or an error message. */
function readDates(form) {
  if (!form.elements.d_mode) return "";
  const el = form.elements, round = el.trip.value === "return";
  if (el.d_mode.value === "exact") {
    const dep = el.d_depart.value, ret = el.d_return.value, n = +el.d_flex.value || 0;
    if (!dep) return "Pick a departure date.";
    if (round && (!ret || ret <= dep)) return "The return date must be after the departure date.";
    return { date_mode: "exact", flex: n, depart_from: addDays(dep, -n), depart_to: addDays(dep, n), ...(round ? { return_from: addDays(ret, -n), return_to: addDays(ret, n) } : {}) };
  }
  const from = el.d_from.value, to = el.d_to.value;
  if (!from || !to || to < from) return "Check the travel window: the last date is before the first.";
  const out = { date_mode: "flexible", depart_from: from, depart_to: to };
  if (!round) return out;
  const len = el.d_len.value, preset = LENGTHS[len];
  if (len !== "custom") { const { label, ...fields } = preset; return { ...out, length: len, ...fields }; }
  const a = +el.d_nmin.value, b = +el.d_nmax.value;
  if (!a || !b || b < a) return "Check the number of nights.";
  return { ...out, length: "custom", ...(a === b ? { nights: a } : { nights_min: a, nights_max: b }) };
}

/** Every trip of a route (mirrors flights/planner.py trips, without dropping past dates). */
function tripsOf(r) {
  const out = [], single = r.trip === "oneway" || (!r.return_from && r.nights_min == null);
  for (let d = r.depart_from; d <= (r.depart_to || r.depart_from); d = addDays(d, 1)) {
    if (r.weekdays && !r.weekdays.includes((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7)) continue;
    let ns = [null];
    if (r.trip !== "oneway") {
      if (r.return_from) { ns = []; for (let n = daysBetween(d, r.return_from); n <= daysBetween(d, r.return_to || r.return_from); n++) if (n >= 0) ns.push(n); }
      else if (r.nights_min != null) { ns = []; for (let n = +r.nights_min; n <= +(r.nights_max ?? r.nights_min); n++) ns.push(n); }
      else ns = [+r.nights || 7];
    }
    for (const n of ns) out.push({ key: single ? d : `${d}+${n}`, date: d, ret: n == null ? null : addDays(d, n), n });
  }
  return out;
}
const singleStay = r => r.trip === "oneway" || (!r.return_from && r.nights_min == null);
function tripTxt(r) {
  if (r.trip === "oneway") return "One way";
  if (r.date_mode === "exact") return "Round trip";
  if (r.nights_min != null) return `Round trip · ${r.nights_min}–${r.nights_max} nights`;
  return `Round trip · ${r.nights} night${r.nights == 1 ? "" : "s"}`;
}
function datesTxt(r) {
  if (r.date_mode === "exact") {
    const v = dateValues(r);
    return `${fmtDate(v.depart)}${r.trip !== "oneway" ? ` – ${fmtDate(v.ret)}` : ""}${v.flex ? ` · ±${v.flex} day${v.flex > 1 ? "s" : ""}` : ""}`;
  }
  return `${r.length === "weekend" ? "Weekends · " : "Leave "}${fmtDate(r.depart_from)} – ${fmtDate(r.depart_to)}`;
}
function tripSummary(r) {
  const n = tripsOf(r).length;
  const what = r.date_mode === "exact" ? (r.flex ? `every combination within ±${r.flex} days` : "these exact dates")
    : r.length === "weekend" ? "every weekend in the window" : `every departure date${r.nights_min != null ? " and trip length" : ""} in the window`;
  return `Tracks ${what}: ${n} trip${n === 1 ? "" : "s"} per class.`;
}
