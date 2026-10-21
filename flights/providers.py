"""Flight price sources. Each provider turns one Query into one result row.

- SerpApiProvider: Google Flights results via https://serpapi.com (needs SERPAPI_KEY).
- DemoProvider: made-up but stable prices, so the dashboard can be tried without a key.
"""
import hashlib
from dataclasses import dataclass
from datetime import date
from urllib.parse import quote

import httpx

CABINS = ["economy", "premium", "business", "first"]
CABIN_LABEL = {"economy": "economy", "premium": "premium economy", "business": "business class", "first": "first class"}
SERPAPI_CLASS = {"economy": 1, "premium": 2, "business": 3, "first": 4}


@dataclass(frozen=True)
class Query:
    route_id: str
    origin: str          # one or more IATA codes, comma-separated ("AMS,BRU")
    destination: str
    cabin: str
    depart: date
    return_: date | None  # None for one-way
    adults: int = 1
    max_stops: int | None = None
    currency: str = "EUR"
    key: str = ""         # calendar key the result is stored under (see planner.trips)


def google_flights_url(q: Query) -> str:
    """A Google Flights link that opens this search (used when the provider gives none)."""
    text = f"Flights from {q.origin.replace(',', ' or ')} to {q.destination.replace(',', ' or ')} on {q.depart.isoformat()}"
    text += f" returning {q.return_.isoformat()}" if q.return_ else " one way"
    text += f" {CABIN_LABEL[q.cabin]}"
    if q.adults > 1:
        text += f" {q.adults} adults"
    return f"https://www.google.com/travel/flights?q={quote(text)}&curr={q.currency}"


def serpapi_stops(max_stops: int | None) -> int:
    """SerpApi 'stops': 0 any, 1 nonstop, 2 max one stop, 3 max two stops."""
    if max_stops is None or max_stops > 2:
        return 0
    return max_stops + 1


def _time(airport: dict) -> str:
    return (airport or {}).get("time", "")


def parse_serpapi(data: dict, q: Query) -> dict:
    """Picks the cheapest itinerary from a SerpApi google_flights response."""
    url = data.get("search_metadata", {}).get("google_flights_url") or google_flights_url(q)
    options = [o for o in data.get("best_flights", []) + data.get("other_flights", []) if o.get("price")]
    insights = data.get("price_insights", {})
    row = {"status": "ok", "url": url, "level": insights.get("price_level"), "typical": insights.get("typical_price_range")}
    if not options:
        return row | {"status": "none", "detail": data.get("error", "No flights found")}
    best = min(options, key=lambda o: (o["price"], o.get("total_duration", 0)))
    legs = best.get("flights", [])
    airlines = []
    for leg in legs:
        if leg.get("airline") and leg["airline"] not in airlines:
            airlines.append(leg["airline"])
    return row | {
        "price": best["price"],
        "airlines": airlines,
        "logo": best.get("airline_logo") or (legs[0].get("airline_logo") if legs else None),
        "stops": max(len(legs) - 1, 0),
        "duration": best.get("total_duration"),
        "depart_time": _time(legs[0].get("departure_airport")) if legs else "",
        "arrive_time": _time(legs[-1].get("arrival_airport")) if legs else "",
        "legs": [
            {
                "from": (leg.get("departure_airport") or {}).get("id", ""),
                "to": (leg.get("arrival_airport") or {}).get("id", ""),
                "flight": leg.get("flight_number", ""),
                "airline": leg.get("airline", ""),
            }
            for leg in legs
        ],
    }


class SerpApiProvider:
    name = "Google Flights (SerpApi)"
    demo = False

    def __init__(self, api_key: str, client: httpx.Client | None = None):
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=60)

    def search(self, q: Query) -> dict:
        params = {
            "engine": "google_flights",
            "departure_id": q.origin,
            "arrival_id": q.destination,
            "outbound_date": q.depart.isoformat(),
            "type": 1 if q.return_ else 2,
            "travel_class": SERPAPI_CLASS[q.cabin],
            "adults": q.adults,
            "stops": serpapi_stops(q.max_stops),
            "currency": q.currency,
            "hl": "en",
            "api_key": self.api_key,
        }
        if q.return_:
            params["return_date"] = q.return_.isoformat()
        try:
            r = self.client.get("https://serpapi.com/search.json", params=params)
        except httpx.HTTPError as e:
            return {"status": "error", "detail": type(e).__name__, "url": google_flights_url(q)}
        try:
            data = r.json()
        except ValueError:
            data = {}
        if r.status_code != 200:
            return {"status": "error", "detail": data.get("error", f"HTTP {r.status_code}"), "url": google_flights_url(q)}
        return parse_serpapi(data, q)


# Rough price level per cabin relative to economy, used by the demo provider only.
DEMO_FACTOR = {"economy": 1.0, "premium": 1.7, "business": 3.8, "first": 6.5}
DEMO_AIRLINES = ["KLM", "Lufthansa", "Air France", "Emirates", "Qatar Airways", "Turkish Airlines", "SWISS", "Delta"]


class DemoProvider:
    """Made-up prices that stay the same per day, so trends and drops look realistic. Never real data."""
    name = "Demo data"
    demo = True

    def __init__(self, today: date):
        self.today = today

    def _rand(self, *parts) -> float:
        h = hashlib.sha256("|".join(str(p) for p in parts).encode()).digest()
        return int.from_bytes(h[:4], "big") / 2**32

    def search(self, q: Query) -> dict:
        base = 250 + 600 * self._rand(q.origin, q.destination)
        weekday = 1.15 if q.depart.weekday() in (4, 6) else 0.95 if q.depart.weekday() in (1, 2) else 1.0
        lead = (q.depart - self.today).days
        lead_factor = 1.3 if lead < 21 else 1.0 if lead < 120 else 1.08
        noise = 0.85 + 0.3 * self._rand(q, self.today)
        trip = 1.0 if q.return_ else 0.6
        price = round(base * DEMO_FACTOR[q.cabin] * weekday * lead_factor * noise * trip * q.adults)
        stops = int(self._rand(q.cabin, q.depart) * 3)
        if q.max_stops is not None:
            stops = min(stops, q.max_stops)
        airline = DEMO_AIRLINES[int(self._rand(q.depart, q.cabin, "a") * len(DEMO_AIRLINES))]
        typical = [round(base * DEMO_FACTOR[q.cabin] * trip * q.adults * f) for f in (0.95, 1.2)]
        level = "low" if price < typical[0] else "high" if price > typical[1] else "typical"
        return {
            "status": "ok",
            "price": price,
            "airlines": [airline],
            "stops": stops,
            "duration": 180 + 240 * stops + int(self._rand(q.origin, q.destination, "d") * 600),
            "depart_time": f"{q.depart.isoformat()} 10:{int(self._rand(q, 'm') * 6)}5",
            "arrive_time": "",
            "legs": [],
            "level": level,
            "typical": typical,
            "url": google_flights_url(q),
        }
