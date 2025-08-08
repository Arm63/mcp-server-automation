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

def _tap_center(driver: WebDriver, el) -> bool:
    try:
        r = el.rect
        cx = int(r["x"] + r["width"] / 2)
        cy = int(r["y"] + r["height"] / 2)
        driver.execute_script("mobile: tap", {"x": cx, "y": cy})
        return True
    except Exception:
        return False

def click_by_text(driver: WebDriver, text: str, timeout: float = 10.0):
    el = find_by_text(driver, text, timeout=timeout)
    try:
        el.click()
        return el
    except Exception:
        pass
    # Prefer clicking a button with same label
    text_esc = text.replace("'", "\\'")
    try:
        btn = driver.find_element(
            by=AppiumBy.IOS_PREDICATE,
            value=f"type == 'XCUIElementTypeButton' AND (name CONTAINS[c] '{text_esc}' OR label CONTAINS[c] '{text_esc}')",
        )
        try:
            btn.click()
            return btn
        except Exception:
            if _tap_center(driver, btn):
                return btn
    except Exception:
        pass
    # Fallback: tap center of the found element
    if _tap_center(driver, el):
        return el
    # Last resort: try tapping nearest button to the element
    try:
        target_rect = el.rect
        buttons = driver.find_elements(by=AppiumBy.IOS_CLASS_CHAIN, value="**/XCUIElementTypeButton")
        nearest = None
        best = float("inf")
        for b in buttons:
            r = b.rect
            dx = (r["x"] + r["width"]/2) - (target_rect["x"] + target_rect["width"]/2)
            dy = (r["y"] + r["height"]/2) - (target_rect["y"] + target_rect["height"]/2)
            d = (dx*dx + dy*dy) ** 0.5
            if d < best:
                best = d
                nearest = b
        if nearest:
            try:
                nearest.click()
                return nearest
            except Exception:
                if _tap_center(driver, nearest):
                    return nearest
    except Exception:
        pass
    # Give up
    raise NoSuchElementException(msg=f"Could not tap element for text '{text}'")

def click_any_by_text(driver: WebDriver, texts: List[str], timeout_per_try: float = 6.0):
    last_err = None
    for t in texts:
        try:
            return click_by_text(driver, t, timeout=timeout_per_try)
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    raise NoSuchElementException(msg=f"None of texts found: {texts}")

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

