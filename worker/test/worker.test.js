import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { normalize, searchParams, validConfig } from "../src/index.js";

const SERP = {
  search_metadata: { google_flights_url: "https://www.google.com/travel/flights?x" },
  best_flights: [{
    price: 812, total_duration: 845, airline_logo: "https://logo/kl.png",
    flights: [{ departure_airport: { id: "AMS", name: "Schiphol", time: "2027-02-01 14:30" }, arrival_airport: { id: "HND", name: "Haneda", time: "2027-02-02 10:35" },
                duration: 845, airline: "KLM", flight_number: "KL 861", airplane: "Boeing 787", legroom: "31 in" }],
    carbon_emissions: { this_flight: 600000, difference_percent: -8 },
  }],
  other_flights: [{ price: 640, total_duration: 1300, flights: [
    { departure_airport: { id: "AMS", time: "2027-02-01 06:00" }, arrival_airport: { id: "IST", time: "2027-02-01 10:30" }, airline: "Turkish Airlines", flight_number: "TK 1952" },
    { departure_airport: { id: "IST", time: "2027-02-01 13:00" }, arrival_airport: { id: "NRT", time: "2027-02-02 07:00" }, airline: "Turkish Airlines", flight_number: "TK 52" }],
    layovers: [{ id: "IST", name: "Istanbul Airport", duration: 150 }] }, { total_duration: 1 }],
  price_insights: { lowest_price: 640, price_level: "low", typical_price_range: [700, 1000] },
};
const env = { SERPAPI_KEY: "k", SEARCH_PASSCODE: "pw", TRACKER_GITHUB_TOKEN: "t", GITHUB_REPO: "o/r", ALLOWED_ORIGIN: "https://o.github.io" };
const ctx = { waitUntil() {} };
const req = (path, init = {}) => new Request(`https://w.dev${path}`, { ...init, headers: { Origin: "https://o.github.io", "X-Passcode": "pw", ...(init.headers || {}) } });

test("normalize keeps every option with legs and layovers", () => {
  const r = normalize(SERP);
  assert.equal(r.options.length, 2);
  assert.deepEqual(r.options.map(o => [o.price, o.best, o.stops]), [[812, true, 0], [640, false, 1]]);
  assert.equal(r.options[1].layovers[0].id, "IST");
  assert.equal(r.options[0].legs[0].airplane, "Boeing 787");
  assert.equal(r.level, "low");
  assert.equal(r.error, undefined);
});

test("normalize reports no flights", () => {
  assert.equal(normalize({ error: "Google Flights hasn't returned any results." }).error, "no-flights");
});

test("search params are validated", () => {
  const p = s => searchParams(new URLSearchParams(s));
  assert.equal(typeof p("from=AMS&to=NRT,HND&depart=2027-02-01&return=2027-02-15&cabin=first"), "object");
  assert.equal(typeof p("from=AMS&to=NRT&depart=2027-02-01&return=2027-01-15"), "string");
  assert.equal(typeof p("from=AMS;x&to=NRT&depart=2027-02-01"), "string");
  assert.equal(typeof p("from=AMS&to=NRT&depart=2027-02-01&cabin=luxury"), "string");
});

test("config validation", () => {
  assert.equal(validConfig(JSON.stringify({ settings: {}, routes: [{ id: "a", from: "AMS", to: "NRT", depart_from: "2027-01-01" }] })), null);
  assert.match(validConfig(JSON.stringify({ routes: [{ id: "a", from: "x", to: "NRT", depart_from: "2027-01-01" }] })), /invalid route/);
  assert.match(validConfig("{"), /JSON/);
});

test("passcode and CORS", async () => {
  const bad = await worker.fetch(req("/search?from=AMS&to=NRT&depart=2027-02-01", { headers: { "X-Passcode": "nope" } }), env, ctx);
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("Access-Control-Allow-Origin"), "https://o.github.io");
  const other = await worker.fetch(new Request("https://w.dev/status", { headers: { Origin: "https://evil.example" } }), env, ctx);
  assert.equal(other.headers.get("Access-Control-Allow-Origin"), null);
  assert.deepEqual(await other.json(), { search: true, write: true, passcode: true });
});

test("search calls SerpApi with the right parameters", async () => {
  let called;
  globalThis.fetch = async u => { called = new URL(u); return new Response(JSON.stringify(SERP)); };
  const res = await worker.fetch(req("/search?from=AMS,BRU&to=NRT&depart=2027-02-01&return=2027-02-15&cabin=business&adults=2&stops=0&currency=EUR"), env, ctx);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(called.searchParams.get("travel_class"), "3");
  assert.equal(called.searchParams.get("stops"), "1");
  assert.equal(called.searchParams.get("departure_id"), "AMS,BRU");
  assert.equal(called.searchParams.get("type"), "1");
  assert.equal(body.options.length, 2);
  assert.equal(body.query.cabin, "business");
});

test("writes need a passcode-protected worker", async () => {
  const open = { ...env, SEARCH_PASSCODE: "" };
  const res = await worker.fetch(req("/config"), open, ctx);
  assert.equal(res.status, 403);
});

