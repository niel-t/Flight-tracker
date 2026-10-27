"""Deal discovery with Google Travel Explore: one search lists the cheapest destinations from an airport.

A "slice" is one Explore search: origin × month × trip length × class (× trip type). Each run refreshes the stalest
slices (settings.explore_per_run), and every destination's price is kept per day, so a deal can be
measured against that destination's usual price ("23% below usual") instead of just being cheap.
"""
import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime
from statistics import median

DURATIONS = {"weekend": 1, "week": 2, "2weeks": 3}  # SerpApi travel_duration
DURATION_LABEL = {"weekend": "weekend", "week": "1 week", "2weeks": "2 weeks"}
# Trip types map to Google's own travel interests (Knowledge Graph ids for SerpApi's `interest`):
# Google ranks destinations for an interest from its travel data, such as reviews of places to see there.
INTERESTS = {
    "sun": "/m/0b3yr",              # beaches
    "city": "/m/09cmq",             # museums
    "adventure": "/g/11bc58l13w",   # outdoors
    "sightseeing": "/m/03g3w",      # history
}
MAX_HISTORY_DAYS = 90


@dataclass(frozen=True)
class ExploreQuery:
    origin: str
    month: int          # 0 = any time in the next six months, else 1-12
    duration: str       # weekend | week | 2weeks
    cabin: str
    currency: str = "EUR"
    interest: str = ""  # "" = Google's popular picks, else a key of INTERESTS

    @property
    def key(self) -> str:
        base = f"{self.origin}|{self.month}|{self.duration}|{self.cabin}"
        return f"{base}|{self.interest}" if self.interest else base


def upcoming_months(today: date, count: int) -> list[int]:
    """The next `count` calendar months, starting with next month (1-12)."""
    return [((today.month - 1 + i) % 12) + 1 for i in range(1, count + 1)]


def slices(settings: dict, today: date) -> list[ExploreQuery]:
    origins = [o.strip().upper() for o in settings.get("home_airports", ["AMS"]) if o.strip()]
    cabins = settings.get("deal_cabins") or ["economy"]
    durations = [d for d in settings.get("deal_durations") or ["week"] if d in DURATIONS]
    months = [0] + upcoming_months(today, int(settings.get("deal_months", 6)))
    currency = settings.get("currency", "EUR")
    out = [ExploreQuery(o, m, d, c, currency) for o in origins for c in cabins for d in durations for m in months]
    # trip types cover fewer months: each one is another search per slice
    interests = [i for i in settings.get("deal_interests", list(INTERESTS)) if i in INTERESTS]
    interest_months = months[:1 + int(settings.get("deal_interest_months", 3))]
    out += [ExploreQuery(o, m, d, c, currency, i)
            for o in origins for c in cabins for d in durations for i in interests for m in interest_months]
    return out


def plan_explore(all_slices: list[ExploreQuery], deals: dict, budget: int) -> list[ExploreQuery]:
    """Stalest first; never-checked slices first of all, 'any time' before single months, popular before trip types.

    'Any time' per trip type comes early because it tells which places suit a trip type, which the
    dashboard also applies to months that weren't searched for that trip type.
    """
    checked = {k: s.get("checked", "") for k, s in deals.get("slices", {}).items()}
    order = sorted(all_slices, key=lambda q: (checked.get(q.key, ""), q.month != 0, q.interest != ""))
    return order[:budget]


def _number(v):
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        m = re.search(r"\d[\d,.]*", v)
        if m:
            return float(m.group().replace(",", "")) if "." in m.group() else int(m.group().replace(",", ""))
    return None


def _date(v) -> str | None:
    """'2026-11-12', '2026-11-12T00:00:00' or similar -> '2026-11-12'."""
    if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v):
        return v[:10]
    return None


