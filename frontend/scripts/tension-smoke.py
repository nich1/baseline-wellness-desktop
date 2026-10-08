"""Start chromedriver on :9515, then run python scripts/tension-smoke.py.

All API calls use browser fixtures. This never changes real tracker records.
"""
import base64
import json
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


session = request("/session", {"capabilities": {"alwaysMatch": {
    "browserName": "chrome", "goog:chromeOptions": {
        "binary": "/usr/bin/chromium", "args": ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,1000"],
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


def click(selector):
    js('document.querySelector(arguments[0]).click()', selector)



def set_value(selector, value):
    js("""const el = document.querySelector(arguments[0]);
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, arguments[1]);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));""", selector, value)


try:
    request(prefix + "/goog/cdp/execute", {"cmd": "Page.addScriptToEvaluateOnNewDocument", "params": {"source": """
      const realFetch = window.fetch;
      window.fetch = async (url, options={}) => {
        if (!String(url).startsWith('http://localhost:8000')) return realFetch(url, options);
        const path = new URL(url).pathname;
        let result = [];
        if (path === '/lifts') result = ['Bench press','Squat'].map((exercise,id) => ({id,exercise,weight:100,reps:8,logged_on:'2026-10-07'}));
        if (path === '/exercise-tensions') {
          if (options.method === 'PUT') {
            if (window.failSave) { window.failSave=false; return new Response('{}',{status:500}); }
            result = JSON.parse(options.body);
            const profiles = JSON.parse(localStorage.getItem('tension-fixture') || '{}');
            profiles[result.exercise] = result;
            localStorage.setItem('tension-fixture',JSON.stringify(profiles));
          } else result = Object.values(JSON.parse(localStorage.getItem('tension-fixture') || '{}'));
        }
        return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix + '/url', {'url':'http://localhost:3000/strength'})
    wait_for('document.querySelector(".tension-empty")')
    for muscle, expected in [('chest',[100]),('triceps',[50,50]),('front_delts',[34,33,33])]:
        set_value('[aria-label="Add muscle group"]', muscle)
        assert js('return Array.from(document.querySelectorAll(".tension-row .tension-number input"), el => Number(el.value))') == expected
    set_value('[aria-label="Triceps tension percent"]', '30')
    set_value('[aria-label="Front delts tension percent"]', '20')
    chest = request(prefix + '/element', {'using':'css selector','value':'[aria-label="Chest tension percent"]'})['element-6066-11e4-a52e-4f735466cecf']
    request(prefix + '/element/' + chest + '/click', {})
    request(prefix + '/element/' + chest + '/value', {'text':'50'})
    assert js('return document.querySelector(".tension-number input").value') == '50'
    # Incomplete top-level allocations cannot be saved.
    set_value('[aria-label="Chest tension percent"]', '20')
    assert js('return document.querySelector(".tension-actions .primary").disabled')
    assert js('return document.querySelector(".tension-footnote").textContent.includes("remaining 30%")')
    set_value('[aria-label="Chest tension percent"]', '50')
    # Clearing stays blank while editing, and typing after zero never leaves a leading zero.
    set_value('[aria-label="Chest tension percent"]', '')
    assert js('return document.querySelector(".tension-number input").value') == ''
    request(prefix + '/element/' + chest + '/value', {'text':'50'})
    assert js('return document.querySelector(".tension-number input").value') == '50'
    set_value('[aria-label="Chest tension percent"]', '0')
    set_value('[aria-label="Chest tension percent"]', '050')
    assert js('return document.querySelector(".tension-number input").value') == '50' 
    assert js('return document.querySelector(".tension-total strong").textContent') == '100 / 100%'
    set_value('[aria-label="Chest tension percent"]','99')
    assert js('return document.querySelector(".tension-row input[type=number]").value') == '50'
    assert js('return document.querySelectorAll(".tension-actions select option").length') == 18
    set_value('.exercise-select select','Squat')
    assert js('return document.querySelectorAll(".tension-row").length') == 0
    set_value('.exercise-select select','Bench press')
    assert js('return document.querySelectorAll(".tension-row").length') == 3
    js('document.querySelectorAll(".muscle-regions").forEach(el => el.open = true)')
    set_value('[aria-label="Chest Upper chest · Clavicular percent"]', '70')
    assert js('return Array.from(document.querySelectorAll(".muscle-regions")[0].querySelectorAll("input"), el => Number(el.value))') == [70,15,15]
    set_value('[aria-label="Triceps Long head percent"]', '30')
    set_value('[aria-label="Triceps Lateral head percent"]', '30')
    assert js('return Array.from(document.querySelectorAll(".muscle-regions")[1].querySelectorAll("input"), el => Number(el.value))') == [30,30,40]
    set_value('[aria-label="Triceps Medial head percent"]', '30')
    assert js('return document.querySelector(".tension-actions .primary").disabled')
    click('[aria-label="Reset Triceps Medial head to auto"]')
    assert js('return !document.querySelector(".tension-actions .primary").disabled')
    js('window.failSave=true')
    click('.tension-actions .primary')
    wait_for('document.querySelector(".tension-panel [role=alert]")')
    assert js('return document.querySelectorAll(".tension-row").length') == 3
    click('.tension-actions .primary')
    wait_for('document.querySelector(".tension-footnote").textContent.includes("Distribution saved")')
    request(prefix + '/refresh', {})
    wait_for('document.querySelectorAll(".tension-row").length === 3')
    assert js('return document.querySelector(".tension-row input[type=number]").value') == '50'
    js('document.querySelectorAll(".muscle-regions").forEach(el => el.open = true)')
    assert js('return document.querySelectorAll(".muscle-regions")[0].querySelector("input").value') == '70'
    assert js('return document.querySelectorAll(".muscle-regions")[1].querySelectorAll("input")[2].value') == '40'
    Path('/tmp/tension-desktop.png').write_bytes(base64.b64decode(request(prefix + '/screenshot')))
    request(prefix + '/window/rect', {'width':390,'height':900})
    assert js('return document.documentElement.scrollWidth <= window.innerWidth')
    Path('/tmp/tension-mobile.png').write_bytes(base64.b64decode(request(prefix + '/screenshot')))
    click('[aria-label="Remove Triceps"]')
    assert js('return document.querySelector(".tension-total strong").textContent') == '70 / 100%'
    set_value('[aria-label="Chest tension percent"]','80')
    assert js('return document.querySelector(".tension-total strong").textContent') == '100 / 100%'
    click('.tension-actions .button:not(.primary)')
    assert js('return document.querySelectorAll(".tension-row").length') == 3
    set_value('.exercise-select select', 'Squat')
    for muscle in ['lats', 'traps', 'biceps', 'upper_back', 'lower_back', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'adductors', 'abductors', 'calves']:
        set_value('[aria-label="Add muscle group"]', muscle)
    assert js('return document.querySelectorAll(".muscle-regions").length') == 14
    js('document.querySelectorAll(".muscle-regions").forEach(el => el.open = true)')
    set_value('[aria-label="Lats Upper lats percent"]', '70')
    set_value('[aria-label="Traps Upper traps percent"]', '70')
    assert js('return Array.from(document.querySelectorAll(".muscle-regions")[0].querySelectorAll("input"), el => Number(el.value))') == [70,30]
    assert js('return Array.from(document.querySelectorAll(".muscle-regions")[1].querySelectorAll("input"), el => Number(el.value))') == [70,15,15]
    for muscle in ['front_delts', 'side_delts', 'rear_delts', 'brachialis']:
        set_value('[aria-label="Add muscle group"]', muscle)
    assert js('return document.querySelectorAll(".muscle-regions").length') == 14
    assert js('return document.documentElement.scrollWidth <= window.innerWidth')
    click('.tension-actions .primary')
    wait_for('document.querySelector(".tension-footnote").textContent.includes("Distribution saved")')
    request(prefix + '/refresh', {})
    wait_for('document.querySelector(".exercise-select select")?.options.length === 2')
    set_value('.exercise-select select', 'Squat')
    wait_for('document.querySelectorAll(".muscle-regions").length === 14')
    assert js('return document.querySelectorAll(".muscle-regions")[0].querySelector("input").value') == '70'
    print('PASS: all muscle regions, auto remainders, delts excluded, persistence, allocation cap, input editing, mobile overflow')
finally:
    request(prefix, method='DELETE')
