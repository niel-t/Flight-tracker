from datetime import date, datetime, timezone

from flights.explore import (ExploreQuery, demo_explore, month_mismatch, parse_explore, plan_explore,
                             prune_deals, slices, upcoming_months, update_slice)

TODAY = date(2026, 10, 26)
RAW = {
    "destinations": [
        {"name": "Barcelona", "country": "Spain", "destination_airport": {"code": "BCN"}, "flight_price": 142,
         "start_date": "2027-03-04", "end_date": "2027-03-11", "number_of_stops": 0, "flight_duration": 135,
         "airline": "Vueling", "gps_coordinates": {"latitude": 41.38, "longitude": 2.17}, "thumbnail": "https://img/bcn.jpg"},
        {"name": "Lisbon", "country": "Portugal", "destination_airport": {"code": "lis"}, "flight_price": "€98",
         "start_date": "2027-03-10", "end_date": "2027-03-17", "number_of_stops": 1, "flight_duration": 290, "airline": "TAP"},
        {"name": "No price", "country": "Nowhere"},
    ]
}


def test_parse_explore_reads_fields_and_sorts_by_price():
    out = parse_explore(RAW)
    assert [d["name"] for d in out] == ["Lisbon", "Barcelona"]
    lis, bcn = out
    assert lis["price"] == 98 and lis["code"] == "LIS" and lis["stops"] == 1
    assert bcn["lat"] == 41.38 and bcn["image"] == "https://img/bcn.jpg" and bcn["start_date"] == "2027-03-04"


def test_slices_cover_any_time_and_next_six_months():
    assert upcoming_months(TODAY, 6) == [11, 12, 1, 2, 3, 4]
    s = slices({"home_airports": ["ams", "BRU"], "deal_cabins": ["economy", "business"], "deal_durations": ["week", "bogus"], "deal_interests": []}, TODAY)
    assert len(s) == 2 * 2 * 1 * 7
    assert s[0].key == "AMS|0|week|economy"


def test_plan_takes_never_checked_any_time_first_then_stalest():
    s = slices({"home_airports": ["AMS"]}, TODAY)
    assert plan_explore(s, {}, 2)[0].month == 0
    deals = {"slices": {q.key: {"checked": f"2026-10-{10 + i:02d}T00:00:00"} for i, q in enumerate(s)}}
    assert plan_explore(s, deals, 1)[0].key == s[0].key  # oldest check


def test_update_slice_measures_against_usual_price():
    q = ExploreQuery("AMS", 3, "week", "economy")
    deals = {}
    for day, price in [(1, 200), (2, 210), (3, 190)]:
        update_slice(deals, q, [{"name": "Rome", "code": "FCO", "price": price}], datetime(2026, 10, day, tzinfo=timezone.utc), "test")
    today = [{"name": "Rome", "code": "FCO", "price": 150}]
    update_slice(deals, q, today, datetime(2026, 10, 4, tzinfo=timezone.utc), "test")
    d = deals["slices"][q.key]["destinations"][0]
    assert d["usual"] == 200 and d["drop_pct"] == 25 and d["new_low"] is True
    assert len(deals["history"]["AMS|3|week|economy|FCO|Rome"]) == 4


def test_same_day_check_replaces_the_day_point():
    q = ExploreQuery("AMS", 0, "week", "economy")
    deals = {}
    update_slice(deals, q, [{"name": "Rome", "code": "FCO", "price": 200}], datetime(2026, 10, 1, 6, tzinfo=timezone.utc), "t")
    update_slice(deals, q, [{"name": "Rome", "code": "FCO", "price": 180}], datetime(2026, 10, 1, 18, tzinfo=timezone.utc), "t")
    assert deals["history"]["AMS|0|week|economy|FCO|Rome"] == [["2026-10-01", 180]]


def test_month_mismatch_detects_ignored_month_filter():
    q = ExploreQuery("AMS", 3, "week", "economy")
    inside = [{"start_date": "2027-03-0%d" % i} for i in range(1, 7)]
    outside = [{"start_date": "2026-12-0%d" % i} for i in range(1, 7)]
    assert not month_mismatch(q, inside)
    assert month_mismatch(q, outside)


def test_prune_drops_unwanted_slices_and_old_history():
    wanted = slices({"home_airports": ["AMS"]}, TODAY)
    deals = {"slices": {"AMS|0|week|economy": {}, "XXX|0|week|economy": {}},
             "history": {"AMS|0|week|economy|FCO|Rome": [["2026-01-01", 1], ["2026-10-20", 2]], "XXX|0|week|economy|FCO|Rome": [["2026-10-20", 1]],
                         "AMS|0|week|economy|FCO": [["2026-10-20", 3]]}}  # old key format
    prune_deals(deals, wanted, TODAY)
    assert list(deals["slices"]) == ["AMS|0|week|economy"]
    assert deals["history"] == {"AMS|0|week|economy|FCO|Rome": [["2026-10-20", 2]]}


def test_demo_explore_is_stable_and_respects_month():
    q = ExploreQuery("AMS", 3, "week", "economy")
    a, b = demo_explore(q, TODAY), demo_explore(q, TODAY)
    assert a == b and len(a) > 10
    assert all(d["start_date"][5:7] == "03" for d in a)
    assert a == sorted(a, key=lambda d: d["price"])


def test_trip_type_slices_have_their_own_key_and_any_time_comes_early():
    s = slices({"home_airports": ["AMS"], "deal_interests": ["sun", "bogus"], "deal_interest_months": 2}, TODAY)
    sun = [q for q in s if q.interest]
    assert [q.key for q in sun] == ["AMS|0|week|economy|sun", "AMS|11|week|economy|sun", "AMS|12|week|economy|sun"]
    assert [q.key for q in plan_explore(s, {}, 3)] == ["AMS|0|week|economy", "AMS|0|week|economy|sun", "AMS|11|week|economy"]
    assert len(slices({"home_airports": ["AMS"], "deal_interests": []}, TODAY)) == 7


def test_prune_keeps_trip_type_history():
    q = ExploreQuery("AMS", 0, "week", "economy", interest="sun")
    now = datetime(2026, 10, 26, tzinfo=timezone.utc)
    deals = {}
    update_slice(deals, q, demo_explore(q, TODAY), now, "demo")
    assert deals["slices"][q.key]["interest"] == "sun"
    n = len(deals["history"])
    prune_deals(deals, [q], TODAY)
    assert len(deals["history"]) == n > 0
    prune_deals(deals, [ExploreQuery("AMS", 0, "week", "economy")], TODAY)
    assert deals["history"] == {} and deals["slices"] == {}


def test_demo_trip_types_only_list_matching_places():
    names = {d["name"] for d in demo_explore(ExploreQuery("AMS", 0, "week", "economy", interest="adventure"), TODAY)}
    assert names and names <= {"Reykjavik", "Tenerife", "Marrakesh", "Nairobi", "Cape Town", "Bali", "Oslo", "Sydney", "Mexico City", "Rio de Janeiro", "Toronto"}
