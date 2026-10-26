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
            {"price": 2650, "airline_logo": "https://g/tk.png", "total_duration": 1100, "flights": [
                leg("AMS", "IST", "Turkish Airlines", "TK 1952", "2027-02-01 06:00", "2027-02-01 10:30"),
                leg("IST", "NRT", "Turkish Airlines", "TK 52", "2027-02-01 13:00", "2027-02-02 07:00")]},
            {"total_duration": 500, "flights": []},
        ],
        "price_insights": {"price_level": "low", "typical_price_range": [2800, 3600]},
    }
    r = parse_serpapi(data, Q)
    assert r["price"] == 2650 and r["stops"] == 1 and r["airlines"] == ["Turkish Airlines"]
    assert r["depart_time"] == "2027-02-01 06:00" and r["arrive_time"] == "2027-02-02 07:00"
    assert r["level"] == "low" and r["url"] == "https://g/x" and r["logo"] == "https://g/tk.png"


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


def test_fatal_serpapi_errors():
    from flights.providers import fatal_error
    assert "API key" in fatal_error(401, "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key")
    assert "searches left" in fatal_error(429, "Your account has run out of searches.")
    assert fatal_error(200, "Google Flights hasn't returned any results for this query.") is None
    assert fatal_error(500, "") is None


def test_serpapi_provider_flags_bad_key():
    import httpx
    from flights.providers import SerpApiProvider
    client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(401, json={"error": "Invalid API key."})))
    row = SerpApiProvider("bad", client).search(Q)
    assert row["status"] == "error" and row["fatal"] and "SERPAPI_KEY" in row["detail"]


def test_serpapi_explore_request_and_parse():
    import httpx
    from flights.explore import ExploreQuery
    from flights.providers import SerpApiProvider
    seen = {}

    def handler(req):
        seen.update(dict(req.url.params))
        return httpx.Response(200, json={"destinations": [{"name": "Rome", "country": "Italy", "flight_price": 120,
                                                           "destination_airport": {"code": "FCO"}}]})
    p = SerpApiProvider("k", httpx.Client(transport=httpx.MockTransport(handler)))
    res = p.explore(ExploreQuery("AMS", 3, "weekend", "business"))
    assert seen["engine"] == "google_travel_explore" and seen["departure_id"] == "AMS"
    assert seen["travel_class"] == "3" and seen["travel_duration"] == "1" and seen["month"] == "3"
    assert res["status"] == "ok" and res["destinations"][0]["code"] == "FCO"
    assert "flight_price" in res["raw_fields"]
    seen.clear()
    p.explore(ExploreQuery("AMS", 0, "week", "economy"))
    assert "month" not in seen and "interest" not in seen  # "any time" sends no month
    seen.clear()
    p.explore(ExploreQuery("AMS", 0, "week", "economy", interest="sun"))
    assert seen["interest"] == "/m/0b3yr"


def test_serpapi_explore_bad_key_is_fatal():
    import httpx
    from flights.explore import ExploreQuery
    from flights.providers import SerpApiProvider
    p = SerpApiProvider("bad", httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, json={"error": "Invalid API key."}))))
    assert p.explore(ExploreQuery("AMS", 0, "week", "economy"))["fatal"]


def test_layover_limits_are_sent_and_applied():
    import httpx
    from datetime import date
    from flights.providers import Query, SerpApiProvider
    seen = {}
    opt = lambda price, minutes, airport, overnight=False: {"price": price, "flights": [{}, {}],
        "layovers": [{"id": airport, "duration": minutes, "overnight": overnight}]}

    def handler(req):
        seen.update(dict(req.url.params))
        return httpx.Response(200, json={"best_flights": [opt(300, 35, "CDG"), opt(320, 900, "FRA"), opt(330, 120, "IST", True),
                                                          opt(340, 120, "LHR"), opt(360, 150, "FRA")]})
    p = SerpApiProvider("k", httpx.Client(transport=httpx.MockTransport(handler)))
    q = Query("r", "AMS", "JFK", "economy", date(2027, 3, 1), None, min_layover=60, max_layover=480, no_overnight=True, avoid="LHR")
    res = p.search(q)
    assert seen["layover_duration"] == "60,480" and seen["exclude_conns"] == "LHR"
    assert res["price"] == 360 and res["layovers"][0]["id"] == "FRA" and res["layovers"][0]["duration"] == 150
    res = p.search(Query("r", "AMS", "JFK", "economy", date(2027, 3, 1), None, min_layover=600, max_layover=700))
    assert res["status"] == "none" and "layover" in res["detail"]
