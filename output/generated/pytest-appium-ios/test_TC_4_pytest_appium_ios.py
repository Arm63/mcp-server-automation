import os
import pytest
import sys as _sys, os as _os
from appium import webdriver
from appium.options.ios import XCUITestOptions
from appium.webdriver.common.appiumby import AppiumBy

# Allow importing project helpers from src/ when running from output/generated/... path
_root = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '../../..'))
(_root not in _sys.path) and _sys.path.append(_root)
from src.utils.smart_ios import click_by_text, enter_text_by_label, wait_for_text, is_keyboard_visible


@pytest.fixture
def driver():
    server_url = os.environ.get('APPIUM_URL', 'http://127.0.0.1:4723/wd/hub')
    options = XCUITestOptions()
    options.udid = os.environ.get('IOS_UDID') or os.environ.get('DEVICE_UDID')
    options.device_name = os.environ.get('IOS_DEVICE_NAME') or os.environ.get('DEVICE_NAME')
    options.platform_version = os.environ.get('IOS_PLATFORM_VERSION') or os.environ.get('PLATFORM_VERSION')
    options.bundle_id = os.environ.get('BUNDLE_ID')
    options.app = os.environ.get('APP')
    options.new_command_timeout = 120
    options.no_reset = True
    options.auto_accept_alerts = True

    team_id = os.environ.get('TEAM_ID') or os.environ.get('XCODE_ORG_ID')
    signing_id = os.environ.get('XCODE_SIGNING_ID', 'Apple Development')
    updated_wda_bundle = os.environ.get('UPDATED_WDA_BUNDLE_ID')
    if team_id:
        options.xcode_org_id = team_id
        options.xcode_signing_id = signing_id
    if updated_wda_bundle:
        options.updated_wda_bundle_id = updated_wda_bundle
    
    options.use_new_wda = True
    options.show_xcode_log = True
    options.wait_for_quiescence = False
    options.wda_startup_retries = 3
    options.wda_startup_retry_interval = 10000

    driver = webdriver.Remote(command_executor=server_url, options=options)
    yield driver
    driver.quit()


def test_4_level_app_consumer_onboarding_sign_in_verify_keyboard_appears_automatically(driver):
    # Step 1: Tap Sign In Button
    click_by_text(driver, "Sign In")
    wait_for_text(driver, "Email or Phone Number")
    assert is_keyboard_visible(driver), "Keyboard should be visible on Email/Phone Page"

    # Step 2: Enter a Valid Email/Phone Number, then Tap Continue
    enter_text_by_label(driver, "Email or Phone Number", "test@example.com")
    click_by_text(driver, "Continue")
    wait_for_text(driver, "Password")
    assert is_keyboard_visible(driver), "Keyboard should be visible on Password Page"

    # Step 3: Tap Forgot Password
    click_by_text(driver, "Forgot Password")
    wait_for_text(driver, "Reset Password")
    assert is_keyboard_visible(driver), "Keyboard should be visible on Reset Password Page"

    # Step 4: Tap Back
    driver.back()
    wait_for_text(driver, "Password")
    assert is_keyboard_visible(driver), "Keyboard should be visible on Password Page after going back"