def wait_not_present(driver: WebDriver, text: str, timeout: float = 10.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            find_by_text(driver, text, timeout=1.0)
            time.sleep(0.5)
        except Exception:
            return True
    return False

def _swipe(driver: WebDriver, direction: str = "up"):
    try:
        driver.execute_script("mobile: swipe", {"direction": direction})
    except Exception:
        size = driver.get_window_size()
        start_x = size["width"] * 0.5
        if direction == "up":
            start_y, end_y = size["height"] * 0.7, size["height"] * 0.3
        else:
            start_y, end_y = size["height"] * 0.3, size["height"] * 0.7
        # Fallback: element-based swipe using W3C actions is not exposed directly; try tap-hold-move via script
        try:
            driver.execute_script(
                "mobile: dragFromToForDuration",
                {
                    "duration": 0.5,
                    "fromX": int(start_x),
                    "fromY": int(start_y),
                    "toX": int(start_x),
                    "toY": int(end_y),
                },
            )
        except Exception:
            pass

def scroll_to_text(driver: WebDriver, text: str, direction: str = "down", max_swipes: int = 10) -> bool:
    # direction: "down" means swipe up to move content down
    for _ in range(max_swipes):
        try:
            find_by_text(driver, text, timeout=1.0)
            return True
        except Exception:
            _swipe(driver, direction="up" if direction == "down" else "down")
    return False

def tap_system_alert(driver: WebDriver, positive: bool = True) -> bool:
    try:
        alert = driver.switch_to.alert
        if positive:
            alert.accept()
        else:
            alert.dismiss()
        return True
    except Exception:
        return False

def select_first_photo(driver: WebDriver) -> bool:
    try:
        cell = driver.find_element(by=AppiumBy.IOS_CLASS_CHAIN, value='**/XCUIElementTypeCell[1]')
        cell.click()
        return True
    except Exception:
        return False

def click_tab_by_label(driver: WebDriver, label_text: str, timeout: float = 8.0):
    end = time.time() + timeout
    best = None
    best_score = 0.0
    while time.time() < end:
        try:
            buttons = driver.find_elements(
                by=AppiumBy.IOS_CLASS_CHAIN,
                value="**/XCUIElementTypeTabBar/**/XCUIElementTypeButton",
            )
            for b in buttons:
                cand = _candidate_text(driver, b)
                s = _score(label_text, cand)
                if s > best_score:
                    best_score = s
                    best = b
            if best and best_score >= 0.5:
                try:
                    best.click()
                    return True
                except Exception:
                    if _tap_center(driver, best):
                        return True
        except Exception:
            pass
        time.sleep(0.3)
    return False

def tap_above_text(driver: WebDriver, text: str, offset: int = 28, timeout: float = 6.0) -> bool:
    try:
        el = find_by_text(driver, text, timeout=timeout)
        r = el.rect
        cx = int(r["x"] + r["width"]/2)
        ty = int(max(0, r["y"] - offset))
        try:
            driver.execute_script("mobile: tap", {"x": cx, "y": ty})
            return True
        except Exception:
            pass
        try:
            driver.execute_script(
                "mobile: dragFromToForDuration",
                {"duration": 0.1, "fromX": cx, "fromY": ty, "toX": cx, "toY": ty},
            )
            return True
        except Exception:
            return False
    except Exception:
        return False

def click_edit_icon(driver: WebDriver, timeout: float = 8.0):
    """Click a likely Edit/Pencil button using multiple resilient strategies.

    Returns the clicked element on success, otherwise raises NoSuchElementException.
    """
    end = time.time() + timeout
    last_err = None
    keywords = [
        "Edit", "edit", "Change", "Change Photo", "Update", "Modify",
    ]
    while time.time() < end:
        # 1) Predicate: buttons containing edit-related text
        for kw in keywords:
            try:
                el = driver.find_element(
                    by=AppiumBy.IOS_PREDICATE,
                    value=(
                        f"type == 'XCUIElementTypeButton' AND ("
                        f"name CONTAINS[c] '{kw}' OR label CONTAINS[c] '{kw}' OR value CONTAINS[c] '{kw}')"
                    ),
                )
                try:
                    el.click()
                    return el
                except Exception:
                    if _tap_center(driver, el):
                        return el
            except Exception as e:
                last_err = e
                continue

        # 2) Any element whose accessible name suggests pencil/edit
        try:
            el = driver.find_element(
                by=AppiumBy.IOS_CLASS_CHAIN,
                value=(
                    "**/*[`name CONTAINS[c] 'pencil' OR label CONTAINS[c] 'pencil' OR "
                    "value CONTAINS[c] 'pencil' OR name CONTAINS[c] 'edit' OR label CONTAINS[c] 'edit'`]"
                ),
            )
            try:
                el.click()
                return el
            except Exception:
                if _tap_center(driver, el):
                    return el
        except Exception as e:
            last_err = e

        # 3) Heuristic: tap first visible avatar/image near top of screen
        try:
            images = driver.find_elements(by=AppiumBy.IOS_CLASS_CHAIN, value="**/XCUIElementTypeImage")
            if images:
                top = min(images, key=lambda i: i.rect.get("y", 0))
                try:
                    top.click()
                    return top
                except Exception:
                    if _tap_center(driver, top):
                        return top
        except Exception as e:
            last_err = e

        time.sleep(0.3)

    raise NoSuchElementException(
        msg="Edit/Pencil icon not found",
        stacktrace=str(last_err) if last_err else "",
    )