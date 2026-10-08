"""Browser regression: run Next on :3100 and chromedriver on :9515 first.

Uses an in-browser API fixture, so no real food entries are changed.
Run with: python scripts/serving-smoke.py [http://localhost:3000]
"""
import base64
import json
import sys
import time
import urllib.request


def request(path, data=None, method=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        "http://127.0.0.1:9515" + path, data=body,
        headers={"Content-Type": "application/json"}, method=method,
    )
    with urllib.request.urlopen(req) as response:
        result = json.load(response)["value"]
    if isinstance(result, dict) and "error" in result:
        raise AssertionError(result)
    return result


session = request("/session", {"capabilities": {"alwaysMatch": {
    "browserName": "chrome", "goog:chromeOptions": {
        "binary": "/usr/bin/chromium", "args": ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,1000"],
    },
}}})["sessionId"]
prefix = f"/session/{session}"


def js(source, *args):
    return request(prefix + "/execute/sync", {"script": source, "args": list(args)})


def wait_for(source):
    for _ in range(150):
        if js("return " + source):
            return
        time.sleep(0.1)
    raise AssertionError("Timed out: " + source)


def fill(selector, value):
    js("""
      const input = document.querySelector(arguments[0]);
      const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, arguments[1]);
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
    """, selector, value)


def value(selector):
    return float(js("return document.querySelector(arguments[0]).value", selector))


quantity = 'input[id$="-quantity"]'
amount = 'input[id$="-amount"]'
calories = '.required-grid input'
serving = 'input[placeholder="e.g. 100 g or 4 oz"]'

try:
    request(prefix + "/goog/cdp/execute", {"cmd": "Page.addScriptToEvaluateOnNewDocument", "params": {"source": """
      const realFetch = window.fetch;
      const nutrients = {calories:170, protein:23, carbohydrates:0, fiber:0, sugars:0, added_sugars:0,
        sugar_alcohols:0, fat:8, saturated_fat:3, trans_fat:0, monounsaturated_fat:0,
        polyunsaturated_fat:0, cholesterol:70, sodium:75, potassium:0};
      let entries = [{...nutrients, id:1, name:'Test beef', serving:'4 oz (112 g), raw', quantity:1,
        eaten_on:'2026-09-27', created_at:'2026-09-27T12:00:00Z'}];
      window.savedEntries = [];
      window.fetch = async (url, options = {}) => {
        if (!String(url).startsWith('http://localhost:8000')) return realFetch(url, options);
        const path = new URL(url).pathname;
        let result = [];
        if (path === '/targets') result = {calories:2200, protein:160, carbohydrates:250, fat:75};
        if (options.method === 'PUT' || options.method === 'POST') {
          const payload = JSON.parse(options.body);
          window.savedEntries.push(payload);
          result = {...payload, id:1, created_at:'2026-09-27T12:00:00Z'};
          entries = [result];
        } else if (path === '/entries') {
          result = {date:'2026-09-27', entries, bodyweight:null, totals:entries[0]};
        }
        return new Response(JSON.stringify(result), {status:200, headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix + "/url", {"url": sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3100"})
    wait_for('document.querySelector(\'[aria-label="Edit Test beef"]\')')
    js('document.querySelector(\'[aria-label="Edit Test beef"]\').click()')
    assert value(amount) == 112
    fill(quantity, "1.5")
    assert value(amount) == 168
    assert value(calories) == 255
    assert js('return document.querySelector(".entry-form").checkValidity()')
    js('document.querySelector(\'[aria-label="Increase quantity by 1"]\').click()')
    assert value(quantity) == 2.5
    js('document.querySelector(\'[aria-label="Decrease quantity by 1"]\').click()')
    assert value(quantity) == 1.5
    js('document.querySelector(".entry-form").requestSubmit()')
    wait_for('window.savedEntries.length === 1 && document.querySelector(".entry-form h2").textContent === "Add food"')
    assert js('return window.savedEntries[0].quantity') == 1.5
    js('document.querySelector(\'[aria-label="Edit Test beef"]\').click()')
    assert value(quantity) == 1.5
    assert value(amount) == 168
    fill(amount, "180")
    assert abs(value(quantity) - 180 / 112) < 1e-10
    assert abs(value(calories) - 170 * 180 / 112) < 1e-10
    fill('select[aria-label="Amount unit"]', 'oz')
    assert abs(value(amount) - 180 / 28.349523125) < 1e-10
    fill('select[aria-label="Amount unit"]', 'g')
    assert value(amount) == 180
    js('document.querySelector(".entry-form").requestSubmit()')
    wait_for('window.savedEntries.length === 2 && document.querySelector(".entry-form h2").textContent === "Add food"')
    saved = js('return window.savedEntries[1]')
    assert saved['serving'] == '4 oz (112 g), raw'
    assert abs(saved['quantity'] - 180 / 112) < 1e-10
    assert abs(saved['fat'] - 8 * 180 / 112) < 1e-10
    js('document.querySelector(\'[aria-label="Edit Test beef"]\').click()')
    assert value(amount) == 180
    fill(quantity, '0.5')
    assert value(amount) == 56
    assert js('return document.querySelector(".entry-form").checkValidity()')
    element = request(prefix + '/element', {'using': 'css selector', 'value': quantity})
    element_id = next(iter(element.values()))
    request(prefix + f'/element/{element_id}/value', {'text': '\ue013'})
    assert value(quantity) == 1.5
    for selector in (quantity, amount):
        for invalid in ('', '0', '-1'):
            fill(selector, invalid)
            assert not js('return document.querySelector(".entry-form").checkValidity()')
        fill(selector, '1.5')
    fill(serving, '1 bowl')
    assert js('return document.querySelector(arguments[0]) === null', amount)
    fill(quantity, '0.5')
    assert js('return document.querySelector(".entry-form").checkValidity()')
    fill(serving, '100 g')
    assert value(amount) == 50
    fill(quantity, '1.5')
    fill(amount, '180')
    assert value(quantity) == 1.8
    request(prefix + '/window/rect', {'width': 390, 'height': 844})
    assert js('return document.documentElement.scrollWidth <= window.innerWidth')
    js('document.querySelector(".serving-grid").scrollIntoView({block: "center", behavior: "instant"})')
    screenshot = request(prefix + '/screenshot')
    with open('/tmp/macrotracker-serving-mobile.png', 'wb') as image:
        image.write(base64.b64decode(screenshot))
    js('document.querySelector(".form-actions .secondary").click()')
    fill(serving, '100 g')
    fill(quantity, '1.5')
    js('document.querySelector(".entry-form").requestSubmit()')
    wait_for('window.savedEntries.length === 3 && document.querySelector(\'input[id$="-quantity"]\').value === "1"')
    assert js('return document.querySelector(arguments[0]).value', serving) == ''
    print('PASS: decimal saves, reopening, linked gram amounts, nutrients, unit conversion, whole-number buttons/keys, validation, unmeasured servings, mobile layout, new-entry reset')
finally:
    request(prefix, method='DELETE')
