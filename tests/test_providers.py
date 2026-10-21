from datetime import date

from flights.providers import DemoProvider, Query, google_flights_url, parse_serpapi, serpapi_stops

Q = Query("r", "AMS", "NRT,HND", "business", date(2027, 2, 1), date(2027, 2, 15))


def leg(a, b, airline, fn, t1, t2):
    return {"departure_airport": {"id": a, "time": t1}, "arrival_airport": {"id": b, "time": t2},
            "airline": airline, "flight_number": fn}


def test_parse_picks_cheapest():
    data = {
        "search_metadata": {"google_flights_url": "https://g/x"},
        "best_flights": [{"price": 3100, "total_duration": 800, "flights": [leg("AMS", "HND", "KLM", "KL 861", "2027-02-01 14:00", "2027-02-02 09:00")]}],
        "other_flights": [
            {"price": 2650, "total_duration": 1100, "flights": [
                leg("AMS", "IST", "Turkish Airlines", "TK 1952", "2027-02-01 06:00", "2027-02-01 10:30"),
                leg("IST", "NRT", "Turkish Airlines", "TK 52", "2027-02-01 13:00", "2027-02-02 07:00")]},
            {"total_duration": 500, "flights": []},
        ],
        "price_insights": {"price_level": "low", "typical_price_range": [2800, 3600]},
    }
    r = parse_serpapi(data, Q)
    assert r["price"] == 2650 and r["stops"] == 1 and r["airlines"] == ["Turkish Airlines"]
    assert r["depart_time"] == "2027-02-01 06:00" and r["arrive_time"] == "2027-02-02 07:00"
    assert r["level"] == "low" and r["url"] == "https://g/x"


def test_parse_no_results():
    r = parse_serpapi({"error": "Google Flights hasn't returned any results for this query."}, Q)
    assert r["status"] == "none" and "results" in r["detail"] and "google.com/travel/flights" in r["url"]


def test_stops_mapping():
    assert [serpapi_stops(s) for s in (None, 0, 1, 2, 3)] == [0, 1, 2, 3, 0]


def test_google_url():
    url = google_flights_url(Q)
    assert "AMS%20to%20NRT%20or%20HND" in url and "returning%202027-02-15" in url and "business%20class" in url


def test_demo_is_stable_and_ordered_by_cabin():
    p = DemoProvider(date(2026, 10, 21))
    assert p.search(Q)["price"] == p.search(Q)["price"]
    eco = Query("r", "AMS", "NRT", "economy", date(2027, 2, 2), None)
    first = Query("r", "AMS", "NRT", "first", date(2027, 2, 2), None)
    assert p.search(first)["price"] > 3 * p.search(eco)["price"]
