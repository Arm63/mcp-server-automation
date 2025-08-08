import os
import pytest
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

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

    driver = webdriver.Remote(command_executor=server_url, desired_capabilities=desired_caps)
    yield driver
    driver.quit()

def test_2_test_login_flow(driver):
    # Step 1: Tap on the "Sign In" button.
    sign_in_button = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((AppiumBy.ACCESSIBILITY_ID, "Sign In"))
    )
    sign_in_button.click()

    # Expected: The login form with an email input field is displayed.
    email_input = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((AppiumBy.ACCESSIBILITY_ID, "Email Input"))
    )
    assert email_input.is_displayed(), "Email input field is not displayed"

    # Step 2: Enter a valid email into the email input field.
    valid_email = "test@example.com"
    email_input.send_keys(valid_email)

    # Expected: The email is accepted and the field is populated with the entered text
    assert email_input.get_attribute("value") == valid_email, "Email field is not populated correctly"

    # TODO: Add additional assertions or verifications as needed