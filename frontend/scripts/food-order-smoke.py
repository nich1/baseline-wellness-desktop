"""Start chromedriver on :9515, then run python scripts/food-order-smoke.py.

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
    raise AssertionError("Timed out: " + source + " Active: " + str(js('return document.activeElement?.outerHTML.slice(0,350)')))


def click(selector):
    js('document.querySelector(arguments[0]).click()', selector)



def set_value(selector, value):
    js("""const el = document.querySelector(arguments[0]);
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, arguments[1]);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));""", selector, value)


def ids():
    return js('return [...document.querySelectorAll(".food-row")].map(row=>Number(row.dataset.entryId))')


def key(entry_id, name):
    js('const el=document.querySelector(`[data-reorder-id="${arguments[0]}"]`);el.focus();el.dispatchEvent(new KeyboardEvent("keydown",{key:arguments[1],bubbles:true}))',entry_id,name)


def drag_entry(source, target, pointer='mouse', cancel=False):
    wait_for('[...document.querySelectorAll(".food-row")].every(row=>row.getAnimations().every(a=>a.playState!=="running"))')
    js('document.querySelector(`[data-reorder-id="${arguments[0]}"]`).scrollIntoView({block:"center",behavior:"instant"})',source)
    coords=js('const a=document.querySelector(`[data-reorder-id="${arguments[0]}"]`).getBoundingClientRect(), b=document.querySelector(`[data-entry-id="${arguments[1]}"]`).getBoundingClientRect(), row=document.querySelector(`[data-entry-id="${arguments[0]}"]`).getBoundingClientRect();return [Math.round(a.x+a.width/2),Math.round(a.y+a.height/2),Math.round(b.y+a.y+a.height/2-row.y)]',source,target)
    if pointer == 'touch':
        for event_type,y in [('touchStart',coords[1]),('touchMove',coords[2]),('touchEnd',coords[2])]:
            points=[] if event_type=='touchEnd' else [{'x':coords[0],'y':y,'id':1}]
            request(prefix+'/goog/cdp/execute',{'cmd':'Input.dispatchTouchEvent','params':{'type':event_type,'touchPoints':points}})
            time.sleep(.1)
        wait_for('!document.querySelector(".is-dragging") && !document.querySelector(".food-drag-handle").disabled')
        return
    request(prefix+'/actions',{'actions':[{'type':'pointer','id':'drag-'+pointer,'parameters':{'pointerType':pointer},'actions':[{'type':'pointerMove','duration':0,'x':coords[0],'y':coords[1]},{'type':'pointerDown','button':0},{'type':'pointerMove','duration':350,'x':coords[0],'y':coords[2]}]}]})
    if cancel:
        js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
    request(prefix+'/actions',{'actions':[{'type':'pointer','id':'drag-'+pointer,'parameters':{'pointerType':pointer},'actions':[{'type':'pointerUp','button':0}]}]})
    wait_for('!document.querySelector(".food-drag-handle").disabled')


try:
    request(prefix+'/goog/cdp/execute', {'cmd':'Page.addScriptToEvaluateOnNewDocument','params':{'source':"""
      const realFetch=window.fetch;
      const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
      window.today=fmt.format(new Date()); window.yesterday=fmt.format(new Date(Date.now()-86400000));
      const totals={calories:600,protein:60,carbohydrates:30,fat:10,fiber:5,sugars:0,saturated_fat:0,sodium:20};
      const names=['Breakfast','Lunch','Dinner'];
      window.foods=names.map((name,i)=>({...totals,id:i+1,name,quantity:1,serving:'1 bowl',calories:200,protein:20,eaten_on:today,created_at:'2026-10-01T12:00:00Z'}));
      window.puts=[];
      window.fetch=async (url,options={})=>{
        if(!String(url).startsWith('http://localhost:8000'))return realFetch(url,options);
        const u=new URL(url),p=u.pathname;let result=[];
        if(p==='/entries/order'&&options.method==='PUT'){
          const payload=JSON.parse(options.body);window.puts.push(payload);
          if(window.failOrder)return new Response(JSON.stringify({detail:'Order rejected'}),{status:500});
          if(window.holdOrder)await new Promise(resolve=>window.releaseOrder=resolve);
          localStorage.setItem('fixture-order',JSON.stringify(payload.entry_ids));
          return new Response(null,{status:204});
        }else if(p==='/entries'){
          const day=u.searchParams.get('eaten_on');
          const order=JSON.parse(localStorage.getItem('fixture-order')||'[1,2,3]');
          result={date:day,bodyweight:null,entries:day===today?order.map(id=>foods.find(f=>f.id===id)):[],totals:day===today?totals:{...totals,calories:0,protein:0}};
        }else if(p==='/targets')result={calories:2200,protein:160,carbohydrates:250,fat:75};
        return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix+'/url',{'url':'http://localhost:3000'})
    wait_for('document.querySelectorAll(".food-row").length===3')
    assert ids()==[1,2,3]
    # Swap on a small leading-edge overlap, animate neighbors, and keep the
    # held row anchored to the pointer even after its DOM position changes.
    js('document.querySelector(".entry-list").scrollIntoView({block:"center",behavior:"instant"})')
    x,y,top=js('const h=document.querySelector(".food-drag-handle").getBoundingClientRect(),r=document.querySelector(".food-row").getBoundingClientRect();return [Math.round(h.x+h.width/2),Math.round(h.y+h.height/2),r.top]')
    request(prefix+'/actions',{'actions':[{'type':'pointer','id':'sensitivity','parameters':{'pointerType':'mouse'},'actions':[{'type':'pointerMove','duration':0,'x':x,'y':y},{'type':'pointerDown','button':0},{'type':'pointerMove','duration':50,'x':x,'y':y+36}]}]})
    assert ids()==[2,1,3], 'A 36px movement should already swap adjacent rows'
    assert js('return [...document.querySelectorAll(".food-row")].find(r=>r.dataset.entryId==="2").getAnimations().length')>0, "Neighbor should slide into place"
    assert abs(js('return [...document.querySelectorAll(".food-row")].find(r=>r.dataset.entryId==="1").getBoundingClientRect().top')-top-36)<2, "Held row should follow pointer without jumping"
    time.sleep(.25)
    assert ids()==[2,1,3], 'Stationary pointer must not oscillate'
    request(prefix+'/actions',{'actions':[{'type':'pointer','id':'sensitivity','parameters':{'pointerType':'mouse'},'actions':[{'type':'pointerMove','duration':50,'x':x,'y':y+10}]}]})
    assert ids()==[1,2,3], 'Reversing direction should restore the previous slot'
    request(prefix+'/actions',{'actions':[{'type':'pointer','id':'sensitivity','parameters':{'pointerType':'mouse'},'actions':[{'type':'pointerUp','button':0}]}]})
    time.sleep(.2)
    assert js('return window.puts.length')==0
    nutrition=js('return document.querySelector(".macro-strip").textContent')
    drag_entry(1,3)
    assert ids()==[2,3,1], ids()
    assert js('return window.puts.length')==1
    assert js('return window.puts[0].eaten_on===today')
    assert js('return document.querySelector(".macro-strip").textContent')==nutrition
    request(prefix+'/refresh',{})
    wait_for('document.querySelectorAll(".food-row").length===3')
    assert ids()==[2,3,1]
    key(1,'ArrowUp')
    wait_for('!document.querySelector(".food-drag-handle").disabled')
    assert ids()==[2,1,3]
    wait_for('document.activeElement.dataset.reorderId==="1"')
    # Failed saves roll back, announce the error, and allow retry.
    js('window.failOrder=true')
    key(1,'ArrowUp')
    wait_for('document.querySelector(".food-reorder-error")')
    assert ids()==[2,1,3]
    js('window.failOrder=false')
    key(1,'ArrowUp')
    wait_for('!document.querySelector(".food-drag-handle").disabled')
    assert ids()==[1,2,3]
    count=js('return window.puts.length')
    key(1,'ArrowUp')
    assert js('return window.puts.length')==count, 'First row boundary must not save'
    drag_entry(1,3,cancel=True)
    assert ids()==[1,2,3]
    assert js('return window.puts.length')==count, 'Escape must cancel without saving'
    # Touch dragging and narrow layouts.
    request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':390,'height':1000,'deviceScaleFactor':1,'mobile':False}})
    drag_entry(1,2,pointer='touch')
    assert ids()==[2,1,3], ids()
    for width in (390,320,1500):
        request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':width,'height':1000,'deviceScaleFactor':1,'mobile':False}})
        js('document.querySelector(".log-panel").scrollIntoView({block:"start",behavior:"instant"})')
        time.sleep(.2)
        assert js('return document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
        Path(f'/tmp/food-order-{width}.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    # Respect reduced motion while retaining keyboard reordering.
    request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setEmulatedMedia','params':{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]}})
    key(3,'ArrowUp')
    wait_for('!document.querySelector(".food-drag-handle").disabled')
    assert ids()==[2,3,1]
    assert js('return [...document.querySelectorAll(".food-row")].every(row=>row.getAnimations().length===0)')
    key(3,'ArrowDown')
    wait_for('!document.querySelector(".food-drag-handle").disabled')
    assert ids()==[2,1,3]
    request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setEmulatedMedia','params':{'features':[]}})
    # Pending save can't reorder a newly selected day or fire twice.
    js('window.holdOrder=true')
    key(1,'ArrowUp')
    wait_for('typeof window.releaseOrder==="function"')
    count=js('return window.puts.length')
    key(1,'ArrowDown')
    assert js('return window.puts.length')==count
    click('[aria-label="Previous day"]')
    wait_for('document.querySelector(".empty-state h3")?.textContent==="No food logged"')
    js('window.releaseOrder();window.holdOrder=false')
    time.sleep(.2)
    assert ids()==[]
    click('[aria-label="Next day"]')
    wait_for('document.querySelectorAll(".food-row").length===3')
    assert ids()==[1,2,3]
    print('PASS: early edge swapping, animated neighbors, pointer tracking, stable hover, reversal, reduced motion, mouse and touch reorder, persisted refresh, keyboard and focus, boundaries, cancel, failed-save rollback/retry, duplicate prevention, date isolation, unchanged nutrition, and 320/390/1500px layouts.')
finally:
    request(prefix,method='DELETE')
