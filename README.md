# Flight Tracker

A flight comparison and deal-finding site for **economy, premium economy, business and first class**, with prices
from **Google Flights** (via [SerpApi](https://serpapi.com)). It runs on GitHub Pages and GitHub Actions, so nothing
has to run on your own computer.

**Site:** https://niel-t.github.io/Flight-tracker/

- **Flights:** search any route on specific or flexible dates. Results are laid out like a comparison site:
  filters (stops, airlines, departure time, travel time, price), *Best / Cheapest / Fastest* tabs, Google's price
  verdict (low / typical / high), flight details with layovers, aircraft, legroom and CO₂, and *View deal* on Google Flights.
  Leave **To** empty to search *Anywhere*.
- **Explore:** the cheapest destinations from your home airport, any time or per month, for weekend, 1-week or
  2-week trips, as cards or on a map, filtered by region and budget.
- **Deals:** destinations that are cheaper than they usually are (measured against their own daily price history),
  plus short getaways, long-haul for less, the cheapest destination per month, and your tracked routes.
- **Tracked:** routes you watch. Every date in the travel window is checked automatically, with a price graph,
  calendar, date grid, price history and a phone notification (ntfy) when a fare drops or goes below your target.

## Setup (10 minutes)

1. **Google Flights access.** Create a free account at [serpapi.com](https://serpapi.com) and copy your API key.
   In this repo: *Settings → Secrets and variables → Actions → New repository secret*, name `SERPAPI_KEY`.
   Without it the tracker runs on **demo data** (made-up prices, clearly marked on the dashboard).
2. **Phone alerts (optional).** Install the [ntfy](https://ntfy.sh) app, subscribe to a hard-to-guess topic name,
   and add it as secret `NTFY_TOPIC`.
3. **Dashboard.** *Settings → Pages*: deploy from branch `main`, folder `/ (root)`.
4. **Live search** (recommended): set up the search service below, so the dashboard's Search button works and
   routes can be tracked straight from the site. Without it you can still connect a GitHub token in *⚙ Settings*.
5. **Search** a route and click **Track prices**, or edit [`routes.json`](routes.json) directly.

## Live search

The **Search** button on the dashboard searches Google Flights right away and shows the flights like Google
does (best flights, other flights, layovers, CO₂, *Book on Google Flights*). **Track prices** on the results then
keeps watching that route. Searching goes through a tiny [Cloudflare Worker](worker/) so your SerpApi key never
reaches the browser, and a passcode keeps strangers from using your credits. One-time setup (~5 minutes, free):

1. Create a free account at [cloudflare.com](https://dash.cloudflare.com/sign-up). Open **Workers & Pages** once so
   Cloudflare gives you a `workers.dev` subdomain.
2. **API token:** *My Profile → API Tokens → Create Token →* template **Edit Cloudflare Workers** → create and copy it.
3. **Account ID:** shown on the right of *Workers & Pages* (or in the address bar after `dash.cloudflare.com/`).
4. In this repository: *Settings → Secrets and variables → Actions*, add:

   | Secret | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | the token from step 2 |
   | `CLOUDFLARE_ACCOUNT_ID` | the ID from step 3 |
   | `SEARCH_PASSCODE` | a passcode you make up; the dashboard asks for it once per browser |
   | `TRACKER_GITHUB_TOKEN` | a [fine-grained token](https://github.com/settings/personal-access-tokens/new) for this repository only, with **Contents** and **Actions** set to *Read and write*; lets the site save routes without a token in the browser |

   (`SERPAPI_KEY` is already there and is passed on to the worker.)
5. *Actions →* **Deploy search API** *→ Run workflow*. It deploys the worker and writes its address to `api.json`;
   a minute later the dashboard's Search works. Run it again whenever you change one of these secrets.

Each live search is one SerpApi credit per class and date. Flexible dates check 5 dates spread over the window
(5 credits), and identical searches within 30 minutes are served from a cache.

## How searching works

There are two kinds of scheduled searches, both run twice a day by the *Check flights* workflow:

- **Deal finder (Google Travel Explore).** One search lists dozens of destinations from a home airport with their
  cheapest dates. The run refreshes one combination at a time (home airport × "any time" or one of the next six
  months × trip length × class), stalest first, and keeps each destination's daily price. After a few days, a fare
  can be compared with that destination's usual price, which is what the Deals page ranks on.
- **Tracked routes (Google Flights).** One search is one route, class and departure date. Each run checks the
  stalest dates first, rotating over all routes and classes, so the price calendars fill in over time.

The budget is set in the dashboard's *Settings* (`explore_per_run` and `searches_per_run` in `routes.json`, 1 each
by default). With 2 runs a day that is about **120 searches a month**, which leaves room on SerpApi's 250-search
plan for the searches you run yourself (one credit per class and date; flexible dates check 5 dates; Explore is
one credit). Settings shows the monthly total as you change it.

Prices older than `stale_days` (default 14) don't count as "cheapest", and dates that have passed are dropped.

## routes.json

Every route has origin and destination airports (one or more IATA codes; the dashboard's location picker
turns a city like "Tokyo" or a country like "Japan" into its airports, up to 7 per side), and one of two date modes:

**Specific dates**: a departure and return date, optionally ± 1–3 days. Every departure/return combination
within that flexibility is tracked, and shown in a date grid like Google Flights'.

```jsonc
{
 "id": "ams-jfk", "name": "New York",
 "from": "AMS", "to": "JFK,EWR,LGA", "trip": "return",
 "date_mode": "exact", "flex": 2,                       // 10 Apr – 20 Apr, ±2 days
 "depart_from": "2027-04-08", "depart_to": "2027-04-12",
 "return_from": "2027-04-18", "return_to": "2027-04-22",
 "cabins": ["economy", "premium", "business", "first"], "adults": 1, "max_stops": null,
 "targets": { "economy": 450 }
}
```

**Flexible dates**: any departure in a window, with a trip length: a fixed number of nights, a range, or weekends.

```jsonc
{
 "id": "ams-bcn", "name": "Barcelona weekend",
 "from": "AMS,RTM,EIN", "to": "BCN", "trip": "return",
 "date_mode": "flexible", "depart_from": "2026-11-01", "depart_to": "2026-12-31",
 "length": "weekend", "weekdays": [3, 4], "nights_min": 2, "nights_max": 3,   // leave Thu/Fri, 2–3 nights
 // or: "nights": 7   or: "nights_min": 5, "nights_max": 9
 "cabins": ["economy"], "adults": 2, "max_stops": 0, "targets": {}
}
```

One-way trips use `"trip": "oneway"` and leave out the return/nights fields. Settings:

```jsonc
"settings": {
 "currency": "EUR", "drop_threshold_pct": 5, "stale_days": 14,
 "searches_per_run": 1,                      // tracked-route searches per run
 "explore_per_run": 1,                       // deal-finder (Explore) searches per run
 "home_airports": ["AMS"],                   // where deals are found from
 "deal_cabins": ["economy"], "deal_durations": ["week"], "deal_months": 6   // weekend | week | 2weeks
}
```

Each trip × class is one search, so check the trip count the dashboard shows when you save a route.

## Files

| File | What |
|---|---|
| `routes.json` | your routes and settings (edited by the dashboard) |
| `data/latest.json` | price calendar per route and class, plus the current cheapest fare |
| `data/history.json` | cheapest fare over time |
| `data/alerts.json` | recent drops |
| `data/deals.json` | Explore results per home airport, month, trip length and class, with each destination's price history |
| `check.py` | one search run |
| `flights/providers.py` | Google Flights (SerpApi) and demo data |
| `flights/planner.py` | which dates to search within the budget |
| `flights/explore.py` | the deal finder: Explore searches, planning and "below usual" measures |
| `index.html`, `css/`, `js/` | the site (static, no build step); `js/views/` has one file per page |
| `vendor/leaflet/` | Leaflet 1.9.4 (BSD-2) for the Explore map |
| `worker/` | the live search API (Cloudflare Worker) |
| `api.json` | the live search API's address (written by the *Deploy search API* workflow) |

## Running locally

```
python -m venv .venv
.venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest -q tests
SERPAPI_KEY=... .venv/bin/python check.py     # or: python check.py --demo
python -m http.server                          # site at http://localhost:8000
```

Switching between demo and real data (or changing currency) starts with fresh data automatically.