test("saving routes.json sends base64 content to GitHub", async () => {
  let sent;
  globalThis.fetch = async (u, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ content: { sha: "new" } })); };
  const content = JSON.stringify({ settings: {}, routes: [{ id: "a", from: "AMS", to: "NRT", depart_from: "2027-01-01", name: "Tōkyō" }] });
  const res = await worker.fetch(req("/config", { method: "POST", body: JSON.stringify({ content, sha: "old", message: "Track AMS → NRT" }) }), env, ctx);
  assert.deepEqual(await res.json(), { ok: true, sha: "new" });
  assert.equal(new TextDecoder().decode(Uint8Array.from(atob(sent.content), c => c.charCodeAt(0))), content);
  assert.equal(sent.sha, "old");
});

import { serpError, githubError } from "../src/index.js";

test("SerpApi failures become clear errors", () => {
  assert.equal(serpError(200, "Google Flights hasn't returned any results for this query."), null);
  assert.equal(serpError(401, "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key").code, "serpapi-key");
  assert.equal(serpError(429, "Your account has run out of searches.").code, "serpapi-quota");
  assert.equal(serpError(503, "").code, "serpapi-down");
  assert.equal(serpError(200, undefined), null);
});

test("search returns the error code and message, not 'no flights'", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Invalid API key." }), { status: 401 });
  const res = await worker.fetch(req("/search?from=AMS&to=NRT&depart=2027-02-01"), env, ctx);
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(body.error, "serpapi-key");
  assert.match(body.message, /SERPAPI_KEY/);
});

test("no results is a normal answer", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Google Flights hasn't returned any results for this query." }));
  const res = await worker.fetch(req("/search?from=AMS&to=NRT&depart=2027-02-02"), env, ctx);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).error, "no-flights");
});

test("bad search input is a 400", async () => {
  const res = await worker.fetch(req("/search?from=AMS&to=NRT&depart=tomorrow"), env, ctx);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "bad-request");
});

test("missing key explains where to add it", async () => {
  const res = await worker.fetch(req("/search?from=AMS&to=NRT&depart=2027-02-01"), { ...env, SERPAPI_KEY: "" }, ctx);
  assert.equal(res.status, 503);
  assert.match((await res.json()).message, /Variables and Secrets/);
});

test("GitHub token problems are explained", () => {
  assert.equal(githubError(401).code, "github-token");
  assert.equal(githubError(403, "Resource not accessible", { GITHUB_REPO: "o/r" }).code, "github-access");
  assert.equal(githubError(409).code, "conflict");
});

test("diagnose reports SerpApi searches left and GitHub access", async () => {
  globalThis.fetch = async u => String(u).includes("account.json")
    ? new Response(JSON.stringify({ plan_name: "Free Plan", total_searches_left: 87 }))
    : new Response(JSON.stringify({ content: "e30=", sha: "x" }));
  const res = await worker.fetch(req("/diagnose"), env, ctx);
  assert.deepEqual(await res.json(), { serpapi: { ok: true, plan: "Free Plan", searches_left: 87 }, github: { ok: true } });
});

import { normalizeExplore, exploreParams } from "../src/index.js";

const EXPLORE = { destinations: [
  { name: "Barcelona", country: "Spain", destination_airport: { code: "BCN" }, flight_price: 142, start_date: "2027-03-04", end_date: "2027-03-11",
    number_of_stops: 0, flight_duration: 135, airline: "Vueling", gps_coordinates: { latitude: 41.38, longitude: 2.17 }, thumbnail: "https://img/bcn.jpg" },
  { name: "Lisbon", country: "Portugal", destination_airport: { code: "lis" }, flight_price: "€98", start_date: "2027-03-10", number_of_stops: 1 },
  { name: "No price" },
] };

test("normalizeExplore matches the Python parser", () => {
  const out = normalizeExplore(EXPLORE);
  assert.deepEqual(out.map(d => [d.name, d.code, d.price]), [["Lisbon", "LIS", 98], ["Barcelona", "BCN", 142]]);
  assert.equal(out[1].lat, 41.38);
  assert.equal(out[1].image, "https://img/bcn.jpg");
});

test("explore params are validated", () => {
  const p = s => exploreParams(new URLSearchParams(s));
  assert.equal(typeof p("from=AMS&month=3&duration=weekend&cabin=business"), "object");
  assert.equal(typeof p("from=AMS,BRU"), "string");
  assert.equal(typeof p("from=AMS&month=13"), "string");
  assert.equal(typeof p("from=AMS&duration=month"), "string");
});

test("explore calls SerpApi Travel Explore", async () => {
  let called;
  globalThis.fetch = async u => { called = new URL(u); return new Response(JSON.stringify(EXPLORE)); };
  const res = await worker.fetch(req("/explore?from=AMS&month=4&duration=2weeks&cabin=premium"), env, ctx);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(called.searchParams.get("engine"), "google_travel_explore");
  assert.equal(called.searchParams.get("month"), "4");
  assert.equal(called.searchParams.get("travel_duration"), "3");
  assert.equal(called.searchParams.get("travel_class"), "2");
  assert.equal(body.destinations.length, 2);
});

test("explore errors are explained", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Your account has run out of searches." }), { status: 429 });
  const res = await worker.fetch(req("/explore?from=AMS"), env, ctx);
  assert.equal((await res.json()).error, "serpapi-quota");
});
