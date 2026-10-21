from datetime import date

from flights.planner import depart_dates, plan, return_date

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
