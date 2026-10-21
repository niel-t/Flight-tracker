# Flight Tracker

Finds the cheapest flights on the routes you care about, in **economy, premium economy, business and first class**,
and sends a phone notification (ntfy) when a fare drops. Prices come from **Google Flights** (via [SerpApi](https://serpapi.com/google-flights-api)).
Runs on GitHub Actions, so nothing has to run on your own computer.

Unlike Google Flights, which shows one search at a time, Flight Tracker keeps watching a whole travel window
(e.g. "leave any day between 1 Feb and 15 Mar, stay 14 nights") for every class, and remembers what it saw:

- **Cheapest right now:** the lowest fare per route and class, ranked by how far below Google's typical price (or your target) it is.
- **Price calendar:** every departure date in your window, coloured from cheap to pricey, per class.
- **Trend:** the cheapest fare over time, with your target price as a line.
- **Alerts:** a notification when the cheapest fare drops by 5% or more (adjustable), or falls below your target.
- **Book:** every price links straight to that search on Google Flights.
- **Flexible airports:** `AMS,BRU` → `NRT,HND` searches all combinations at once.

**Dashboard:** https://niel-t.github.io/Flight-tracker/ (after enabling GitHub Pages, see below).

## Setup (10 minutes)

1. **Google Flights access.** Create a free account at [serpapi.com](https://serpapi.com) and copy your API key.
   In this repo: *Settings → Secrets and variables → Actions → New repository secret*, name `SERPAPI_KEY`.
   Without it the tracker runs on **demo data** (made-up prices, clearly marked on the dashboard).
2. **Phone alerts (optional).** Install the [ntfy](https://ntfy.sh) app, subscribe to a hard-to-guess topic name,
   and add it as secret `NTFY_TOPIC`.
3. **Dashboard.** *Settings → Pages*: deploy from branch `main`, folder `/ (root)`.
4. **Connect the dashboard to GitHub** so you can add routes from it: *⚙ Settings* on the dashboard explains the token
   (fine-grained, this repo only, Contents + Actions read/write; it stays in your browser).
5. **＋ Add route**, or edit [`routes.json`](routes.json) directly. Saving a route starts a search right away.

## How searching works

Each Google Flights query is **one route, one class, one departure date**, and costs one SerpApi search credit.
A 45-day window in 4 classes is 180 queries, so instead of searching everything every time, each run does a small
batch (`searches_per_run`, default 8) and picks the **stalest dates first**, rotating fairly over all routes and classes.
New routes are sampled every 7th day first, so the whole window gets a rough picture quickly, then fills in.

The workflow runs 4× a day, so the default uses about 8 × 4 × 30 ≈ **960 searches a month**. Pick a
`searches_per_run` that fits your SerpApi plan (the free plan has a small monthly allowance, so start with 1–2
per run; paid plans allow far more). The dashboard's Settings show the monthly total as you change it.

Prices older than `stale_days` (default 14) don't count as "cheapest", and dates that have passed are dropped.

## routes.json

```jsonc
{
 "settings": { "currency": "EUR", "searches_per_run": 8, "drop_threshold_pct": 5, "stale_days": 14 },
 "routes": [
  {
   "id": "ams-nrt",
   "name": "Tokyo spring trip",          // optional
   "from": "AMS",                        // one or more IATA codes: "AMS,BRU"
   "to": "NRT,HND",
   "trip": "return",                     // or "oneway"
   "depart_from": "2027-02-01",          // travel window: any departure date in between
   "depart_to": "2027-03-15",
   "nights": 14,                         // return trips only
   "cabins": ["economy", "premium", "business", "first"],
   "adults": 1,
   "max_stops": 1,                       // null = any, 0 = non-stop only
   "targets": { "economy": 650, "business": 2400 }   // optional: alert when below
  }
 ]
}
```

(JSON has no comments; they're only here for explanation.)

## Files

| File | What |
|---|---|
| `routes.json` | your routes and settings (edited by the dashboard) |
| `data/latest.json` | price calendar per route and class, plus the current cheapest fare |
| `data/history.json` | cheapest fare over time |
| `data/alerts.json` | recent drops |
| `check.py` | one search run |
| `flights/providers.py` | Google Flights (SerpApi) and demo data |
| `flights/planner.py` | which dates to search within the budget |
| `index.html` | the dashboard (static, no build step) |

## Running locally

```
python -m venv .venv
.venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest -q tests
SERPAPI_KEY=... .venv/bin/python check.py     # or: python check.py --demo
python -m http.server                          # dashboard at http://localhost:8000
```

Switching between demo and real data (or changing currency) starts with fresh data automatically.
