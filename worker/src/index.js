/**
 * Flight Tracker API (Cloudflare Worker).
 *
 *   GET  /status   what this worker can do: { search, write, passcode }
 *   GET  /search   one Google Flights search: from, to, depart, return?, cabin, adults, stops, currency
 *   GET  /config   routes.json from the repository: { content, sha }
 *   POST /config   save routes.json: { content, sha, message }
 *   POST /run      start the "Check flights" workflow
 *
 * Secrets: SERPAPI_KEY (searches), SEARCH_PASSCODE (required in X-Passcode when set),
 * TRACKER_GITHUB_TOKEN (fine-grained token for this repo: Contents + Actions read/write; needed for /config and /run).
 * Writes are only allowed when a passcode is set, so strangers can't change your routes.
 */
const CABINS = { economy: 1, premium: 2, business: 3, first: 4 };
const CACHE_SECONDS = 30 * 60;
const CODES = /^[A-Z]{3}(,[A-Z]{3}){0,6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("Origin") || "", env);
    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const canWrite = Boolean(env.TRACKER_GITHUB_TOKEN && env.SEARCH_PASSCODE && env.GITHUB_REPO);
    if (url.pathname === "/status") return json({ search: Boolean(env.SERPAPI_KEY), write: canWrite, passcode: Boolean(env.SEARCH_PASSCODE) });
    if (env.SEARCH_PASSCODE && request.headers.get("X-Passcode") !== env.SEARCH_PASSCODE) {
      return json({ error: "passcode", message: "Enter the passcode in Settings to search from this site." }, 401);
    }
    try {
      if (url.pathname === "/search" && request.method === "GET") {
        if (!env.SERPAPI_KEY) return json({ error: "no-key", message: "SERPAPI_KEY is not set on the worker." }, 503);
        const result = await search(url.searchParams, env, ctx);
        return json(result, result.error === "bad-request" ? 400 : 200);
      }
      if (url.pathname === "/config" || url.pathname === "/run") {
        if (!canWrite) return json({ error: "write-disabled", message: "Saving from the site needs SEARCH_PASSCODE and TRACKER_GITHUB_TOKEN on the worker." }, 403);
        if (url.pathname === "/config" && request.method === "GET") return json(await readConfig(env));
        if (url.pathname === "/config" && request.method === "POST") return json(await writeConfig(await request.json(), env));
        if (url.pathname === "/run" && request.method === "POST") return json(await runWorkflow(env));
      }
      return json({ error: "not-found" }, 404);
    } catch (e) {
      return json({ error: "failed", message: e.message }, 502);
    }
  },
};

