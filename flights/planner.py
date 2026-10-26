"""Decides which (route, cabin, trip) searches to run, within the per-run search budget.

Each search costs one API call, so a run only checks a few trips. Over several runs every
trip of every route gets checked, stalest first, so the price calendar keeps filling in.

A route's trips are its departure dates, combined with one of:
- a fixed number of nights:        "nights": 14
- a range of nights (flexible):    "nights_min": 6, "nights_max": 8
- a return window (specific dates
  with some flexibility):          "return_from": "2027-02-14", "return_to": "2027-02-16"
- nothing, for one-way trips.
Departure dates can be limited to some weekdays ("weekdays": [3, 4], Monday = 0), e.g. for weekend trips.
"""
from datetime import date, timedelta

from flights.providers import CABINS, Query

SPREAD = 7  # never-checked dates are visited every 7th day first, so a new route quickly covers its whole window


def depart_dates(route: dict, today: date) -> list[date]:
    start = max(date.fromisoformat(route["depart_from"]), today + timedelta(days=1))
    end = date.fromisoformat(route.get("depart_to") or route["depart_from"])
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    weekdays = route.get("weekdays")
    return [d for d in days if d.weekday() in weekdays] if weekdays else days


def stay_lengths(route: dict, depart: date) -> list[int | None]:
    """Nights away for a departure date, or [None] for one-way."""
    if route.get("trip", "return") != "return":
        return [None]
    if route.get("return_from"):
        first = date.fromisoformat(route["return_from"])
        last = date.fromisoformat(route.get("return_to") or route["return_from"])
        return [n for n in range((first - depart).days, (last - depart).days + 1) if n >= 0]
    if route.get("nights_min") is not None:
        return list(range(int(route["nights_min"]), int(route.get("nights_max", route["nights_min"])) + 1))
    return [int(route.get("nights", 7))]


def is_single_stay(route: dict) -> bool:
    """True when every departure date has exactly one trip, so calendar keys are plain dates (as before)."""
    return route.get("trip", "return") != "return" or (not route.get("return_from") and route.get("nights_min") is None)


def trips(route: dict, today: date) -> list[tuple[str, date, date | None]]:
    """(calendar key, departure, return) for every trip of the route that is still in the future."""
    single = is_single_stay(route)
    out = []
    for d in depart_dates(route, today):
        for n in stay_lengths(route, d):
            ret = d + timedelta(days=n) if n is not None else None
            key = d.isoformat() if single else f"{d.isoformat()}+{n}"
            out.append((key, d, ret))
    return out


def return_date(route: dict, depart: date) -> date | None:
    """Return date for a route with a single stay length."""
    n = stay_lengths(route, depart)[0]
    return depart + timedelta(days=n) if n is not None else None


def route_cabins(route: dict) -> list[str]:
    return [c for c in CABINS if c in route.get("cabins", CABINS)]


def make_query(route: dict, cabin: str, depart: date, ret: date | None, currency: str, key: str = "") -> Query:
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
        key=key or depart.isoformat(),
        min_layover=route.get("min_layover"),
        max_layover=route.get("max_layover"),
        no_overnight=bool(route.get("no_overnight")),
        avoid=",".join(c.strip().upper() for c in str(route.get("avoid") or "").split(",") if c.strip()),
    )


def plan(routes: list[dict], latest: dict, today: date, budget: int, currency: str) -> list[Query]:
    """Round-robin over every (route, cabin), taking the stalest trip of each in turn."""
    queues = []
    for route in routes:
        route_trips = trips(route, today)
        day_index = {d: i for i, d in enumerate(sorted({d for _, d, _ in route_trips}))}
        for cabin in route_cabins(route):
            calendar = latest.get("routes", {}).get(route["id"], {}).get(cabin, {}).get("calendar", {})
            items = []
            for key, d, ret in route_trips:
                row = calendar.get(key)
                fresh = row and row.get("return_date") == (ret.isoformat() if ret else None)
                checked = row["checked"] if fresh else ""
                i, n = day_index[d], (ret - d).days if ret else 0
                items.append((checked, (i % SPREAD, n, i // SPREAD), key, d, ret))
            items.sort(key=lambda x: x[:2])
            if items:
                queues.append((route, cabin, [(k, d, r) for *_, k, d, r in items]))
    picked = []
    while len(picked) < budget and any(q for *_, q in queues):
        for route, cabin, queue in queues:
            if queue and len(picked) < budget:
                key, d, ret = queue.pop(0)
                picked.append(make_query(route, cabin, d, ret, currency, key))
    return picked
