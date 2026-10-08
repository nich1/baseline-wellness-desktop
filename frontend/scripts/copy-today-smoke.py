"""Start chromedriver on :9515, then run python scripts/copy-today-smoke.py.

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


try:
    request(prefix + "/goog/cdp/execute", {"cmd": "Page.addScriptToEvaluateOnNewDocument", "params": {"source": """
      const realFetch = window.fetch;
      const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const previous = new Date(`${today}T00:00:00Z`); previous.setUTCDate(previous.getUTCDate()-1);
      const source = previous.toISOString().slice(0,10);
      const nutrients = {calories:255, protein:34.5, carbohydrates:0, fiber:2, sugars:0, added_sugars:0,
        sugar_alcohols:0, fat:12, saturated_fat:4.5, trans_fat:0, monounsaturated_fat:0,
        polyunsaturated_fat:0, cholesterol:105, sodium:112.5, potassium:0};
      const food = {id:1,name:'Source beef',serving:'112 g',quantity:1.5,eaten_on:source,...nutrients};
      const lift = {id:2,logged_on:source,exercise:'Source squat',weight:135.5,reps:8};
      const cardio = {id:3,logged_on:source,activity:'Source run',duration_minutes:25.5,distance:5,distance_unit:'km',
        average_heart_rate:145,elevation_gain:30,perceived_effort:6,notes:'Easy pace'};
      window.records = {
        food:[food,{...food,id:11,name:'Existing food',eaten_on:today}],
        lifts:[lift,{...lift,id:12,exercise:'Existing lift',logged_on:today}],
        cardio:[cardio,{...cardio,id:13,activity:'Existing cardio',logged_on:today}],
      };
      window.copyRequests = [];
      window.fetch = async (url, options={}) => {
        if (!String(url).startsWith('http://localhost:8000')) return realFetch(url, options);
        const parsed = new URL(url), path = parsed.pathname;
        let result = [];
        if (path === '/copy-to-today') {
          const payload = JSON.parse(options.body); window.copyRequests.push(payload);
          if (window.failCopy) { window.failCopy = false; return new Response(JSON.stringify({detail:'Copy failed. Try again.'}), {status:500}); }
          if (window.holdCopy) await new Promise(resolve => window.releaseCopy = resolve);
          const dateField = payload.category === 'food' ? 'eaten_on' : 'logged_on';
          const items = window.records[payload.category].filter(item => item[dateField] === payload.source_date);
          window.records[payload.category].push(...items.map(item => ({...item,[dateField]:today,id:100+window.copyRequests.length})));
          result = {...payload,target_date:today,copied_count:items.length};
        } else if (options.method && options.method !== 'GET') {
          throw new Error('Unexpected write');
        } else if (path === '/targets') {
          result = {calories:2200,protein:160,carbohydrates:250,fat:75};
        } else if (path === '/entries') {
          const date = parsed.searchParams.get('eaten_on');
          const entries = window.records.food.filter(item => item.eaten_on === date);
          result = {date,entries,bodyweight:180,totals:Object.fromEntries(Object.keys(nutrients).map(key => [key,entries.reduce((sum,item)=>sum+item[key],0)]))};
        } else if (path === '/lifts' || path === '/cardio') {
          const date = parsed.searchParams.get('logged_on');
          result = window.records[path.slice(1)].filter(item => !date || item.logged_on === date);
        }
        return new Response(JSON.stringify(result), {status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix + '/url', {'url':'http://localhost:3000'})
    wait_for('document.querySelector(".copy-today-button") && document.querySelector(".food-row")')
    assert js('return document.querySelector(".copy-today-button").disabled')
    assert js('return document.querySelectorAll(\'[role="tablist"] [role="tab"]\').length') == 3
    assert js('return !document.querySelector(\'[role="tablist"] .copy-today-button\')')
    click('[aria-label="Previous day"]')
    wait_for('document.querySelector(".food-row h3")?.textContent === "Source beef"')
    js('window.holdCopy=true; const b=document.querySelector(".copy-today-button"); b.click(); b.click();')
    wait_for('typeof window.releaseCopy === "function"')
    assert js('return window.copyRequests.length') == 1
    assert js('return document.querySelector(".copy-today-button").disabled')
    js('window.holdCopy=false; window.releaseCopy()')
    wait_for('document.querySelector(".copy-feedback")?.textContent.includes("Copied")')
    assert js('return document.querySelectorAll(".food-row").length') == 1
    assert js('return window.records.food.at(-1).quantity') == 1.5
    click('.copy-feedback button')
    wait_for('document.querySelectorAll(".food-row").length === 2')
    assert js('return document.querySelector(".entry-list").textContent.includes("Existing food")')
    assert js('return document.querySelector(".copy-today-button").disabled')
    click('[aria-label="Previous day"]')
    click('[aria-controls="lift-tracker-panel"]')
    wait_for('document.querySelector(".lift-list")?.textContent.includes("Source squat")')
    js('window.holdCopy=true')
    click('.copy-today-button')
    wait_for('window.copyRequests.length === 2')
    click('[aria-label="Next day"]')
    wait_for('document.querySelector(".lift-list")?.textContent.includes("Existing lift")')
    js('window.holdCopy=false; window.releaseCopy()')
    wait_for('document.querySelectorAll(".lift-list article").length === 2')
    assert js('return window.copyRequests[1].category') == 'lifts'
    click('[aria-label="Previous day"]')
    click('[aria-controls="cardio-tracker-panel"]')
    wait_for('document.querySelector(".cardio-list")?.textContent.includes("Source run")')
    click('.copy-today-button')
    wait_for('document.querySelector(".copy-feedback")?.textContent.includes("Copied")')
    assert js('return window.copyRequests[2].category') == 'cardio'
    assert js('return window.records.cardio.at(-1).notes') == 'Easy pace'
    click('.copy-feedback button')
    wait_for('document.querySelectorAll(".cardio-list article").length === 2')
    click('[aria-label="Previous day"]')
    click('[aria-label="Previous day"]')
    click('.copy-today-button')
    wait_for('document.querySelector(".copy-feedback")?.textContent.includes("No cardio sessions")')
    assert js('return document.querySelector(".copy-feedback button") === null')
    click('[aria-label="Next day"]')
    js('window.failCopy=true')
    click('.copy-today-button')
    wait_for('document.querySelector(\'.copy-feedback[role="alert"]\')')
    assert not js('return document.querySelector(".copy-today-button").disabled')
    click('.copy-today-button')
    wait_for('document.querySelector(\'.copy-feedback[role="status"]\')?.textContent.includes("Copied")')
    click('[aria-controls="food-tracker-panel"]')
    request(prefix + '/window/rect', {'width':390,'height':844})
    assert js('return document.documentElement.scrollWidth <= window.innerWidth')
    assert js('return document.querySelector(".copy-today-button").getBoundingClientRect().left > document.querySelector(".tracker-tabs").getBoundingClientRect().right')
    js('document.querySelector(".tracker-toolbar").scrollIntoView({block:"start",behavior:"instant"})')
    Path('/tmp/macrotracker-copy-today-mobile.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    print('PASS: selected-tab copying, append behavior, source preservation, today refresh, duplicate-click guard, empty/error feedback, same-day disabled, mobile placement')
finally:
    request(prefix, method='DELETE')