function corsHeaders(origin, env) {
  const allowed = (origin && origin.toLowerCase() === String(env.ALLOWED_ORIGIN || "").toLowerCase())
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Passcode",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ---------- search ----------
export function searchParams(p) {
  const q = {
    from: (p.get("from") || "").toUpperCase(), to: (p.get("to") || "").toUpperCase(),
    depart: p.get("depart") || "", ret: p.get("return") || "", cabin: p.get("cabin") || "economy",
    adults: Number(p.get("adults") || 1), stops: p.get("stops") ?? "", currency: (p.get("currency") || "EUR").toUpperCase(),
  };
  if (!CODES.test(q.from) || !CODES.test(q.to)) return "from/to must be up to 7 airport codes";
  if (!DATE.test(q.depart) || (q.ret && !DATE.test(q.ret)) || (q.ret && q.ret < q.depart)) return "bad dates";
  if (!(q.cabin in CABINS) || !(q.adults >= 1 && q.adults <= 9) || !/^[A-Z]{3}$/.test(q.currency)) return "bad cabin, adults or currency";
  if (!["", "0", "1", "2"].includes(q.stops)) return "bad stops";
  return q;
}

async function search(params, env, ctx) {
  const q = searchParams(params);
  if (typeof q === "string") return { error: "bad-request", message: q };
  const serp = new URLSearchParams({
    engine: "google_flights", departure_id: q.from, arrival_id: q.to, outbound_date: q.depart,
    type: q.ret ? "1" : "2", travel_class: String(CABINS[q.cabin]), adults: String(q.adults),
    stops: q.stops === "" ? "0" : String(Number(q.stops) + 1), currency: q.currency, hl: "en",
  });
  if (q.ret) serp.set("return_date", q.ret);
  const cacheKey = new Request(`https://cache.flight-tracker.local/search?${serp}`);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache && await cache.match(cacheKey);
  if (hit) return { ...(await hit.json()), cached: true };

  serp.set("api_key", env.SERPAPI_KEY);
  const r = await fetch(`https://serpapi.com/search.json?${serp}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok && !data.error) throw new Error(`SerpApi HTTP ${r.status}`);
  const result = { query: q, ...normalize(data), searched_at: new Date().toISOString() };
  if (cache && !data.error) ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(result), { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
  return result;
}

export function normalize(data) {
  const insights = data.price_insights || {};
  const flights = [
    ...(data.best_flights || []).map(f => ({ ...f, best: true })),
    ...(data.other_flights || []).map(f => ({ ...f, best: false })),
  ].filter(f => f.price);
  const options = flights.map(f => {
    const legs = f.flights || [];
    const airlines = [...new Set(legs.map(l => l.airline).filter(Boolean))];
    return {
      price: f.price, best: f.best, airlines, logo: f.airline_logo || legs[0]?.airline_logo || null,
      stops: Math.max(legs.length - 1, 0), duration: f.total_duration || null,
      depart_time: legs[0]?.departure_airport?.time || "", arrive_time: legs.at(-1)?.arrival_airport?.time || "",
      legs: legs.map(l => ({
        from: l.departure_airport?.id || "", from_name: l.departure_airport?.name || "", depart: l.departure_airport?.time || "",
        to: l.arrival_airport?.id || "", to_name: l.arrival_airport?.name || "", arrive: l.arrival_airport?.time || "",
        duration: l.duration || null, airline: l.airline || "", flight: l.flight_number || "", airplane: l.airplane || "",
        legroom: l.legroom || "", overnight: Boolean(l.overnight),
      })),
      layovers: (f.layovers || []).map(x => ({ id: x.id || "", name: x.name || "", duration: x.duration || null, overnight: Boolean(x.overnight) })),
      co2: f.carbon_emissions?.this_flight ?? null, co2_diff: f.carbon_emissions?.difference_percent ?? null,
    };
  });
  return {
    options,
    level: insights.price_level || null, typical: insights.typical_price_range || null, lowest: insights.lowest_price ?? null,
    url: data.search_metadata?.google_flights_url || null,
    ...(options.length ? {} : { error: "no-flights", message: data.error || "No flights found for this search." }),
  };
}

// ---------- GitHub ----------
async function github(env, path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.TRACKER_GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "flight-tracker-worker", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || ""}`);
  return r.status === 204 ? null : r.json();
}
const toBase64 = s => { const b = new TextEncoder().encode(s); let out = ""; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(out); };
const fromBase64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));

async function readConfig(env) {
  const file = await github(env, "/contents/routes.json");
  return { content: fromBase64(file.content), sha: file.sha };
}

export function validConfig(text) {
  if (typeof text !== "string" || text.length > 200_000) return "routes.json is too large";
  let cfg; try { cfg = JSON.parse(text); } catch { return "not valid JSON"; }
  if (!cfg || typeof cfg !== "object" || !Array.isArray(cfg.routes) || (cfg.settings && typeof cfg.settings !== "object")) return "expected { settings, routes: [] }";
  if (cfg.routes.length > 100) return "too many routes";
  for (const r of cfg.routes) {
    if (!r || typeof r.id !== "string" || !CODES.test(r.from || "") || !CODES.test(r.to || "") || !DATE.test(r.depart_from || "")) return `invalid route ${r?.id ?? ""}`;
  }
  return null;
}

async function writeConfig(body, env) {
  const problem = validConfig(body?.content);
  if (problem) throw new Error(problem);
  const message = String(body.message || "Update routes").slice(0, 100);
  const res = await github(env, "/contents/routes.json", { method: "PUT", body: JSON.stringify({ message, sha: body.sha, content: toBase64(body.content) }) });
  return { ok: true, sha: res.content.sha };
}

async function runWorkflow(env) {
  const repo = await github(env, "");
  await github(env, "/actions/workflows/check-flights.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: repo.default_branch }) });
  return { ok: true };
}
