from flights.alerts import detect_drop


def test_drop_threshold():
    assert detect_drop(1000, 960, None, 5) is None
    assert detect_drop(1000, 940, None, 5) == "dropped 6%"


def test_target():
    assert detect_drop(700, 640, 650, 50) == "below target"
    assert detect_drop(640, 640, 650, 5) is None          # already below: no repeat
    assert detect_drop(None, 600, 650, 5) == "below target"


def test_first_price_without_target_is_quiet():
    assert detect_drop(None, 600, None, 5) is None