def parse_explore(data: dict) -> list[dict]:
    """Destinations from a SerpApi google_travel_explore response, cheapest first.

    Field names are read defensively: SerpApi's examples differ slightly between versions.
    """
    out = []
    for d in data.get("destinations") or []:
        price = _number(d.get("flight_price", d.get("price")))
        if not price:
            continue
        airport = d.get("destination_airport") or {}
        gps = d.get("gps_coordinates") or {}
        out.append({
            "name": d.get("name") or d.get("title") or "",
            "country": d.get("country") or "",
            "code": (airport.get("code") or d.get("destination_airport_code") or d.get("airport_code") or d.get("arrival_id") or "").upper()[:3],
            "id": d.get("destination_id") or d.get("kgmid") or "",
            "price": price,
            "start_date": _date(d.get("start_date") or d.get("outbound_date")),
            "end_date": _date(d.get("end_date") or d.get("return_date")),
            "stops": _number(d.get("number_of_stops", d.get("stops"))),
            "duration": _number(d.get("flight_duration")),
            "airline": d.get("airline") or "",
            "airline_code": d.get("airline_code") or "",
            "lat": gps.get("latitude"),
            "lon": gps.get("longitude"),
            "image": d.get("thumbnail") or d.get("image") or "",
            "link": d.get("link") or d.get("google_flights_link") or "",
        })
    out.sort(key=lambda x: x["price"])
    return out


def dest_key(q: ExploreQuery, d: dict) -> str:
    """Several places can share an airport (Dublin, Galway and Kilkenny all fly into DUB), so the name counts too."""
    return f"{q.key}|{d['code']}|{d['name']}"


def update_slice(deals: dict, q: ExploreQuery, dests: list[dict], now: datetime, source: str) -> None:
    """Stores a slice and adds today's price per destination to its history, with deal measures."""
    day = now.date().isoformat()
    history = deals.setdefault("history", {})
    for d in dests:
        points = history.setdefault(dest_key(q, d), [])
        earlier = [p for p in points if p[0] != day]
        prices = [p[1] for p in earlier]
        if len(prices) >= 3:
            usual = median(prices)
            d["usual"] = round(usual)
            d["drop_pct"] = round((usual - d["price"]) / usual * 100)
        if prices:
            d["lowest_before"] = min(prices)
            d["new_low"] = d["price"] < min(prices)
        history[dest_key(q, d)] = (earlier + [[day, d["price"]]])[-MAX_HISTORY_DAYS:]
    deals.setdefault("slices", {})[q.key] = {
        "origin": q.origin, "month": q.month, "duration": q.duration, "cabin": q.cabin, "interest": q.interest,
        "checked": now.isoformat(), "source": source, "destinations": dests,
    }


def month_mismatch(q: ExploreQuery, dests: list[dict]) -> bool:
    """True when most results fall outside the requested month (the month filter wasn't applied)."""
    if not q.month:
        return False
    dated = [d for d in dests if d["start_date"]]
    if len(dated) < 5:
        return False
    outside = sum(1 for d in dated if int(d["start_date"][5:7]) != q.month)
    return outside > len(dated) / 2


def prune_deals(deals: dict, wanted: list[ExploreQuery], today: date) -> None:
    keys = {q.key for q in wanted}
    deals["slices"] = {k: v for k, v in deals.get("slices", {}).items() if k in keys}
    cutoff = date.fromordinal(today.toordinal() - MAX_HISTORY_DAYS).isoformat()
    deals["history"] = {
        k: [p for p in pts if p[0] >= cutoff]
        for k, pts in deals.get("history", {}).items()
        if k.rsplit("|", 2)[0] in keys and len(k.split("|")) >= 6 and any(p[0] >= cutoff for p in pts)
    }


