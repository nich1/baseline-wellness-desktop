"""Read-only browser checks against the running app; start chromedriver on :9515.

Run: python scripts/export-smoke.py
Downloads are stored in a temporary directory; no tracker records are changed.
"""
import base64
import json
import tempfile
import time
import urllib.request
from pathlib import Path


def request(path, data=None, method=None):
    req = urllib.request.Request("http://127.0.0.1:9515" + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req) as response:
        result = json.load(response)["value"]
    if isinstance(result, dict) and "error" in result:
        raise AssertionError(result)
    return result


download_dir = tempfile.TemporaryDirectory(prefix="baseline-export-")
session = request("/session", {"capabilities": {"alwaysMatch": {
    "browserName": "chrome", "goog:chromeOptions": {
        "binary": "/usr/bin/chromium", "args": ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,1100"],
    },
}}})["sessionId"]
prefix = f"/session/{session}"


def js(source, *args):
    return request(prefix + "/execute/sync", {"script": source, "args": list(args)})


def wait_for(source):
    for _ in range(100):
        if js("return " + source):
            return
        time.sleep(0.1)
    raise AssertionError("Timed out: " + source)


def fill(selector, value):
    js("""
      const input = document.querySelector(arguments[0]);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, arguments[1]);
      input.dispatchEvent(new Event('input', {bubbles: true}));
    """, selector, value)


try:
    request(prefix + "/goog/cdp/execute", {"cmd": "Browser.setDownloadBehavior", "params": {
        "behavior": "allow", "downloadPath": download_dir.name,
    }})
    request(prefix + "/goog/cdp/execute", {"cmd": "Browser.grantPermissions", "params": {
        "origin": "http://localhost:3000", "permissions": ["clipboardReadWrite", "clipboardSanitizedWrite"],
    }})
    request(prefix + "/url", {"url": "http://localhost:3000"})
    wait_for('document.querySelector(\'.log-toolbar-links a[href="/export"]\')')
    assert js('return document.querySelector(\'.log-toolbar-links a[href="/trends"]\').nextElementSibling.textContent') == 'Export'
    js('document.querySelector(\'.log-toolbar-links a[href="/export"]\').click()')
    wait_for('document.querySelector("h1")?.textContent === "Export your data"')
    assert js('return document.querySelector(\'.analysis-nav a[href="/trends/targets"]\').nextElementSibling.textContent') == 'Export'
    fill('input[type="date"]', '2026-09-01')
    fill('input[min]', '2026-09-27')
    js('document.querySelector(\'button[value="download"]\').click()')
    wait_for('document.querySelector(\'[role="status"]\').textContent.startsWith("Downloaded")')
    path = Path(download_dir.name) / 'baseline-2026-09-01-to-2026-09-27.json'
    for _ in range(100):
        if path.exists():
            break
        time.sleep(0.1)
    data = json.loads(path.read_text())
    assert len(data['days']) == 27
    assert data['days'][0]['date'] == '2026-09-01'
    assert data['days'][-1]['date'] == '2026-09-27'
    assert data['units']['nutrition']['saturated_fat'] == 'g'
    assert data['units']['nutrition']['fiber'] == 'g'
    assert data['units']['nutrition']['potassium'] == 'mg'
    for day in data['days']:
        assert 'bodyweight' in day
        assert set(day['training']) == {'strength_sets', 'cardio_sessions'}
        if day['food_entries']:
            for nutrient in data['units']['nutrition']:
                total = sum(entry[nutrient] for entry in day['food_entries'])
                assert abs(day['nutrition_totals'][nutrient] - total) < 1e-8
        else:
            assert day['nutrition_totals'] is None
    js('document.querySelector(\'button[value="copy"]\').click()')
    wait_for('document.querySelector(\'[role="status"]\').textContent.startsWith("Copied")')
    clipboard = request(prefix + '/execute/async', {'script': 'navigator.clipboard.readText().then(arguments[0]);', 'args': []})
    assert json.loads(clipboard)['days'] == data['days']
    fill('input[min]', '2026-08-31')
    assert not js('return document.querySelector("form").checkValidity()')
    fill('input[min]', '2026-09-27')
    js('window.originalFetch = window.fetch; window.fetch = async () => new Response(JSON.stringify({detail:"Test export error"}), {status:500});')
    js('document.querySelector(\'button[value="download"]\').click()')
    wait_for('document.querySelector(\'[role="alert"]\')?.textContent === "Test export error"')
    assert not js('return document.querySelector(\'button[value="download"]\').disabled')
    js('window.fetch = window.originalFetch')
    fill('input[type="date"]', '2099-01-01')
    fill('input[min]', '2099-01-01')
    js('document.querySelector(\'button[value="copy"]\').click()')
    wait_for('document.querySelector(\'[role="status"]\').textContent.includes("records on 0 days")')
    request(prefix + '/window/rect', {'width': 390, 'height': 1000})
    assert js('return document.documentElement.scrollWidth <= window.innerWidth')
    screenshot = request(prefix + '/screenshot')
    Path('/tmp/macrotracker-export-mobile.png').write_bytes(base64.b64decode(screenshot))
    print('PASS: navigation, inclusive JSON download, all nutrient totals, training fields, clipboard, invalid dates, error recovery, empty ranges, mobile layout')
finally:
    request(prefix, method='DELETE')
    download_dir.cleanup()
