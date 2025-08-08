### How to run 1 case

Prereqs:
- Node.js 18+, Python 3.13+, Poetry, real iOS device provisioned

1) Install deps
```bash
cd /Users/armen/StudioProjects/autotestgen-mcp
npm install
poetry install --no-root
```

2) Start servers (in two terminals)
```bash
# Terminal A: Appium (4724, /wd/hub)
npx --yes appium --base-path /wd/hub --port 4724
```
```bash
# Terminal B: MCP API server
npm run dev
# Health: http://localhost:3000/
```

3) Set runtime env (device/app credentials)
```bash
export APPIUM_URL="http://127.0.0.1:4724/wd/hub"
export IOS_UDID=""
export IOS_DEVICE_NAME=""
export IOS_PLATFORM_VERSION=""
export APP=""
export BUNDLE_ID=""
export TEAM_ID=""
export UPDATED_WDA_BUNDLE_ID=""
export TEST_EMAIL=""
export TEST_PASSWORD=""
```

4) Download/generate one Testiny test case and run it (replace TC-5 with your ID)
```bash
curl -s "http://localhost:3000/api/test-cases/TC-5/generate?target=pytest-appium-ios&save=true&run=true&force=true" \
  | tee output/logs/TC-5-generate.json
```

5) Run the saved script manually (optional)
```bash
PYTHONPATH=$(pwd) \
APPIUM_URL=$APPIUM_URL \
IOS_UDID=$IOS_UDID \
IOS_DEVICE_NAME="$IOS_DEVICE_NAME" \
IOS_PLATFORM_VERSION=$IOS_PLATFORM_VERSION \
APP=$APP \
BUNDLE_ID=$BUNDLE_ID \
TEAM_ID=$TEAM_ID \
UPDATED_WDA_BUNDLE_ID=$UPDATED_WDA_BUNDLE_ID \
poetry run pytest -q $(pwd)/output/generated/pytest-appium-ios/test_TC_5_pytest_appium_ios.py -k test_5 -s -vv | tee output/tc5_run.log
```

Notes:
- API requires Testiny/Claude credentials in .env (see README.md)
- Saved scripts output under `output/generated/<target>/`