# ---------- demo ----------
# name, country, IATA, lat, lon, base price from AMS (economy, 1 week)
DEMO_PLACES = [
    ("Barcelona", "Spain", "BCN", 41.30, 2.08, 140), ("Lisbon", "Portugal", "LIS", 38.77, -9.13, 170),
    ("Rome", "Italy", "FCO", 41.80, 12.25, 150), ("Athens", "Greece", "ATH", 37.94, 23.94, 210),
    ("Istanbul", "Türkiye", "IST", 41.26, 28.74, 230), ("London", "United Kingdom", "LHR", 51.47, -0.45, 120),
    ("Paris", "France", "CDG", 49.01, 2.55, 130), ("Prague", "Czechia", "PRG", 50.10, 14.26, 110),
    ("Budapest", "Hungary", "BUD", 47.44, 19.26, 120), ("Copenhagen", "Denmark", "CPH", 55.62, 12.65, 125),
    ("Reykjavik", "Iceland", "KEF", 63.99, -22.62, 260), ("Málaga", "Spain", "AGP", 36.67, -4.50, 160),
    ("Tenerife", "Spain", "TFS", 28.04, -16.57, 240), ("Marrakesh", "Morocco", "RAK", 31.61, -8.04, 190),
    ("Dubai", "United Arab Emirates", "DXB", 25.25, 55.36, 480), ("Cairo", "Egypt", "CAI", 30.12, 31.41, 330),
    ("New York", "United States", "JFK", 40.64, -73.78, 460), ("Miami", "United States", "MIA", 25.79, -80.29, 590),
    ("Toronto", "Canada", "YYZ", 43.68, -79.63, 520), ("Mexico City", "Mexico", "MEX", 19.44, -99.07, 690),
    ("Curaçao", "Curaçao", "CUR", 12.19, -68.96, 720), ("Bangkok", "Thailand", "BKK", 13.69, 100.75, 640),
    ("Tokyo", "Japan", "NRT", 35.77, 140.39, 780), ("Bali", "Indonesia", "DPS", -8.75, 115.17, 830),
    ("Singapore", "Singapore", "SIN", 1.36, 103.99, 690), ("Cape Town", "South Africa", "CPT", -33.97, 18.60, 760),
    ("Nairobi", "Kenya", "NBO", -1.32, 36.93, 610), ("Sydney", "Australia", "SYD", -33.94, 151.18, 1250),
    ("Rio de Janeiro", "Brazil", "GIG", -22.81, -43.25, 820), ("Oslo", "Norway", "OSL", 60.19, 11.10, 130),
]
DEMO_TAGS = {
    "sun": "BCN LIS FCO ATH AGP TFS RAK DXB MIA CUR BKK DPS CPT SYD GIG MEX",
    "city": "BCN LIS FCO LHR CDG PRG BUD CPH IST JFK NRT SIN YYZ OSL",
    "adventure": "KEF TFS RAK NBO CPT DPS OSL SYD MEX GIG YYZ",
    "sightseeing": "FCO ATH IST CAI PRG BUD CDG LHR RAK MEX NRT BKK",
}
DEMO_AIRLINES = ["KLM", "Transavia", "easyJet", "Vueling", "Lufthansa", "Turkish Airlines", "Emirates", "Delta", "Air France"]
DEMO_FACTOR = {"economy": 1.0, "premium": 1.7, "business": 3.8, "first": 6.5}
DEMO_DURATION = {"weekend": 0.85, "week": 1.0, "2weeks": 1.12}


def demo_explore(q: ExploreQuery, today: date) -> list[dict]:
    """Made-up but stable destinations, so the dashboard can be tried without a key."""
    def rand(*parts) -> float:
        return int.from_bytes(hashlib.sha256("|".join(map(str, parts)).encode()).digest()[:4], "big") / 2**32

    out = []
    for name, country, code, lat, lon, base in DEMO_PLACES:
        if q.interest and code not in DEMO_TAGS[q.interest].split():
            continue
        if rand(q.key, code, "skip") < 0.12:
            continue
        month = q.month or (today.month % 12) + 1 + int(rand(q.key, code, "m") * 5)
        month = (month - 1) % 12 + 1
        year = today.year + (month <= today.month)
        day = 3 + int(rand(q.key, code, "d") * 20)
        nights = {"weekend": 2, "week": 7, "2weeks": 14}[q.duration]
        start = date(year, month, day)
        end = date.fromordinal(start.toordinal() + nights)
        noise = 0.78 + 0.4 * rand(q.key, code, today.isoformat())
        long_haul = base > 400
        out.append({
            "name": name, "country": country, "code": code, "id": "", "lat": lat, "lon": lon,
            "price": round(base * DEMO_FACTOR[q.cabin] * DEMO_DURATION[q.duration] * noise),
            "start_date": start.isoformat(), "end_date": end.isoformat(),
            "stops": int(rand(code, "s") * (3 if long_haul else 2)),
            "duration": int(base * 0.95 + rand(code, "t") * 120) if long_haul else 90 + int(base * 0.5),
            "airline": DEMO_AIRLINES[int(rand(code, "a") * len(DEMO_AIRLINES))], "airline_code": "",
            "image": "", "link": "",
        })
    out.sort(key=lambda x: x["price"])
    return out
