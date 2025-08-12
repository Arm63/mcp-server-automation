# utils/smart_ios.py
import time
import difflib
from typing import List, Optional, Tuple
from appium.webdriver.webdriver import WebDriver
from appium.webdriver.common.appiumby import AppiumBy
from selenium.common.exceptions import NoSuchElementException

IOS_TEXT_TYPES = [
    "XCUIElementTypeButton",
    "XCUIElementTypeStaticText",
    "XCUIElementTypeTextField",
    "XCUIElementTypeSecureTextField",
    "XCUIElementTypeCell",
    "XCUIElementTypeOther",
]

def _try_predicates(driver: WebDriver, text: str, types: Optional[List[str]] = None):
    types = types or IOS_TEXT_TYPES
    text_esc = text.replace("'", "\\'")
    for t in types:
        # contains text in name/label/value, case-insensitive
        pred = f"type == '{t}' AND (name CONTAINS[c] '{text_esc}' OR label CONTAINS[c] '{text_esc}' OR value CONTAINS[c] '{text_esc}')"
        els = driver.find_elements(by=AppiumBy.IOS_PREDICATE, value=pred)
        if els:
            return els
    # class chain broader search
    cc = f"**/*[`name CONTAINS[c] '{text_esc}' OR label CONTAINS[c] '{text_esc}' OR value CONTAINS[c] '{text_esc}'`]"
    els = driver.find_elements(by=AppiumBy.IOS_CLASS_CHAIN, value=cc)
    return els

def _candidate_text(driver, el) -> str:
    attrs = []
    for a in ("name", "label", "value", "placeholder", "text"):
        try:
            v = el.get_attribute(a) if a != "text" else (getattr(el, "text", None))
            if isinstance(v, str) and v.strip():
                attrs.append(v.strip())
        except Exception:
            pass
    return " | ".join(dict.fromkeys(attrs))  # unique, preserve order

def _score(query: str, candidate: str) -> float:
    q = query.strip().lower()
    c = candidate.strip().lower()
    if not q or not c:
        return 0.0
    # hard contains bonus
    base = 1.0 if q in c else 0.0
    # fuzzy similarity
    sim = difflib.SequenceMatcher(None, q, c).ratio()
    # token overlap (simple)
    qtokens = set(q.split())
    ctokens = set(c.split())
    overlap = len(qtokens & ctokens) / max(1, len(qtokens))
    return max(base, 0.6 * sim + 0.4 * overlap)

def _best_match_scan(driver: WebDriver, text: str, types: Optional[List[str]] = None):
    types = set(types or IOS_TEXT_TYPES)
    # broad fetch by type families
    elements = []
    for t in types:
        try:
            cc = f"**/{t}"
            elements.extend(driver.find_elements(by=AppiumBy.IOS_CLASS_CHAIN, value=cc))
        except Exception:
            continue
    scored: List[Tuple[float, object]] = []
    for el in elements:
        cand = _candidate_text(driver, el)
        s = _score(text, cand)
        if s > 0.45:
            scored.append((s, el))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [el for _, el in scored]

def find_by_text(driver: WebDriver, text: str, types: Optional[List[str]] = None, timeout: float = 10.0):
    end = time.time() + timeout
    last_err = None
    while time.time() < end:
        try:
            els = _try_predicates(driver, text, types)
            if els:
                return els[0]
        except Exception as e:
            last_err = e
        # fallback scan
        try:
            matches = _best_match_scan(driver, text, types)
            if matches:
                return matches[0]
        except Exception as e:
            last_err = e
        time.sleep(0.5)
    raise NoSuchElementException(msg=f"Element with text like '{text}' not found", stacktrace=str(last_err) if last_err else "")

def click_by_text(driver: WebDriver, text: str, timeout: float = 10.0):
    el = find_by_text(driver, text, timeout=timeout)
    el.click()
    return el

def _distance(a, b) -> float:
    ax, ay = a["x"], a["y"]
    bx, by = b["x"], b["y"]
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5

def enter_text_by_label(driver: WebDriver, label_text: str, value: str, timeout: float = 10.0):
    label_el = find_by_text(driver, label_text, timeout=timeout)
    label_rect = label_el.rect
    # candidate inputs
    inputs = driver.find_elements(by=AppiumBy.IOS_CLASS_CHAIN, value="**/XCUIElementTypeTextField")
    inputs += driver.find_elements(by=AppiumBy.IOS_CLASS_CHAIN, value="**/XCUIElementTypeSecureTextField")
    # prefer those visually near/below label
    best = None
    best_score = float("inf")
    for inp in inputs:
        r = inp.rect
        # prioritize below/overlapping horizontally
        penalty = 0
        if r["y"] < label_rect["y"] - 4:
            penalty += 2000
        if r["x"] > label_rect["x"] + label_rect["width"] or (r["x"] + r["width"]) < label_rect["x"]:
            penalty += 500
        d = _distance({"x": label_rect["x"], "y": label_rect["y"] + label_rect["height"]}, {"x": r["x"], "y": r["y"]})
        score = d + penalty
        if score < best_score:
            best, best_score = inp, score
    # fallback: best-named input
    if not best and inputs:
        scored = [(max(_score(label_text, _candidate_text(driver, i)), 0.0), i) for i in inputs]
        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]
    if not best:
        # last resort: any text field
        best = driver.find_element(by=AppiumBy.IOS_CLASS_CHAIN, value="**/XCUIElementTypeTextField")
    best.click()
    best.clear() if hasattr(best, "clear") else None
    best.send_keys(value)
    return best

def wait_for_text(driver: WebDriver, text: str, timeout: float = 10.0):
    return find_by_text(driver, text, timeout=timeout)


def is_keyboard_visible(driver: WebDriver) -> bool:
    try:
        # appium driver exposes is_keyboard_shown on iOS
        return bool(getattr(driver, "is_keyboard_shown", lambda: False)())
    except Exception:
        return False