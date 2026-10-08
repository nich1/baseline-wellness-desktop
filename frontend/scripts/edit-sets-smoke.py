"""Start chromedriver on :9515, then run python scripts/edit-sets-smoke.py.

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
    request(prefix+'/goog/cdp/execute', {'cmd':'Page.addScriptToEvaluateOnNewDocument','params':{'source':"""
      const realFetch=window.fetch;
      const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
      window.today=fmt.format(new Date()); window.yesterday=fmt.format(new Date(Date.now()-86400000));
      window.lifts=[
        {id:1,exercise:'Bench',weight:100,reps:10,logged_on:today,created_at:'original-1'},
        {id:2,exercise:'Row',weight:50,reps:10,logged_on:today,created_at:'original-2'},
        {id:3,exercise:'Yesterday',weight:10,reps:5,logged_on:yesterday,created_at:'original-3'}
      ]; window.puts=[];
      window.fetch=async (url,options={})=>{
        if(!String(url).startsWith('http://localhost:8000'))return realFetch(url,options);
        const u=new URL(url),p=u.pathname;let result=[];
        if(p.startsWith('/lifts/')&&options.method==='PUT'){
          const id=Number(p.split('/').pop()),payload=JSON.parse(options.body);window.puts.push({id,...payload});
          if(window.failEdit)return new Response(JSON.stringify({detail:'Edit rejected'}),{status:500});
          if(window.holdEdit)await new Promise(resolve=>window.releaseEdit=resolve);
          window.lifts=window.lifts.map(l=>l.id===id?{...l,...payload}:l);result=window.lifts.find(l=>l.id===id);
        }else if(p==='/lifts')result=window.lifts.filter(l=>!u.searchParams.has('logged_on')||l.logged_on===u.searchParams.get('logged_on'));
        else if(p==='/exercise-tensions')result=[{exercise:'Bench',allocations:[{muscle:'chest',percent:100}]},{exercise:'Row',allocations:[{muscle:'lats',percent:100}]},{exercise:'Prone Leg Curl',allocations:[{muscle:'hamstrings',percent:100}]}];
        else if(p==='/targets')result={calories:2200,protein:160,carbohydrates:250,fat:75};
        else if(p==='/entries')result={date:u.searchParams.get('eaten_on'),bodyweight:null,entries:[],totals:{calories:0,protein:0,carbohydrates:0,fiber:0,sugars:0,fat:0,saturated_fat:0,sodium:0}};
        return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix+'/url',{'url':'http://localhost:3000'})
    wait_for('document.querySelector(\'[aria-controls="lift-tracker-panel"]\')')
    click('[aria-controls="lift-tracker-panel"]')
    wait_for('document.querySelector(\'[data-lift-id="1"]\')')
    assert js('return !!document.querySelector(\'.lift-exercise-field option[value="saved:Prone Leg Curl"]\')')
    assert js('return window.lifts.length')==3, 'Configured exercise must not create a set'
    row='[data-lift-id="1"]'
    edit=row+' [aria-label="Edit Bench set"]'
    click(edit)
    wait_for('document.querySelector(".lift-edit-form")')
    assert js('return document.activeElement===document.querySelector(".lift-edit-form .input-unit input")')
    assert js('return document.querySelector(".lift-edit-form .input-unit input").value')=='100'
    set_value('.lift-edit-form .input-unit input','110.5')
    set_value('.lift-edit-form input[max="100"]','8')
    # Cancel/Escape retains the saved row and returns keyboard focus.
    click('.lift-edit-actions button:first-child')
    wait_for('!document.querySelector(".lift-edit-form")')
    assert js('return window.puts.length')==0
    assert js('return document.querySelector(arguments[0]).textContent',row).find('100 lb')>=0
    wait_for('document.activeElement.getAttribute("aria-label")==="Edit Bench set"')
    click(edit)
    js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
    wait_for('!document.querySelector(".lift-edit-form")')
    click(edit)
    set_value('.lift-edit-exercise input','   ')
    click('.lift-edit-actions .primary')
    wait_for('document.querySelector(".lift-edit-error")')
    assert js('return window.puts.length')==0
    set_value('.lift-edit-exercise input','Row')
    set_value('.lift-edit-form input[max="100"]','101')
    assert not js('return document.querySelector(".lift-edit-form").checkValidity()')
    set_value('.lift-edit-form input[max="100"]','6')
    set_value('.lift-edit-form .input-unit input','125')
    # Failed saves keep both the stored values and the draft for retry.
    js('window.failEdit=true')
    click('.lift-edit-actions .primary')
    wait_for('document.querySelector(".lift-edit-error")?.textContent==="Edit rejected"')
    assert js('return window.lifts.find(l=>l.id===1).weight')==100
    assert js('return document.querySelector(".lift-edit-form .input-unit input").value')=='125'
    assert js('return document.querySelector(".lift-summary").textContent.includes("1500")')
    for width,height in [(1500,1100),(390,844),(320,740)]:
        request(prefix+'/window/rect',{'width':width,'height':height})
        js('document.querySelector(".lift-edit-form").scrollIntoView({behavior:"instant",block:"center"})')
        assert js('return document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
        assert js('const f=document.querySelector(".lift-edit-form");return [...f.querySelectorAll("input,button")].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})')
        Path(f'/tmp/edit-sets-{width}.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    # A delayed save blocks duplicate submissions. Navigating to another day
    # cannot put the response into that day's rows or alter its totals.
    js('window.failEdit=false;window.holdEdit=true')
    click('.lift-edit-actions .primary')
    wait_for('window.releaseEdit && document.querySelector(".lift-edit-actions .primary").disabled')
    assert js('return document.querySelector(".lift-edit-actions button:first-child").disabled')
    click('.lift-edit-actions .primary')
    assert js('return window.puts.length')==2
    click('[aria-label="Previous day"]')
    wait_for('document.querySelector(\'[data-lift-id="3"]\')')
    js('window.releaseEdit()')
    wait_for('window.lifts.find(l=>l.id===1).weight===125')
    assert js('return document.querySelector(".lift-list").textContent.includes("Yesterday")')
    assert js('return document.querySelector(".lift-summary").textContent.includes("50")')
    click('[aria-label="Next day"]')
    wait_for('document.querySelector(\'[data-lift-id="1"]\')?.textContent.includes("125 lb")')
    assert js('return document.querySelectorAll(".lift-list article").length')==2
    assert js('return document.querySelector(".lift-summary").textContent.includes("1250")')
    assert js('return document.querySelector(".lift-summary").textContent.includes("150")')
    assert js('return window.lifts.find(l=>l.id===1).logged_on===today&&window.lifts.find(l=>l.id===1).created_at==="original-1"')
    # Save again without changing the set ID, then remount in the Volume tab.
    js('window.holdEdit=false')
    click(row+' [aria-label="Edit Row set"]')
    set_value('.lift-edit-exercise input','Row')
    set_value('.lift-edit-form .input-unit input','110.5')
    set_value('.lift-edit-form input[max="100"]','8')
    click('.lift-edit-actions .primary')
    wait_for('!document.querySelector(".lift-edit-form")')
    assert js('return document.querySelector(arguments[0]).textContent.includes("884")',row)
    click('[aria-controls="volume-tracker-panel"]')
    wait_for('document.querySelector("[data-testid=distributed-total]")?.textContent==="1,384LB × REPS"')
    assert not js('return !!document.querySelector("[data-muscle=chest]")')
    assert js('return document.querySelector("[data-muscle=lats] .volume-amount").textContent')=='1,384100%'
    request(prefix+'/url',{'url':'http://localhost:3000/strength'})
    wait_for('document.querySelector(".exercise-select select option")?.textContent==="Bench"')
    assert js('return [...document.querySelectorAll(".exercise-select option")].some(o=>o.value==="Prone Leg Curl")')
    set_value('.exercise-select select','Prone Leg Curl')
    wait_for('document.querySelector(".tension-row")')
    assert js('return window.lifts.length')==3
    print('PASS: inline editing, cancel/Escape/focus, validation, failed-save retry, busy protection, date isolation, decimal weights, unchanged set IDs, totals, Volume refresh and desktop/mobile layout.')
finally:
    request(prefix,method='DELETE')
