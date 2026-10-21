"""Decides which (route, cabin, date) searches to run, within the per-run search budget.

Each search costs one API call, so a run only checks a few dates. Over several runs every
date of every route gets checked, stalest first, so the price calendar keeps filling in.
"""
from datetime import date, timedelta

from flights.providers import CABINS, Query

SPREAD = 7  # never-checked dates are visited every 7th day first, so a new route quickly covers its whole window


def depart_dates(route: dict, today: date) -> list[date]:
    start = max(date.fromisoformat(route["depart_from"]), today + timedelta(days=1))
    end = date.fromisoformat(route.get("depart_to") or route["depart_from"])
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def return_date(route: dict, depart: date) -> date | None:
    if route.get("trip", "return") != "return":
        return None
    return depart + timedelta(days=int(route.get("nights", 7)))


def route_cabins(route: dict) -> list[str]:
    return [c for c in CABINS if c in route.get("cabins", CABINS)]


def make_query(route: dict, cabin: str, depart: date, currency: str) -> Query:
    ret = return_date(route, depart)
    return Query(
        route_id=route["id"],
        origin=route["from"].replace(" ", "").upper(),
        destination=route["to"].replace(" ", "").upper(),
        cabin=cabin,
        depart=depart,
        return_=ret,
        adults=int(route.get("adults", 1)),
        max_stops=route.get("max_stops"),
        currency=currency,
    )


def plan(routes: list[dict], latest: dict, today: date, budget: int, currency: str) -> list[Query]:
    """Round-robin over every (route, cabin), taking the stalest date of each in turn."""
    queues = []
    for route in routes:
        dates = depart_dates(route, today)
        for cabin in route_cabins(route):
            calendar = latest.get("routes", {}).get(route["id"], {}).get(cabin, {}).get("calendar", {})
            items = []
            for i, d in enumerate(dates):
                row = calendar.get(d.isoformat())
                ret = return_date(route, d)
                fresh = row and row.get("return_date") == (ret.isoformat() if ret else None)
                checked = row["checked"] if fresh else ""
                items.append((checked, (i % SPREAD, i // SPREAD), d))
            items.sort()
            if items:
                queues.append((route, cabin, [d for *_, d in items]))
    picked = []
    while len(picked) < budget and any(q for *_, q in queues):
        for route, cabin, queue in queues:
            if queue and len(picked) < budget:
                picked.append(make_query(route, cabin, queue.pop(0), currency))
    return picked
