import os
import pytest
from appium import webdriver
from appium.options.ios import XCUITestOptions
from selenium.common.exceptions import WebDriverException

# Prefer importing helpers directly; fall back to adding project root to sys.path
try:
    from src.utils.smart_ios import click_by_text, enter_text_by_label, wait_for_text
except ModuleNotFoundError:  # pragma: no cover - environment-specific import path fix
    import sys
    from os import path
    PROJECT_ROOT = path.abspath(path.join(path.dirname(__file__), "../../.."))
    if PROJECT_ROOT not in sys.path:
        sys.path.insert(0, PROJECT_ROOT)
    from src.utils.smart_ios import click_by_text, enter_text_by_label, wait_for_text

@pytest.fixture
def driver():
    server_url = os.environ.get('APPIUM_URL', 'http://127.0.0.1:4723')
    desired_caps = {
        'platformName': 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:udid': os.environ.get('IOS_UDID'),
        'appium:deviceName': os.environ.get('IOS_DEVICE_NAME'),
        'appium:platformVersion': os.environ.get('IOS_PLATFORM_VERSION'),
        'appium:newCommandTimeout': 120,
        'appium:noReset': True,
    }
    bundle_id = os.environ.get('BUNDLE_ID')
    app_path = os.environ.get('APP')
    if bundle_id:
        desired_caps['appium:bundleId'] = bundle_id
    if app_path:
        desired_caps['appium:app'] = app_path

    options = XCUITestOptions().load_capabilities(desired_caps)
    # Real device signing / WDA hints (optional, help avoid xcodebuild 70)
    team_id = os.environ.get('TEAM_ID') or os.environ.get('XCODE_ORG_ID')
    if team_id:
        options.set_capability('xcodeOrgId', team_id)
    xcode_signing_id = os.environ.get('XCODE_SIGNING_ID', 'Apple Development')
    if xcode_signing_id:
        options.set_capability('xcodeSigningId', xcode_signing_id)
    updated_wda_bundle_id = os.environ.get('UPDATED_WDA_BUNDLE_ID')
    if updated_wda_bundle_id:
        options.set_capability('updatedWDABundleId', updated_wda_bundle_id)
    # Stability flags
    options.set_capability('showXcodeLog', True)
    options.set_capability('useNewWDA', True)
    options.set_capability('waitForQuiescence', False)
    options.set_capability('wdaStartupRetries', 3)
    options.set_capability('wdaStartupRetryInterval', 20000)

    # Try initial URL, then fall back by toggling /wd/hub base path on 404/unknown command
    try:
        driver = webdriver.Remote(command_executor=server_url, options=options)
    except WebDriverException as e:
        msg = str(e)
        if 'The requested resource could not be found' in msg or 'unknown command' in msg:
            if server_url.rstrip('/').endswith('/wd/hub'):
                fallback_url = server_url.rstrip('/').replace('/wd/hub', '')
            else:
                fallback_url = server_url.rstrip('/') + '/wd/hub'
            driver = webdriver.Remote(command_executor=fallback_url, options=options)
        else:
            raise
    yield driver
    driver.quit()

def is_keyboard_visible(driver):
    return driver.is_keyboard_shown()

def test_4_level_app___consumer___onboarding___sign_in__verify_keyboard_appears_automatically(driver):
    # Step 1: Tap Sign In Button
    click_by_text(driver, "Sign In")
    
    # Verify Email/Phone Page and keyboard
    email_label = wait_for_text(driver, "Email or Phone Number")
    assert email_label is not None
    assert is_keyboard_visible(driver), "Keyboard not visible on Email/Phone page"

    # Step 2: Enter a Valid Email/Phone Number, then Tap Continue
    test_email = os.environ.get("TEST_EMAIL", "test@example.com")
    enter_text_by_label(driver, "Email or Phone Number", test_email)
    click_by_text(driver, "Continue")
    
    # Verify Password Page and keyboard
    wait_for_text(driver, "Password")
    assert is_keyboard_visible(driver), "Keyboard not visible on Password page"

    # Step 3: Tap Forgot Password
    click_by_text(driver, "Forgot Password")
    
    # Verify Reset Password Page and keyboard
    wait_for_text(driver, "Reset Password")
    assert is_keyboard_visible(driver), "Keyboard not visible on Reset Password page"

    # Step 4: Tap Back
    click_by_text(driver, "Back")
    
    # Verify Password Page reopened and keyboard
    wait_for_text(driver, "Password")
    assert is_keyboard_visible(driver), "Keyboard not visible on reopened Password page"