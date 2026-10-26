// Loading the repository data, the live search service (Cloudflare Worker, see worker/), saving routes and diagnostics.

// ---------- repository data ----------
const loadErrors = [];
async function getJSON(path, fb) {
  try {
    const r = await fetch(`${path}?t=${Date.now()}`);
    if (r.status === 404) return fb;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) { if (path !== "api.json") loadErrors.push(`${path} (${e.message})`); return fb; }
}
async function loadData() {
  [config, latest, hist, alerts, deals] = await Promise.all([
    getJSON("routes.json", { settings: {}, routes: [] }), getJSON("data/latest.json", { routes: {} }),
    getJSON("data/history.json", {}), getJSON("data/alerts.json", []), getJSON("data/deals.json", { slices: {} }),
  ]);
  config.settings ||= {}; config.routes ||= []; latest.routes ||= {}; deals.slices ||= {};
  if (loadErrors.length) toast(`Couldn't load ${loadErrors.join(", ")}. Showing what's available; reload to try again.`);
  await loadLive();
}
const homeAirports = () => (config.settings.home_airports || deals.origins || ["AMS"]).filter(Boolean);
const homeAirport = () => store.get("home", null) || homeAirports()[0] || "AMS";

// ---------- live search service ----------
let liveApi = null, liveStatus = null;
async function loadLive() {
  const cfg = await getJSON("api.json", {});
  liveApi = (cfg.search_api || "").replace(/\/$/, "") || null;
  if (!liveApi) return;
  try { liveStatus = await (await fetch(liveApi + "/status", { signal: AbortSignal.timeout(10000) })).json(); } catch { liveStatus = null; }
}
const apiError = (code, message) => Object.assign(new Error(message), { code });
/** Calls the search service. GETs are retried once on network errors, timeouts and 5xx answers. */
async function live(path, opts = {}, attempt = 1) {
  if (!liveApi) throw apiError("not-set-up", "Live search isn't set up yet.");
  const retryable = (opts.method || "GET") === "GET" && attempt === 1;
  let r;
  try {
    r = await fetch(liveApi + path, { ...opts, signal: AbortSignal.timeout(opts.timeout || 40000),
      headers: { "Content-Type": "application/json", "X-Passcode": store.get("passcode", ""), ...(opts.headers || {}) } });
  } catch (e) {
    if (retryable) { await new Promise(res => setTimeout(res, 1500)); return live(path, opts, 2); }
    if (e?.name === "TimeoutError") throw apiError("timeout", "The search took too long. Try again.");
    if (!navigator.onLine) throw apiError("offline", "You're offline. Check your internet connection.");
    throw apiError("unreachable", `Can't reach the search service (${liveApi.replace(/^https:\/\//, "")}). If you just deployed it, wait a minute. Otherwise check in Cloudflare that the flight-tracker Worker is deployed and that ALLOWED_ORIGIN is ${location.origin}.`);
  }
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) throw apiError("passcode", body.message || "Enter the passcode to search.");
  if (!r.ok) {
    if (retryable && r.status >= 500 && !["no-key", "serpapi-key", "serpapi-quota"].includes(body.error)) { await new Promise(res => setTimeout(res, 1500)); return live(path, opts, 2); }
    throw apiError(body.error || `http-${r.status}`, body.message || `The search service answered with an error (HTTP ${r.status}).`);
  }
  return body;
}
const SETUP_ERRORS = ["no-key", "serpapi-key", "serpapi-quota", "unreachable", "github-token", "github-access", "write-disabled", "not-set-up"];
const liveReady = () => Boolean(liveApi && liveStatus?.search);
const liveWrite = () => Boolean(liveApi && liveStatus?.write);

