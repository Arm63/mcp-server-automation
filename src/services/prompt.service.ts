import { ManualTestCase } from '../types/test-case.type';

export class PromptService {
  generatePrompt(tc: ManualTestCase, target = 'pytest-appium-ios'): string {
    // Basic target-specific differences
    const header = `You are a senior QA automation engineer.
Convert the following manual test case into an automated test script.

Target: ${target}
`;
    const stepsText = tc.steps.map((s, i) => {
      const exp = tc.expectedPerStep?.[i];
      return exp ? `${i + 1}. ${s}\n   - ${exp}` : `${i + 1}. ${s}`;
    }).join('\n');
    const preconditionsBlock = Array.isArray(tc.preconditions) && tc.preconditions.length
      ? `Preconditions:\n- ${tc.preconditions.join('\n- ')}`
      : (typeof tc.preconditions === 'string' && tc.preconditions.trim().length > 0
        ? `Preconditions:\n${tc.preconditions}`
        : '');

    if (target === 'appium-js') {
      return `
${header}
### Test Case:
ID: ${tc.id}
Title: ${tc.title}
${preconditionsBlock ? `\n${preconditionsBlock}\n` : ''}
Steps:
${stepsText}

Expected Result: ${tc.expectedResult}

Requirements:
- Generate a Node.js Appium (WebdriverIO or webdriver-js) test in TypeScript or JavaScript (prefer TypeScript).
- Use async/await
- Add code comments mapping to each step
- Use assertions (chai/expect)
- Prefer accessibilityId / resource-id selectors for Android; fallback to XPath/UiSelector only if necessary.
- Output ONLY the code block triple-backticked with language tag.

\`\`\`ts
// Appium test here
\`\`\`
`.trim();
    }

    if (target === 'pytest-appium-ios') {
      const title = tc.title.replace(/'/g, "\\'");
      const stepsBlock = tc.steps
        .map((s, i) => `    # Step ${i + 1}: ${s}` + (tc.expectedPerStep?.[i] ? `\n    # ${tc.expectedPerStep?.[i]}` : ''))
        .join('\n\n');
      const preBlock = Array.isArray(tc.preconditions) && tc.preconditions.length
        ? tc.preconditions.map((p) => `# - ${p}`).join('\n')
        : (typeof tc.preconditions === 'string' && tc.preconditions.trim().length > 0 ? `# ${tc.preconditions}` : '');

      return `
${header}
### Test Case:
ID: ${tc.id}
Title: ${title}
${preBlock ? `\nPreconditions:\n${preBlock}\n` : ''}
Steps:
${tc.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Expected Result: ${tc.expectedResult}

Requirements:
- Generate a runnable pytest (Python) script using Appium-Python-Client with XCUITest for iOS real device.
- Read configuration from environment variables: APPIUM_URL, IOS_UDID, IOS_DEVICE_NAME, IOS_PLATFORM_VERSION, BUNDLE_ID or APP.
- Use Appium v2 "options" API (XCUITestOptions) rather than deprecated desired_capabilities.
- Include real-device signing and WDA stability caps from env when provided: TEAM_ID/XCODE_ORG_ID, XCODE_SIGNING_ID (default Apple Development), UPDATED_WDA_BUNDLE_ID. Enable autoAcceptAlerts. Prefer useNewWDA/showXcodeLog/waitForQuiescence=false and WDA startup retries.
      - Import smart iOS helpers from src.utils.smart_ios (add sys.path insertion so the import works from output/...). Use human-readable text actions where possible.
      - Use helpers: click_by_text, click_any_by_text, wait_for_text, wait_not_present, enter_text_by_label, scroll_to_text, tap_system_alert, select_first_photo, click_tab_by_label, tap_above_text, click_edit_icon.
- Map each step as comments; leave actionable TODO placeholders.
- Output ONLY the code, wrapped in a single triple-backtick code block \`\`\`python ... \`\`\`.

\`\`\`python
import os
import pytest
import sys as _sys, os as _os
from appium import webdriver
from appium.options.ios import XCUITestOptions
from appium.webdriver.common.appiumby import AppiumBy

# Allow importing project helpers from src/ when running from output/generated/... path
_root = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '../../..'))
(_root not in _sys.path) and _sys.path.append(_root)
      from src.utils.smart_ios import (
          click_by_text,
          click_any_by_text,
          enter_text_by_label,
          wait_for_text,
          wait_not_present,
          scroll_to_text,
          tap_system_alert,
          select_first_photo,
          click_tab_by_label,
          tap_above_text,
          click_edit_icon,
      )


@pytest.fixture
def driver():
    server_url = os.environ.get('APPIUM_URL', 'http://127.0.0.1:4723/wd/hub')
    desired_caps = {
        'platformName': 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:udid': os.environ.get('IOS_UDID') or os.environ.get('DEVICE_UDID'),
        'appium:deviceName': os.environ.get('IOS_DEVICE_NAME') or os.environ.get('DEVICE_NAME'),
        'appium:platformVersion': os.environ.get('IOS_PLATFORM_VERSION') or os.environ.get('PLATFORM_VERSION'),
        'appium:newCommandTimeout': 120,
        'appium:noReset': True,
        'appium:autoAcceptAlerts': True,
    }
    bundle_id = os.environ.get('BUNDLE_ID')
    app_path = os.environ.get('APP')
    if bundle_id:
        desired_caps['appium:bundleId'] = bundle_id
    if app_path:
        desired_caps['appium:app'] = app_path

    team_id = os.environ.get('TEAM_ID') or os.environ.get('XCODE_ORG_ID')
    signing_id = os.environ.get('XCODE_SIGNING_ID') or 'Apple Development'
    updated_wda_bundle = os.environ.get('UPDATED_WDA_BUNDLE_ID')
    if team_id:
        desired_caps['appium:xcodeOrgId'] = team_id
        desired_caps['appium:xcodeSigningId'] = signing_id
    if updated_wda_bundle:
        desired_caps['appium:updatedWDABundleId'] = updated_wda_bundle
    desired_caps.setdefault('appium:useNewWDA', True)
    desired_caps.setdefault('appium:showXcodeLog', True)
    desired_caps.setdefault('appium:waitForQuiescence', False)
    desired_caps.setdefault('appium:wdaStartupRetries', 3)
    desired_caps.setdefault('appium:wdaStartupRetryInterval', 10000)

    options = XCUITestOptions().load_capabilities(desired_caps)
    driver = webdriver.Remote(command_executor=server_url, options=options)
    yield driver
    driver.quit()


def click_first_available_text(driver, texts, timeout_per_try=8):
    last_err = None
    for label in texts:
        try:
            return click_by_text(driver, label, timeout=timeout_per_try)
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    raise AssertionError('None of the provided labels were found: ' + ', '.join(texts))


def test_${tc.id.replace(/[^A-Za-z0-9_]/g, '_')}_${title.replace(/[^A-Za-z0-9_]/g, '_').toLowerCase()}(driver):
${stepsBlock}

    # Example flow using human-readable labels
    click_any_by_text(driver, ["Sign In", "Sign in", "Log In", "Login", "Continue with Email", "Get Started"], timeout_per_try=10)
    wait_for_text(driver, "Email or Phone Number", timeout=20)
    enter_text_by_label(driver, "Email or Phone Number", os.environ.get('TEST_EMAIL', 'test@example.com'), timeout=15)
    click_any_by_text(driver, ["Continue", "Next"], timeout_per_try=10)
    wait_for_text(driver, "Password", timeout=20)
    enter_text_by_label(driver, "Password", os.environ.get('TEST_PASSWORD', 'Passw0rd!'), timeout=15)

    # Final expected result:
    # ${tc.expectedResult}
\`\`\`
`.trim();
    }

    // Fallback: provide a minimal informative message for unsupported targets
    return `Unsupported target: ${target}. Supported targets: pytest-appium-ios, appium-js.`;
  }

  generateSimpleTest(tc: ManualTestCase, target = 'pytest-appium-ios'): string {
    const title = tc.title.replace(/'/g, "\\'");
    if (target === 'appium-js') {
      const stepsBlock = tc.steps
        .map((s, i) => `  // Step ${i + 1}: ${s}` + (tc.expectedPerStep?.[i] ? `\n  // ${tc.expectedPerStep?.[i]}` : ''))
        .join('\n\n');
      return `import { remote, RemoteOptions } from 'webdriverio';

// Standalone Appium iOS script for: ${title}
// Requires a running Appium server and a real iOS device provisioned for automation.
// Env vars:
// - APPIUM_URL (default http://127.0.0.1:4723)
// - IOS_UDID, IOS_DEVICE_NAME, IOS_PLATFORM_VERSION
// - BUNDLE_ID (for installed app) or APP (path to .app/.ipa)

async function main() {
  const serverUrl = process.env.APPIUM_URL || 'http://127.0.0.1:4723';
  const caps: RemoteOptions = {
    path: '/',
    hostname: new URL(serverUrl).hostname,
    port: Number(new URL(serverUrl).port || 4723),
    protocol: new URL(serverUrl).protocol.replace(':','') as any,
    capabilities: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:udid': process.env.IOS_UDID,
      'appium:deviceName': process.env.IOS_DEVICE_NAME,
      'appium:platformVersion': process.env.IOS_PLATFORM_VERSION,
      // Use either BUNDLE_ID for already installed app, or APP path to install
      ...(process.env.BUNDLE_ID ? { 'appium:bundleId': process.env.BUNDLE_ID } : {}),
      ...(process.env.APP ? { 'appium:app': process.env.APP } : {}),
      'appium:newCommandTimeout': 120,
      'appium:noReset': true
    }
  };

  const driver = await remote(caps);
  try {
${stepsBlock}

    // TODO: Implement the above steps using driver.$('<selector>') and actions
    // Example: await driver.$('~loginButton').click();
    // Final expected result:
    // ${tc.expectedResult}
  } finally {
    await driver.deleteSession();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;    
    }

    if (target === 'pytest-appium-ios') {
      // Heuristic action mapping
      const buildActionForStep = (s: string, idx: number): string => {
        const quoted = s.match(/"([^"]+)"|'([^']+)'/);
        const label = quoted?.[1] || quoted?.[2];
        const lower = s.toLowerCase();
        const lines: string[] = [];
        lines.push(`    # Step ${idx + 1}: ${s}`);
        if (/tap|click|press/.test(lower) && label) {
          lines.push(`    driver.find_element(by=AppiumBy.NAME, value=${JSON.stringify(label)}).click()`);
        } else if (/(enter|type|input)/.test(lower)) {
          // Email heuristic
          if (/email/.test(lower)) {
            lines.push(`    el = driver.find_element(by=AppiumBy.NAME, value='Email')`);
            lines.push(`    el.click()`);
            lines.push(`    el.send_keys(os.environ.get('TEST_EMAIL', 'test@example.com'))`);
          } else if (label) {
            lines.push(`    el = driver.find_element(by=AppiumBy.NAME, value=${JSON.stringify(label)})`);
            lines.push(`    el.click()`);
            lines.push(`    el.send_keys(os.environ.get('TEST_INPUT', 'sample'))`);
          } else {
            lines.push(`    # TODO: locate input and send keys`);
          }
        } else if (label) {
          lines.push(`    # TODO: interact with element named ${JSON.stringify(label)}`);
        } else {
          lines.push(`    # TODO: implement action`);
        }
        if (tc.expectedPerStep?.[idx]) {
          lines.push(`    # ${tc.expectedPerStep[idx]}`);
        }
        return lines.join('\n');
      };

      const actions = tc.steps.map((s, i) => buildActionForStep(s, i)).join('\n\n');

      return `import os
import time
import pytest
from appium.webdriver.webdriver import WebDriver
from appium.webdriver.common.appiumby import AppiumBy
from appium.options.ios.xcuitest import XCUITestOptions


@pytest.fixture
def driver() -> WebDriver:
    server_url = os.environ.get('APPIUM_URL', 'http://127.0.0.1:4723')
    # Support both IOS_* and generic names
    udid = os.environ.get('IOS_UDID') or os.environ.get('DEVICE_UDID')
    device_name = os.environ.get('IOS_DEVICE_NAME') or os.environ.get('DEVICE_NAME', 'iPhone 12')
    platform_version = os.environ.get('IOS_PLATFORM_VERSION') or os.environ.get('PLATFORM_VERSION', '18.0')
    team_id = os.environ.get('TEAM_ID')

    opts = XCUITestOptions()
    opts.platform_name = 'iOS'
    opts.automation_name = 'XCUITest'
    if platform_version:
        opts.platform_version = platform_version
    if device_name:
        opts.device_name = device_name
    if udid:
        opts.udid = udid

    bundle_id = os.environ.get('BUNDLE_ID')
    app_path = os.environ.get('APP')
    if bundle_id:
        opts.bundle_id = bundle_id
    if app_path:
        opts.app = app_path

    # Timeouts and WDA settings
    opts.new_command_timeout = 600
    opts.set_capability('wdaLaunchTimeout', 180000)
    opts.set_capability('wdaConnectionTimeout', 180000)
    if team_id:
        opts.set_capability('xcuitestTeamId', team_id)
        opts.set_capability('updateWDABundleId', f"{team_id}.WebDriverAgentRunner")
    opts.set_capability('fullReset', False)
    opts.set_capability('noReset', True)
    opts.set_capability('shouldTerminateApp', True)
    opts.set_capability('autoLaunch', True)
    opts.set_capability('forceAppLaunch', True)

    driver = WebDriver(command_executor=server_url + '/wd/hub', options=opts)
    driver.implicitly_wait(10)
    yield driver
    driver.quit()


def test_tc_${tc.id.replace(/[^A-Za-z0-9_]/g, '_')}(driver: WebDriver):
${actions}
`;
    }

    // Default: return a minimal placeholder for unsupported targets
    return `# Unsupported target: ${target}. Supported targets: pytest-appium-ios, appium-js.`;
  }
}
