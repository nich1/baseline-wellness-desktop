"""Start chromedriver on :9515, then run python scripts/volume-distribution-smoke.py.

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
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      window.lifts = [
        {id:1,exercise:'Bench',weight:100,reps:10,logged_on:today},
        {id:2,exercise:'Bench',weight:100,reps:5,logged_on:today},
        {id:3,exercise:'Row',weight:50,reps:10,logged_on:today},
        {id:4,exercise:'Unconfigured exercise',weight:50,reps:10,logged_on:today},
      ];
      window.profiles = [
        {exercise:'Bench',allocations:[{muscle:'chest',percent:60,heads:{clavicular:70}},{muscle:'triceps',percent:40,heads:{long:30,lateral:30}}]},
        {exercise:'Row',allocations:[{muscle:'lats',percent:100}]},
      ];
      window.fetch = async (url,options={}) => {
        if (!String(url).startsWith('http://localhost:8000')) return realFetch(url,options);
        const parsed = new URL(url), path=parsed.pathname;
        let result=[];
        if (path==='/exercise-tensions') {
          if (window.failProfiles) return new Response('{}',{status:500});
          result=window.profiles;
        } else if (path==='/lifts' && options.method==='POST') {
          result={...JSON.parse(options.body),id:10}; window.lifts.push(result);
        } else if (path.startsWith('/lifts/') && options.method==='DELETE') {
          window.lifts=window.lifts.filter(l=>l.id!==Number(path.split('/').pop()));
          return new Response(null,{status:204});
        } else if (path==='/lifts') {
          if(window.failLifts) return new Response('{}',{status:500});
          result=window.lifts.filter(l=>!parsed.searchParams.has('logged_on')||l.logged_on===parsed.searchParams.get('logged_on'));
        } else if (path==='/targets') result={calories:2200,protein:160,carbohydrates:250,fat:75};
        else if (path==='/entries') result={date:parsed.searchParams.get('eaten_on'),bodyweight:null,entries:[],totals:{calories:0,protein:0,carbohydrates:0,fiber:0,sugars:0,fat:0,saturated_fat:0,sodium:0}};
        return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix + '/url', {'url':'http://localhost:3000'})
    wait_for('document.querySelector("#lift-tracker-panel") || document.querySelector(\'[aria-controls="lift-tracker-panel"]\')')
    click('[aria-controls="volume-tracker-panel"]')
    wait_for('document.querySelector(".volume-muscle")')
    assert not js('return !!document.querySelector(".daily-lifts")')
    assert not js('return !!document.querySelector(".copy-today-button")')
    assert js('return document.querySelector(".volume-distribution").parentElement.id') == 'volume-tracker-panel'
    assert js('return document.querySelector("[data-testid=distributed-total]").textContent') == '2,500LB × REPS'
    assert js('return document.querySelector("[data-muscle=chest] .volume-amount").textContent') == '90036%'
    assert js('return document.querySelector(".volume-unassigned").textContent.includes("500 lb × reps (20%)")')
    click('[data-muscle="chest"] summary')
    assert js('return document.querySelector("[data-muscle=chest] .volume-detail").textContent.includes("63070%")')
    js('document.querySelector(".volume-distribution").scrollIntoView({behavior:"instant",block:"start"})')
    Path('/tmp/daily-volume-desktop.png').write_bytes(base64.b64decode(request(prefix + '/screenshot')))
    click('.volume-view-control input')
    assert js('return document.querySelector(".volume-view-control input").checked')
    assert js('return document.querySelectorAll(".volume-region-row").length') == 8
    assert js('return Array.from(document.querySelectorAll(".volume-region-group"), el=>el.dataset.muscleGroup)') == ['chest','triceps','lats']
    assert js('return document.querySelector("[data-muscle-group=chest] .volume-region-group-heading .volume-amount").textContent') == '90036% of day'
    assert js('return Array.from(document.querySelectorAll("[data-muscle-group=chest] .volume-region-row"), el=>el.dataset.region)') == ['chest:clavicular','chest:middle','chest:lower']
    assert js('return !document.querySelector(".volume-muscle")')
    assert js('return document.querySelector(".volume-region-row .volume-amount").textContent') == '63025.2%'
    assert js('return document.querySelector(".volume-region-row .volume-region-name").textContent.includes("70% of chest")')
    assert js('return document.querySelector("[data-testid=distributed-total]").textContent') == '2,500LB × REPS'
    assert js('return document.querySelector(".volume-unassigned").textContent.includes("500 lb × reps (20%)")')
    Path('/tmp/daily-regions-desktop.png').write_bytes(base64.b64decode(request(prefix + '/screenshot')))
    request(prefix + '/window/rect', {'width':390,'height':1000})
    js('document.querySelector(".volume-distribution").scrollIntoView({behavior:"instant",block:"start"})')
    assert js('return document.documentElement.scrollWidth <= window.innerWidth')
    Path('/tmp/daily-volume-mobile.png').write_bytes(base64.b64decode(request(prefix + '/screenshot')))
    Path('/tmp/daily-regions-mobile.png').write_bytes(base64.b64decode(request(prefix + '/screenshot')))
    click('.volume-view-control input')
    assert js('return document.querySelectorAll(".volume-muscle").length') == 3
    click('[aria-controls="lift-tracker-panel"]')
    wait_for('document.querySelector(`.lift-exercise-field select option[value="saved:Bench"]`)')
    assert not js('return !!document.querySelector(".volume-distribution")')
    set_value('.lift-exercise-field select','saved:Bench')
    set_value('.lift-form .input-unit input','100')
    set_value('.lift-form input[max="100"]','5')
    click('.lift-form .primary')
    wait_for('!document.querySelector(".lift-form .primary").disabled')
    click('[aria-controls="volume-tracker-panel"]')
    wait_for('document.querySelector(".volume-muscle")')
    wait_for('document.querySelector("[data-testid=distributed-total]").textContent === "3,000LB × REPS"')
    assert js('return document.querySelector("[data-muscle=chest] .volume-amount").textContent') == '1,20040%'
    click('[aria-controls="lift-tracker-panel"]')
    wait_for('document.querySelector(`[aria-label="Delete Bench set"]`)')
    click('[aria-label="Delete Bench set"]')
    wait_for('!document.querySelector(".lift-form .primary").disabled')
    click('[aria-controls="volume-tracker-panel"]')
    wait_for('document.querySelector(".volume-muscle")')
    wait_for('document.querySelector("[data-testid=distributed-total]").textContent === "2,000LB × REPS"')
    click('[aria-label="Previous day"]')
    wait_for('document.querySelector(".volume-message")?.textContent.includes("No volume logged")')
    assert js('return !document.querySelector(".volume-muscle")')
    click('[aria-label="Next day"]')
    wait_for('document.querySelector("[data-testid=distributed-total]")?.textContent === "2,000LB × REPS"')
    js('window.profiles[0].allocations=[{muscle:"chest",percent:100}]; window.dispatchEvent(new Event("focus"))')
    wait_for('document.querySelector("[data-muscle=chest] .volume-amount")?.textContent === "1,00050%"')
    js('window.failProfiles=true; window.dispatchEvent(new Event("focus"))')
    wait_for('document.querySelector(".volume-message [role=alert]")')
    assert js('return !document.querySelector(".volume-unassigned")')
    js('window.failProfiles=false')
    click('.volume-message button')
    wait_for('document.querySelector(".volume-muscle")')
    js('window.failLifts=true')
    click('[aria-label="Previous day"]')
    wait_for('document.querySelector(".volume-message")?.textContent.includes("Could not load this day")')
    assert js('return !document.querySelector(".volume-muscle")')
    print('PASS: card placement, weighted volume and regions, missing settings, add/delete updates, dates, empty/error/retry states, refreshed profiles, mobile layout')
finally:
    request(prefix, method='DELETE')
