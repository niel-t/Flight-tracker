"""Searches flight prices for the routes in routes.json, updates data/*.json and sends ntfy alerts on drops.

Run by GitHub Actions on a schedule; can also be run locally:
    SERPAPI_KEY=... python check.py        # real Google Flights prices
    python check.py --demo                 # made-up prices, to try the dashboard
"""
import argparse
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flights.alerts import detect_drop, send_ntfy
from flights.explore import month_mismatch, plan_explore, prune_deals, slices, update_slice
from flights.planner import plan, route_cabins, trips
from flights.providers import CABIN_LABEL, DemoProvider, SerpApiProvider

ROOT = Path(__file__).parent
DATA = ROOT / "data"
MAX_ALERTS = 100
MAX_HISTORY = 500

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("check")


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def prune(latest: dict, routes: list[dict], today: date):
    """Drops data for removed routes/cabins and for dates that passed or left the window."""
    kept = {}
    for route in routes:
        valid = {key for key, _, _ in trips(route, today)}
        old = latest.get("routes", {}).get(route["id"], {})
        kept[route["id"]] = {}
        for cabin in route_cabins(route):
            entry = old.get(cabin, {})
            entry["calendar"] = {d: row for d, row in entry.get("calendar", {}).items() if d in valid}
            kept[route["id"]][cabin] = entry
    latest["routes"] = kept


def cheapest(calendar: dict, now: datetime, stale_days: int) -> dict | None:
    cutoff = (now - timedelta(days=stale_days)).isoformat(timespec="seconds")
    rows = [(d, r) for d, r in calendar.items() if r.get("status") == "ok" and r.get("price") and r["checked"] >= cutoff]
    if not rows:
        return None
    key, r = min(rows, key=lambda x: (x[1]["price"], x[0]))
    return {"date": key.split("+")[0]} | {k: v for k, v in r.items() if k != "status"}