/** Asks for the passcode, then calls `then`. `mount` (optional) shows a prompt in place of results meanwhile. */
function askPasscode(then, msg, mount) {
  const d = $("#dlg-pass"), f = $("#pass-form");
  $("#pass-msg").textContent = msg || "This site's search is protected so nobody else can use your search credits.";
  f.elements.pass.value = ""; if (!d.open) d.showModal(); f.elements.pass.focus();
  f.onsubmit = e => { e.preventDefault(); store.set("passcode", f.elements.pass.value.trim()); d.close(); then(); };
  if (mount) {
    mount.innerHTML = emptyState("🔒", "Enter the passcode to search", "", `<button class="btn-primary" data-pass>Enter passcode</button>`);
    mount.querySelector("[data-pass]").onclick = () => askPasscode(then, msg, mount);
  }
}
/** A problem panel for a failed live call, with retry and (for setup problems) a connection test. */
function errorPanel(err, retry) {
  const setup = SETUP_ERRORS.includes(err.code);
  const title = err.code === "serpapi-quota" ? "Out of searches" : err.code === "not-set-up" ? "Live search isn't set up yet" : setup ? "The search service needs attention" : "The search didn't work";
  const text = err.code === "not-set-up"
    ? "Searching straight from this page needs the small search service in <code>worker/</code> (see <b>Live search</b> in the README). Deals and tracked prices still update automatically."
    : esc(err.message);
  const el = document.createElement("div");
  el.innerHTML = emptyState(err.code === "offline" ? "📡" : setup ? "🔧" : "⚠️", title, text,
    `${retry && err.code !== "not-set-up" ? `<button class="btn-primary" data-retry>${icon("refresh", "i sm")} Try again</button>` : ""}${setup ? `<button data-diag>${icon("gear", "i sm")} Test connection</button>` : ""}`);
  el.querySelector("[data-retry]")?.addEventListener("click", retry);
  el.querySelector("[data-diag]")?.addEventListener("click", () => { openSettings(); runDiagnostics(); });
  return el;
}

