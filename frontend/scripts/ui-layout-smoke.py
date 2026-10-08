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


artifacts = Path('/tmp/ui-revamp')
artifacts.mkdir(exist_ok=True)
failures = []
checks = 0

def viewport(width, height):
    request(prefix + '/goog/cdp/execute', {'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False}})
    time.sleep(.08)


def layout(label, screenshot=False):
    global checks
    checks += 1
    result = js("""return {
      width:innerWidth, scroll:document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll('main *')).filter(el=>{
        const box=el.getBoundingClientRect();
        if(!box.width||getComputedStyle(el).position==='fixed') return false;
        if(el.closest('.target-table-scroll,.weight-history-scroll')) return false;
        return box.right>innerWidth+2||box.left < -2;
      }).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,txt:el.textContent.slice(0,70)}))
    }""")
    if result['scroll'] > result['width'] + 1:
        failures.append({'label':label,**result})
        (artifacts / 'failures.json').write_text(json.dumps(failures,indent=2))
    if screenshot:
        js('window.scrollTo({top:0,behavior:"instant"})')
        (artifacts / (label+'.png')).write_bytes(base64.b64decode(request(prefix+'/screenshot')))

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
    sizes=[(320,740),(390,844),(844,390),(768,1024),(1024,768),(1440,900),(1920,1080),(2560,1440),(720,450),(360,225)]
    routes=[('/', 'food'),('/', 'lifts'),('/', 'volume'),('/', 'cardio'),('/strength','strength'),('/trends','weight'),('/cardio','cardio-trends'),('/targets','targets'),('/trends/targets','target-progress'),('/export','export')]
    for route,name in routes:
        request(prefix+'/url',{'url':'http://localhost:3000'+route})
        wait_for('document.querySelector("main")')
        if route=='/':
            wait_for('document.querySelector(".food-row")')
            if name!='food':click('[aria-controls="'+({'lifts':'lift','volume':'volume','cardio':'cardio'}[name])+'-tracker-panel"]')
            wait_for('document.querySelector(".'+{'food':'food-row','lifts':'lift-list','volume':'volume-muscle','cardio':'cardio-list'}[name]+'")')
            if name=='volume':click('.volume-view-control input')
        elif name=='strength':
            wait_for('document.querySelector(".tension-row")')
        elif name=='targets':wait_for('document.querySelector(".target-fields")')
        elif name=='weight':wait_for('document.querySelector(".weight-chart")')
        elif name=='target-progress':wait_for('document.querySelector(".target-table")')
        elif name=='cardio-trends':wait_for('document.querySelector(".metric-chart")')
        for w,h in sizes:
            viewport(w,h)
            layout(f'{name}-{w}x{h}', (w,h) in [(390,844),(1920,1080),(844,390)])
            if w==1920:
                assert js('return document.querySelector("main").getBoundingClientRect().width') > 1600
                if name=='volume':assert js('return !document.querySelector(".daily-lifts") && document.querySelector(".muscle-map").getBoundingClientRect().left > document.querySelector(".volume-breakdown").getBoundingClientRect().right')
                if name=='cardio-trends':assert js('const p=document.querySelectorAll(".cardio-trend-grid .chart-panel");return Math.abs(p[0].getBoundingClientRect().top-p[1].getBoundingClientRect().top)<2')
            if w==390 and name=='food':
                assert js('return getComputedStyle(document.querySelector(".macro-strip")).gridTemplateColumns.split(" ").length')==2
            if name in ['strength','weight','cardio-trends']:
                wait_for('Array.from(document.querySelectorAll("svg.metric-chart, svg.weight-chart")).every(el=>Math.abs(el.viewBox.baseVal.width-(el.clientWidth-parseFloat(getComputedStyle(el).paddingLeft)-parseFloat(getComputedStyle(el).paddingRight)))<3)')
        if name=='strength':
            set_value('.exercise-select select','Bench Press')
            wait_for('document.querySelector(".muscle-regions")')
            js('document.querySelectorAll(".muscle-regions").forEach(el=>el.open=true)')
            for w,h in [(390,844),(844,390),(1440,900),(1920,1080)]:
                viewport(w,h);layout(f'strength-expanded-{w}x{h}',True)
    # Calendar and library remain usable in short landscape and narrow portrait.
    request(prefix+'/url',{'url':'http://localhost:3000'})
    wait_for('document.querySelector(".food-row")')
    for w,h in [(320,740),(390,844),(844,390),(1920,1080),(360,225)]:
        viewport(w,h)
        click('.date-picker-trigger')
        wait_for('document.querySelector(".calendar-popover")')
        layout(f'calendar-{w}x{h}',True)
        if not js('const r=document.querySelector(".calendar-popover").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1'):
            failures.append({'label':f'calendar-bounds-{w}x{h}', 'box':js('return document.querySelector(".calendar-popover").getBoundingClientRect().toJSON()')})
        click('.date-picker-trigger')
        click('.entry-library-button')
        wait_for('document.querySelector(".library-row")')
        time.sleep(0.2)  # Let the drawer entrance animation finish before capturing it.
        layout(f'library-{w}x{h}',True)
        if not js('const el=document.querySelector(".library-body");return el.clientHeight>40&&el.scrollWidth<=el.clientWidth+1'):
            failures.append({'label':f'library-body-{w}x{h}'})
        if h < 360:
            assert js('const el=document.querySelector(".library-panel");el.scrollTop=el.scrollHeight;return el.scrollTop>0'), 'Short dialog must scroll to its contents'
            js('document.querySelector(".library-panel").scrollTop=0')
        click('.library-new')
        layout(f'library-form-{w}x{h}')
        click('.library-header > button')
    print(json.dumps({'checks':checks,'failures':failures,'screenshots':str(artifacts)},indent=2))
    assert not failures, 'Layout overflow detected'
finally:
    request(prefix,method='DELETE')