def route_name(route: dict) -> str:
    return route.get("name") or f"{route['from']} → {route['to']}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="use made-up prices instead of Google Flights")
    ap.add_argument("--demo-if-no-key", action="store_true", help="use demo prices when SERPAPI_KEY is not set")
    ap.add_argument("--budget", type=int, help="number of searches this run (default: settings.searches_per_run)")
    ap.add_argument("--explore-budget", type=int, help="number of Explore searches this run (default: settings.explore_per_run)")
    ap.add_argument("--now", help=argparse.SUPPRESS)  # ISO time, for tests and seeding demo history
    args = ap.parse_args()

    config = load(ROOT / "routes.json", {})
    settings = config.get("settings", {})
    routes = config.get("routes", [])
    currency = settings.get("currency", "EUR")
    threshold = float(settings.get("drop_threshold_pct", 5))
    stale_days = int(settings.get("stale_days", 14))
    budget = args.budget if args.budget is not None else int(settings.get("searches_per_run", 1))
    explore_budget = args.explore_budget if args.explore_budget is not None else int(settings.get("explore_per_run", 1))

    now = datetime.fromisoformat(args.now) if args.now else datetime.now(timezone.utc).replace(microsecond=0)
    today = now.date()
    key = os.environ.get("SERPAPI_KEY", "").strip()
    if args.demo or (args.demo_if_no_key and not key):
        provider = DemoProvider(today)
    elif key:
        provider = SerpApiProvider(key)
    else:
        log.error("SERPAPI_KEY is not set. Add it as a repository secret, or run with --demo.")
        return 1

    latest = load(DATA / "latest.json", {})
    history = load(DATA / "history.json", {})
    alerts = load(DATA / "alerts.json", [])
    deals = load(DATA / "deals.json", {})
    if latest.get("demo", provider.demo) != provider.demo or latest.get("currency", currency) != currency:
        log.info("Data source or currency changed: starting with fresh data")
        latest, history, alerts = {}, {}, []
    if deals.get("demo", provider.demo) != provider.demo or deals.get("currency", currency) != currency:
        deals = {}
    prune(latest, routes, today)
    history = {rid: h for rid, h in history.items() if rid in latest["routes"]}

    queries = plan(routes, latest, today, budget, currency)
    log.info("%s: %d searches", provider.name, len(queries))
    fatal = None
    for q in queries:
        row = provider.search(q)
        if row.get("fatal"):
            fatal = row["detail"]
            log.error("%s. Stopping this run.", fatal)
            break
        row |= {"checked": now.isoformat(), "return_date": q.return_.isoformat() if q.return_ else None}
        cal = latest["routes"][q.route_id][q.cabin]["calendar"]
        if row["status"] == "error" and q.key in cal:
            # keep the last good price, but mark it so the next run doesn't retry it first
            cal[q.key] |= {"checked": row["checked"], "error": row.get("detail", "")}
        else:
            cal[q.key] = row
        log.info("  %s %-8s %s → %s: %s", q.route_id, q.cabin, q.depart, q.return_ or "one way", row.get("price") or row["status"] + " " + row.get("detail", ""))

    # deal finder: the cheapest destinations from the home airports (Google Travel Explore)
    wanted = slices(settings, today)
    prune_deals(deals, wanted, today)
    for q in [] if fatal else plan_explore(wanted, deals, explore_budget):
        res = provider.explore(q)
        if res.get("fatal"):
            fatal = res["detail"]
            log.error("%s. Stopping this run.", fatal)
            break
        if res["status"] != "ok":
            log.warning("  explore %s: %s", q.key, res.get("detail"))
            deals.setdefault("slices", {}).setdefault(q.key, {}).update(checked=now.isoformat(), error=res.get("detail", ""))
            continue
        dests = res["destinations"]
        update_slice(deals, q, dests, now, provider.name)
        log.info("  explore %s: %d destinations, cheapest %s", q.key, len(dests),
                 f"{dests[0]['name']} {currency} {dests[0]['price']}" if dests else "-")
        if res.get("raw_fields"):
            log.info("    fields: %s", ", ".join(res["raw_fields"]))
        if month_mismatch(q, dests):
            log.warning("    most dates are outside month %d: the month filter may not be supported", q.month)

    sent = 0
    for route in routes:
        for cabin in route_cabins(route):
            entry = latest["routes"][route["id"]][cabin]
            prev = (entry.get("cheapest") or {}).get("price")
            best = cheapest(entry["calendar"], now, stale_days)
            entry["cheapest"] = best
            if not best:
                continue
            points = history.setdefault(route["id"], {}).setdefault(cabin, [])
            if not points or points[-1][1] != best["price"] or points[-1][0][:10] != now.date().isoformat():
                points.append([now.isoformat(), best["price"]])
                del points[:-MAX_HISTORY]
            target = (route.get("targets") or {}).get(cabin)
            reason = detect_drop(prev, best["price"], target, threshold)
            if not reason:
                continue
            alert = {
                "time": now.isoformat(), "route": route["id"], "name": route_name(route), "cabin": cabin,
                "date": best["date"], "return_date": best.get("return_date"), "price": best["price"],
                "previous": prev, "reason": reason, "url": best.get("url", ""),
            }
            alerts.insert(0, alert)
            log.info("ALERT %s %s: %s %s (%s)", route["id"], cabin, currency, best["price"], reason)
            if not provider.demo:
                title = f"✈ {route_name(route)} {CABIN_LABEL[cabin]}: {currency} {best['price']}"
                when = best["date"] + (f" – {best['return_date']}" if best.get("return_date") else "")
                body = f"{reason}" + (f" (was {currency} {prev})" if prev else "") + f"\n{when}, {', '.join(best.get('airlines', []))}"
                sent += send_ntfy(os.environ.get("NTFY_TOPIC", ""), title, body, best.get("url", ""))

    latest |= {"updated": now.isoformat(), "source": provider.name, "demo": provider.demo, "currency": currency}
    DATA.mkdir(exist_ok=True)
    save(DATA / "latest.json", latest)
    save(DATA / "history.json", history)
    save(DATA / "alerts.json", alerts[:MAX_ALERTS])
    deals |= {"updated": now.isoformat(), "source": provider.name, "demo": provider.demo, "currency": currency,
              "origins": sorted({q.origin for q in wanted})}
    save(DATA / "deals.json", deals)
    log.info("Done. %d notifications sent.", sent)
    if fatal:
        # a red run makes GitHub email you, and shows the reason in the Actions tab
        print(f"::error title=Flight search failed::{fatal}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
