"""Price drop detection and ntfy phone notifications."""
import logging

import httpx

log = logging.getLogger("alerts")


def detect_drop(prev: float | None, new: float | None, target: float | None, threshold_pct: float) -> str | None:
    """Why the new cheapest price is worth an alert, or None."""
    if new is None:
        return None
    if target and new <= target and (prev is None or prev > target):
        return "below target"
    if prev and new <= prev * (1 - threshold_pct / 100):
        return f"dropped {round((1 - new / prev) * 100)}%"
    return None


def send_ntfy(topic: str, title: str, message: str, url: str = "", server: str = "https://ntfy.sh") -> bool:
    if not topic:
        return False
    headers = {"Title": title.encode("utf-8").decode("latin-1", "ignore"), "Tags": "airplane"}
    if url:
        headers["Click"] = url
    try:
        r = httpx.post(f"{server.rstrip('/')}/{topic}", content=message.encode("utf-8"), headers=headers, timeout=20)
        return r.status_code < 300
    except httpx.HTTPError as e:
        log.warning("ntfy failed: %s", e)
        return False
