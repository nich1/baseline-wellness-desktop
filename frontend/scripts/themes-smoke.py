"""Start chromedriver on :9515, then run python scripts/ui-layout-smoke.py.

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


def open_settings():
    click('.settings-button')
    wait_for('document.querySelector(".theme-dialog")?.open')


def preset(name):
    js('const button=[...document.querySelectorAll(".theme-preset")].find(b=>b.querySelector("span:nth-child(2)").textContent===arguments[0]);button.click()',name)


def color(label,value):
    js('document.querySelector(`input[aria-label="${arguments[0]}"]`).closest("details").open=true',label)
    set_value(f'input[aria-label="{label}"]',value)


def variable(name):
    return js('return getComputedStyle(document.documentElement).getPropertyValue(arguments[0]).trim()', '--'+name)


def apply():
    click('.theme-footer .primary')
    wait_for('!document.querySelector(".theme-dialog")')


try:
    request(prefix + '/goog/cdp/execute', {'cmd':'Page.addScriptToEvaluateOnNewDocument','params':{'source':"""
      const realFetch=window.fetch;
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const day=i=>{let d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-i);return d.toISOString().slice(0,10)};
      const nutrients={calories:650,protein:45,carbohydrates:60,fiber:8,sugars:12,added_sugars:2,sugar_alcohols:0,fat:20,saturated_fat:5,trans_fat:0,monounsaturated_fat:7,polyunsaturated_fat:5,cholesterol:90,sodium:640,potassium:450};
      const foods=[{...nutrients,id:1,name:'Greek yogurt with blueberries, oats and almond butter',serving:'250 g',quantity:1.5,eaten_on:today},{...nutrients,id:2,name:'Chicken and roasted vegetable rice bowl',serving:'1 bowl',quantity:1,eaten_on:today}];
      const lifts=Array.from({length:9},(_,i)=>({id:i+1,exercise:['Bench Press','Archer Row','Incline Dumbbell Press'][i%3],weight:135+i*5,reps:8,logged_on:day(Math.floor(i/3)),created_at:today}));
      const cardio=Array.from({length:5},(_,i)=>({id:i+1,activity:'Run',duration_minutes:35+i*3,distance:4+i*.2,distance_unit:'mi',average_heart_rate:140+i,elevation_gain:150,perceived_effort:6,notes:'Easy steady effort along the river trail',logged_on:day(i*3),created_at:today}));
      const targets={calories:2200,protein:160,carbohydrates:250,fat:75,fiber:30,potassium:3500,saturated_fat:20,added_sugars:30,sugars:65,sodium:2300,cholesterol:300,strength_days:4,strength_sets:48,cardio_days:3,cardio_minutes:120,cardio_miles:12};
      window.fetch=async(url,options={})=>{
        if(!String(url).startsWith('http://localhost:8000'))return realFetch(url,options);
        if(options.method&&options.method!=='GET')throw new Error('Unexpected write during layout review');
        const u=new URL(url),p=u.pathname;let result=[];
        if(p==='/entries')result={date:u.searchParams.get('eaten_on'),entries:foods,bodyweight:180.6,totals:Object.fromEntries(Object.entries(nutrients).map(([k,v])=>[k,v*2]))};
        if(p==='/foods')result=foods;
        if(p==='/meals')result=[{id:1,name:'Weekday lunch',calories:650,protein:45,items:[{id:1,quantity:1,food:foods[0]}]}];
        if(p==='/targets')result=targets;
        if(p==='/lifts')result=lifts.filter(l=>!u.searchParams.has('logged_on')||l.logged_on===u.searchParams.get('logged_on'));
        if(p==='/cardio')result=cardio.filter(l=>!u.searchParams.has('logged_on')||l.logged_on===u.searchParams.get('logged_on'));
        if(p==='/bodyweight')result=Array.from({length:35},(_,i)=>({logged_on:day(34-i),weight:184-i*.1+Math.sin(i)*.7}));
        if(p==='/bodyweight-goal')result={id:1,weight:170};
        if(p==='/exercise-tensions')result=[{exercise:'Bench Press',allocations:[{muscle:'chest',percent:55,heads:{clavicular:25,middle:45,lower:30}},{muscle:'triceps',percent:25},{muscle:'front_delts',percent:20}]},{exercise:'Archer Row',allocations:[{muscle:'rear_delts',percent:70},{muscle:'traps',percent:30,heads:{middle:70}}]},{exercise:'Incline Dumbbell Press',allocations:[{muscle:'chest',percent:60,heads:{clavicular:70}},{muscle:'front_delts',percent:40}]}];
        if(p==='/target-history')result=Array.from({length:35},(_,i)=>({date:day(34-i),entries:2,nutrients,strength_sets:8,strength_volume:4500,cardio_sessions:1,cardio_minutes:30,cardio_miles:3}));
        return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix+'/url',{'url':'http://localhost:3000'})
    wait_for('document.querySelector(".settings-button") && document.querySelector(".food-row")')
    original=js('const s=getComputedStyle(document.querySelector(".log-panel"));return [getComputedStyle(document.body).backgroundColor,s.backgroundColor,getComputedStyle(document.querySelector(".brand-logo img")).visibility]')
    assert variable('bg')=='#0a0a0a'
    assert original[2]=='visible', 'Default logo must use untouched pixels'
    assert js('return document.querySelector(".set-targets-button").nextElementSibling.matches(".settings-button")')
    open_settings()
    assert js('return document.querySelectorAll(".theme-preset").length')==50
    set_value('input[aria-label="Search themes"]','tokio')
    assert js('return document.querySelectorAll(".theme-preset").length')==1
    preset('Tokyo Night')
    assert variable('accent')=='#bb9af7'
    set_value('input[aria-label="Search themes"]','')
    set_value('select[aria-label="Theme collection"]','Neon')
    assert js('return document.querySelectorAll(".theme-preset").length')==9
    preset('Cyberpunk')
    assert variable('chart')=='#00dfef'
    set_value('input[aria-label="Search themes"]','no-such-palette')
    assert js('return !!document.querySelector(".theme-empty")')
    click('.theme-empty button')
    assert js('return document.querySelectorAll(".theme-preset").length')==50
    assert js('return document.querySelector(".theme-presets").clientHeight<=310')
    preset('Forest')
    assert variable('accent')=='#6ee7a0'
    assert js('return localStorage.getItem("baseline-themes-v1")') is None
    request(prefix+'/actions',{'actions':[{'type':'key','id':'keyboard','actions':[{'type':'keyDown','value':'\ue00c'},{'type':'keyUp','value':'\ue00c'}]}]})
    wait_for('!document.querySelector(".theme-dialog")')
    assert variable('accent')=='#60a5fa'
    assert js('return document.activeElement.matches(".settings-button")')
    open_settings()
    preset('Paper')
    assert js('return getComputedStyle(document.documentElement).colorScheme')=='light'
    Path('/tmp/themes-paper.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    apply()
    request(prefix+'/refresh',{})
    wait_for('document.querySelector(".settings-button") && getComputedStyle(document.body).backgroundColor==="rgb(245, 243, 239)"')
    open_settings()
    color('Accent','#e97e35')
    color('Graph lines & points','#ce3399')
    color('Bodyweight increase','#3456ab')
    color('Bodyweight decrease','#789012')
    color('Symbol','#223344')
    color('BASELINE text','#112233')
    color('Chest','#c45422')
    set_value('.theme-name input','My sunset')
    assert variable('logo-wordmark-main')=='#112233'
    assert js('return getComputedStyle(document.querySelector(".brand-wordmark-main")).display')=='block'
    assert variable('muscle-chest')=='#c45422'
    apply()
    saved=js('return JSON.parse(localStorage.getItem("baseline-themes-v1"))')
    assert saved['active']['name']=='My sunset' and len(saved['custom'])==1
    request(prefix+'/url',{'url':'http://localhost:3000/trends'})
    wait_for('document.querySelector(".raw-line") && getComputedStyle(document.querySelector(".raw-line")).stroke==="rgb(206, 51, 153)"')
    assert js('return document.querySelector(".analysis-nav").lastElementChild.matches(".settings-button")')
    assert js('return getComputedStyle(document.querySelector(".weight-change-up")).color')=='rgb(52, 86, 171)'
    assert js('return getComputedStyle(document.querySelector(".weight-change-down")).color')=='rgb(120, 144, 18)'
    open_settings()
    preset('Ocean')
    click('.theme-footer .button:not(.primary)')
    assert variable('accent')=='#e97e35'
    open_settings()
    set_value('select[aria-label="Theme collection"]','Custom')
    assert js('return document.querySelectorAll(".theme-preset").length')==1
    preset('My sunset')
    click('.theme-close')
    # Custom deletion is only committed on Apply; Cancel restores it.
    open_settings()
    click('.theme-delete')
    click('.theme-footer .button:not(.primary)')
    assert len(js('return JSON.parse(localStorage.getItem("baseline-themes-v1")).custom'))==1
    open_settings()
    click('.theme-delete')
    apply()
    assert len(js('return JSON.parse(localStorage.getItem("baseline-themes-v1")).custom'))==0
    assert variable('accent')=='#60a5fa'
    # A storage failure must keep the editor open and recover with Cancel.
    open_settings()
    preset('Plum')
    js('window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error("Blocked")};')
    click('.theme-footer .primary')
    wait_for('document.querySelector(".theme-footer [role=alert]")')
    assert js('return document.querySelector(".theme-dialog").open')
    js('Storage.prototype.setItem=window.originalSetItem')
    click('.theme-footer .button:not(.primary)')
    assert variable('accent')=='#60a5fa'
    # Gear and modal remain usable on small screens and every shared header.
    for route in ['/', '/trends', '/strength', '/export', '/cardio', '/targets', '/trends/targets']:
        request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':320,'height':740,'deviceScaleFactor':1,'mobile':False}})
        request(prefix+'/url',{'url':'http://localhost:3000'+route})
        wait_for('document.querySelector(".settings-button")')
        assert js('return document.documentElement.scrollWidth<=innerWidth'),route
        open_settings()
        preset('Ocean')
        assert js('const d=document.querySelector(".theme-dialog").getBoundingClientRect();return d.left>=0 && d.right<=innerWidth && d.top>=0 && d.bottom<=innerHeight')
        js('document.querySelectorAll(".theme-group").forEach(d=>d.open=true)')
        assert js('return document.querySelector(".theme-dialog").scrollWidth<=document.querySelector(".theme-dialog").clientWidth')
        if route=='/':Path('/tmp/themes-mobile.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
        click('.theme-close')
    # Broken storage should safely return to the original palette.
    js('localStorage.setItem("baseline-themes-v1","{broken")')
    request(prefix+'/refresh',{})
    wait_for('document.querySelector(".settings-button")')
    assert variable('accent')=='#60a5fa'
    print('PASS: 50 presets, search/collection filtering, empty results, custom collection, original default, preset preview/cancel, Escape/focus, light theme, custom colors and logo, persistence/navigation, graph/change colors, delete/cancel, storage failure recovery, malformed storage, and all headers at 320px.')
finally:
    request(prefix,method='DELETE')
