from datetime import date

from flights.planner import depart_dates, plan, return_date, trips

TODAY = date(2026, 10, 21)
ROUTE = {"id": "r", "from": "ams", "to": "NRT,HND", "trip": "return", "depart_from": "2026-12-01",
         "depart_to": "2026-12-20", "nights": 10, "cabins": ["business", "economy"]}


def test_dates_skip_the_past():
    route = ROUTE | {"depart_from": "2026-10-01", "depart_to": "2026-10-23"}
    assert depart_dates(route, TODAY) == [date(2026, 10, 22), date(2026, 10, 23)]


def test_return_and_one_way():
    assert return_date(ROUTE, date(2026, 12, 1)) == date(2026, 12, 11)
    assert return_date(ROUTE | {"trip": "oneway"}, date(2026, 12, 1)) is None


def test_round_robin_over_cabins_and_spread_dates():
    qs = plan([ROUTE], {}, TODAY, 4, "EUR")
    assert [(q.cabin, q.depart.day) for q in qs] == [("economy", 1), ("business", 1), ("economy", 8), ("business", 8)]
    assert qs[0].origin == "AMS" and qs[0].return_ == date(2026, 12, 11)


def test_stalest_first():
    cal = {f"2026-12-{d:02d}": {"checked": "2026-10-20T00:00:00+00:00", "return_date": f"2026-12-{d + 10:02d}"} for d in range(1, 21)}
    cal["2026-12-05"]["checked"] = "2026-10-01T00:00:00+00:00"
    latest = {"routes": {"r": {"economy": {"calendar": cal}}}}
    qs = plan([ROUTE | {"cabins": ["economy"]}], latest, TODAY, 1, "EUR")
    assert qs[0].depart == date(2026, 12, 5)


def test_changed_nights_count_as_unchecked():
    cal = {f"2026-12-{d:02d}": {"checked": "2026-10-20T00:00:00+00:00", "return_date": f"2026-12-{d + 10:02d}"} for d in range(1, 21)}
    latest = {"routes": {"r": {"economy": {"calendar": cal}}}}
    qs = plan([ROUTE | {"cabins": ["economy"], "nights": 7}], latest, TODAY, 1, "EUR")
    assert qs[0].depart == date(2026, 12, 1)


def test_nights_range_makes_one_trip_per_stay_length():
    route = ROUTE | {"depart_from": "2026-12-01", "depart_to": "2026-12-02", "nights_min": 6, "nights_max": 8}
    assert [(k, r.day) for k, _, r in trips(route, TODAY)] == [
        ("2026-12-01+6", 7), ("2026-12-01+7", 8), ("2026-12-01+8", 9),
        ("2026-12-02+6", 8), ("2026-12-02+7", 9), ("2026-12-02+8", 10)]


def test_specific_dates_with_flexibility():
    # leave 10 Dec ±1, return 20 Dec ±1
    route = ROUTE | {"depart_from": "2026-12-09", "depart_to": "2026-12-11", "return_from": "2026-12-19", "return_to": "2026-12-21"}
    got = trips(route, TODAY)
    assert len(got) == 9
    assert ("2026-12-09+10", date(2026, 12, 9), date(2026, 12, 19)) in got
    assert ("2026-12-11+10", date(2026, 12, 11), date(2026, 12, 21)) in got


def test_exact_dates_keep_plain_keys():
    route = ROUTE | {"depart_from": "2026-12-10", "depart_to": "2026-12-10", "return_from": "2026-12-20", "return_to": "2026-12-20"}
    assert trips(route, TODAY) == [("2026-12-10+10", date(2026, 12, 10), date(2026, 12, 20))]
    assert trips(ROUTE | {"depart_to": "2026-12-01"}, TODAY) == [("2026-12-01", date(2026, 12, 1), date(2026, 12, 11))]


def test_weekend_trips_only_leave_on_chosen_weekdays():
    route = ROUTE | {"weekdays": [4], "nights": 2}  # Fridays
    assert [d.isoformat() for _, d, _ in trips(route, TODAY)] == ["2026-12-04", "2026-12-11", "2026-12-18"]


def test_flexible_plan_covers_stay_lengths_and_stores_keys():
    route = ROUTE | {"cabins": ["economy"], "nights_min": 6, "nights_max": 7}
    qs = plan([route], {}, TODAY, 40, "EUR")
    # a spread of departure dates for the shortest stay first, then the next stay length
    assert [q.key for q in qs[:4]] == ["2026-12-01+6", "2026-12-08+6", "2026-12-15+6", "2026-12-01+7"]
    assert qs[3].return_ == date(2026, 12, 8)
    assert len({q.key for q in qs}) == 40