// ---------- saving routes (search service, or a GitHub token in this browser) ----------
const repoGuess = () => { const m = location.hostname.match(/^([\w-]+)\.github\.io$/); return m ? `${m[1]}/${location.pathname.split("/")[1] || "Flight-tracker"}` : ""; };
const gh = () => ({ repo: store.get("repo", repoGuess()), token: store.get("token", "") });
async function github(path, opts = {}) {
  const { repo, token } = gh();
  if (!repo || !token) {
    if (liveApi && liveStatus && !liveStatus.write) throw new Error("Saving needs SEARCH_PASSCODE and TRACKER_GITHUB_TOKEN on the search service (see README).");
    openSettings(); throw new Error(liveApi ? "Saving isn't available yet." : "Set up live search (README), or connect GitHub in Settings.");
  }
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`GitHub: ${r.status} ${(await r.json().catch(() => ({}))).message || ""}`);
  return r.status === 204 ? null : r.json();
}
const b64 = s => { const b = new TextEncoder().encode(s); let out = ""; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(out); };
const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));
/** Reads routes.json fresh, applies `mutate`, writes it back. Retries once if it changed in the meantime. */
async function saveConfig(mutate, message, attempt = 1) {
  if (liveWrite()) {
    const file = await live("/config"), fresh = JSON.parse(file.content);
    mutate(fresh);
    try { await live("/config", { method: "POST", body: JSON.stringify({ message, sha: file.sha, content: JSON.stringify(fresh, null, 1) + "\n" }) }); }
    catch (e) { if (e.code === "conflict" && attempt === 1) return saveConfig(mutate, message, 2); throw e; }
    config = fresh; route(); return;
  }
  const file = await github("/contents/routes.json"), fresh = JSON.parse(unb64(file.content));
  mutate(fresh);
  await github("/contents/routes.json", { method: "PUT", body: JSON.stringify({ message, sha: file.sha, content: b64(JSON.stringify(fresh, null, 1) + "\n") }) });
  config = fresh; route();
}
async function runChecksNow() {
  if (liveWrite()) await live("/run", { method: "POST" });
  else { const info = await github(""); await github("/actions/workflows/check-flights.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: info.default_branch }) }); }
}

// ---------- routes ----------
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const routeSig = x => JSON.stringify([x.from, x.to, x.trip, x.depart_from, x.depart_to, x.return_from, x.return_to, x.nights, x.nights_min, x.nights_max, x.weekdays]);
const routeTitle = r => r.name || `${cityOf(r.from)} → ${cityOf(r.to)}`;
const cabinsOf = r => CABINS.filter(c => (r.cabins || CABINS).includes(c));
const entry = (id, c) => latest.routes?.[id]?.[c] || {};
const prevPrice = (id, c, price) => [...(hist[id]?.[c] || [])].reverse().find(p => p[1] !== price)?.[1];
/** Validated route from form values (dates come from the form's date fields), or an error message. */
function buildRoute(v, id, form) {
  const ok = s => /^[A-Z]{3}(,[A-Z]{3})*$/.test(s);
  if (!ok(codes(v.from))) return "Choose where you fly from.";
  if (!ok(codes(v.to))) return "Choose where you want to go.";
  if (!v.cabins.length) return "Pick at least one class.";
  const dates = v.dates || readDates(form);
  if (typeof dates === "string") return dates;
  const r = {
    id: id || slug(`${codes(v.from).split(",")[0]}-${codes(v.to).split(",")[0]}-${Date.now().toString(36).slice(-4)}`),
    ...(v.name?.trim() ? { name: v.name.trim() } : {}),
    from: codes(v.from), to: codes(v.to), trip: v.trip, ...dates,
    cabins: v.cabins, adults: +v.adults || 1, max_stops: v.max_stops === "" || v.max_stops == null ? null : +v.max_stops, targets: v.targets || {},
  };
  if (r.depart_to < today()) return "These dates are in the past.";
  if (tripsOf(r).length > 400) return "That's a lot of trips to search. Pick a shorter window or fewer trip lengths.";
  return r;
}
async function trackRoute(r, btn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Saving…`; }
  try {
    await saveConfig(c => { c.routes = (c.routes || []).filter(x => routeSig(x) !== routeSig(r)).concat(r); }, `Track ${r.from} → ${r.to}`);
    toast("Tracking started. Prices fill in over the next scheduled runs.");
  } catch (err) { toast(err.message); if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

// ---------- diagnostics (Settings → Test connection) ----------
async function runDiagnostics() {
  const out = $("#s-diag-out"), btn = $("#s-test"), f = $("#settings-form");
  if (f.elements.passcode.value.trim()) store.set("passcode", f.elements.passcode.value.trim());
  out.hidden = false; btn.disabled = true;
  const rows = [];
  const show = () => out.innerHTML = rows.map(([ok, title, detail]) => `<li class="${ok === null ? "" : ok ? "ok" : "bad"}"><span class="mark">${ok === null ? '<span class="spin" style="width:12px;height:12px"></span>' : ok ? "✓" : "✕"}</span><span><b>${title}</b>${detail ? `<br><span class="tiny ink2">${detail}</span>` : ""}</span></li>`).join("");
  const step = async (title, fn) => { const row = [null, title, ""]; rows.push(row); show(); try { const d = await fn(); row[0] = d?.ok !== false; row[2] = d?.detail || ""; } catch (e) { row[0] = false; row[2] = esc(e.message); } show(); return row[0]; };
  try {
    const listed = await step("Search service address", async () => {
      const cfg = await getJSON("api.json", {});
      if (!cfg.search_api) return { ok: false, detail: "api.json has no address yet. See <b>Live search</b> in the README." };
      liveApi = cfg.search_api.replace(/\/$/, ""); return { detail: esc(liveApi) };
    });
    if (!listed) return;
    const reach = await step("Search service reachable", async () => {
      let r; try { r = await fetch(liveApi + "/status", { signal: AbortSignal.timeout(15000) }); }
      catch { return { ok: false, detail: `No answer. Check the Worker is deployed in Cloudflare and its ALLOWED_ORIGIN is <code>${esc(location.origin)}</code>.` }; }
      liveStatus = await r.json().catch(() => null);
      return liveStatus ? { detail: "Connected." } : { ok: false, detail: `Unexpected answer (HTTP ${r.status}).` };
    });
    if (!reach) return;
    let diag = null;
    await step("Passcode", async () => {
      try { diag = await live("/diagnose", { timeout: 30000 }); }
      catch (e) { if (e.code === "passcode") return { ok: false, detail: "Wrong or missing passcode. Enter it above and test again." }; throw e; }
      return liveStatus.passcode ? { detail: "Accepted." } : { ok: false, detail: "No SEARCH_PASSCODE secret on the Worker, so anyone could use your search credits and saving routes is disabled." };
    });
    await step("SerpApi key (Google Flights)", async () => {
      const d = diag?.serpapi;
      if (!d) return { ok: false, detail: "Couldn't check: the passcode step must pass first." };
      return { ok: d.ok, detail: d.ok ? `${esc(d.plan || "Plan")}${d.searches_left != null ? ` · ${d.searches_left} searches left` : ""}` : esc(d.message) };
    });
    await step("Saving routes from the site", async () => {
      const d = diag?.github;
      if (!d) return { ok: false, detail: "Couldn't check: the passcode step must pass first." };
      return { ok: d.ok, detail: d.ok ? "Works, no GitHub token needed in this browser." : esc(d.message) };
    });
  } finally { btn.disabled = false; renderStatus(); }
}
