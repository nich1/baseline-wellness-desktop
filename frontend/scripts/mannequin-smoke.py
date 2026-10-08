"""Start chromedriver on :9515, then run python scripts/mannequin-smoke.py.

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
        "binary": "/usr/bin/chromium", "args": ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1500,1200", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl"],
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
    wait_for('document.querySelector(".muscle-map")')
    js('document.querySelector(".muscle-map").scrollIntoView({behavior:"instant",block:"start"})')
    wait_for('document.querySelector(".muscle-map-canvas").dataset.status!=="loading"')
    assert js('return document.querySelector(".muscle-map-canvas").dataset.status')=='ready', 'WebGL model must render'
    time.sleep(1)
    Path('/tmp/mannequin-front.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    click('.muscle-map-views button:nth-child(2)')
    time.sleep(.3)
    Path('/tmp/mannequin-back.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    # Every rendered selection is also reachable without pointing at a small mesh.
    set_value('.muscle-map-select','chest')
    assert js('return document.querySelector(".muscle-map-selection").dataset.area')=='chest'
    assert js('return document.querySelector(".muscle-map-stats").textContent.includes("900")')
    assert js('return document.querySelector(".muscle-map-stats").textContent.includes("36")')
    assert js('return document.querySelector(".muscle-map-exercises").textContent.includes("Bench900")')
    # Exercise real raycasting; don't replace the renderer with a mock.
    set_value('.muscle-map-select','')
    click('.muscle-map-camera button:last-child')
    js('document.querySelector(".muscle-map").scrollIntoView({behavior:"instant",block:"start"})')
    coords=js('const r=document.querySelector(".muscle-map canvas").getBoundingClientRect();return [Math.round(r.x+r.width*.5-r.height*.055),Math.round(r.y+r.height*.28)]')
    request(prefix+'/actions',{'actions':[{'type':'pointer','id':'mouse','parameters':{'pointerType':'mouse'},'actions':[{'type':'pointerMove','duration':0,'x':coords[0],'y':coords[1]},{'type':'pointerDown','button':0},{'type':'pointerUp','button':0}]}]})
    wait_for('document.querySelector(".muscle-map-selection")')
    assert js('return document.querySelector(".muscle-map-selection").dataset.area')=='chest','Chest raycast missed'
    click('.volume-view-control input')
    assert js('return document.querySelector(".muscle-map").dataset.mode')=='regions'
    set_value('.muscle-map-select','chest:clavicular')
    assert js('return document.querySelector(".muscle-map-stats").textContent.includes("630")')
    assert js('return document.querySelector(".muscle-map-stats").textContent.includes("25.2")')
    assert js('return document.querySelector(".muscle-map-exercises").textContent.includes("Bench630")')
    js('document.querySelector(".muscle-map").scrollIntoView({behavior:"instant",block:"start"})')
    time.sleep(.3)
    Path('/tmp/mannequin-regions.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    for head in ['long','short']:
        set_value('.muscle-map-select','biceps:'+head)
        assert js('return document.querySelector(".muscle-map-selection").dataset.area')=='biceps:'+head
        assert js('return document.querySelector(".muscle-map-views button:first-child").getAttribute("aria-pressed")')=='true'
    set_value('.muscle-map-select','triceps:medial')
    assert js('return document.querySelector(".muscle-map-stats").textContent.includes("240")')
    assert js('return document.querySelector(".muscle-map-views button:nth-child(2)").getAttribute("aria-pressed")')=='true'
    set_value('.muscle-map-select','quads:rectus_femoris')
    assert js('return document.querySelector(".muscle-map-no-volume").textContent.includes("No volume")')
    # Keyboard rotation/zoom/reset works on the focusable canvas.
    js('const c=document.querySelector(".muscle-map canvas");c.focus();for(let i=0;i<3;i++)c.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));')
    assert js('return document.querySelectorAll(".muscle-map-views button[aria-pressed=true]").length')==0
    js('document.querySelector(".muscle-map canvas").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))')
    assert js('return document.querySelector(".muscle-map-views button:first-child").getAttribute("aria-pressed")')=='true'
    # Mouse dragging rotates without changing the selection.
    selected=js('return document.querySelector(".muscle-map-selection").dataset.area')
    request(prefix+'/actions',{'actions':[{'type':'pointer','id':'mouse','parameters':{'pointerType':'mouse'},'actions':[{'type':'pointerMove','duration':0,'x':coords[0],'y':coords[1]},{'type':'pointerDown','button':0},{'type':'pointerMove','duration':300,'x':coords[0]+180,'y':coords[1]},{'type':'pointerUp','button':0}]}]})
    assert js('return document.querySelector(".muscle-map-selection").dataset.area')==selected
    assert js('return document.querySelector(".muscle-map-views button:first-child").getAttribute("aria-pressed")')=='false'
    for width,height in [(1920,1080),(390,844),(844,390),(320,740)]:
        request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False}})
        click('.muscle-map-camera button:last-child')
        js('document.querySelector(".muscle-map").scrollIntoView({behavior:"instant",block:"start"})')
        time.sleep(.3)
        assert js('return document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
        assert js('const c=document.querySelector(".muscle-map canvas");return c.width>0&&c.height>0')
        Path(f'/tmp/mannequin-{width}x{height}.png').write_bytes(base64.b64decode(request(prefix+'/screenshot')))
    # Touch pinch and swipe use real browser pointer events.
    request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':390,'height':844,'deviceScaleFactor':1,'mobile':False}})
    request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setTouchEmulationEnabled','params':{'enabled':True,'maxTouchPoints':2}})
    js('document.querySelector(".muscle-map").scrollIntoView({behavior:"instant",block:"start"})')
    click('.muscle-map-camera button:last-child')
    time.sleep(.3)
    bounds=js('const r=document.querySelector(".muscle-map canvas").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}')
    def touch(kind,points):
        request(prefix+'/goog/cdp/execute',{'cmd':'Input.dispatchTouchEvent','params':{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i,'radiusX':2,'radiusY':2,'force':1} for i,(x,y) in enumerate(points)]}})
    before=request(prefix+'/screenshot')
    touch('touchStart',[(bounds['x']-25,bounds['y']),(bounds['x']+25,bounds['y'])])
    touch('touchMove',[(bounds['x']-65,bounds['y']),(bounds['x']+65,bounds['y'])])
    touch('touchEnd',[])
    time.sleep(.3)
    assert request(prefix+'/screenshot')!=before, 'Pinch should change model scale'
    touch('touchStart',[(bounds['x'],bounds['y'])])
    touch('touchMove',[(bounds['x']+80,bounds['y'])])
    touch('touchEnd',[])
    assert js('return document.querySelector(".muscle-map-views button:first-child").getAttribute("aria-pressed")')=='false', 'Touch swipe must rotate'
    request(prefix+'/goog/cdp/execute',{'cmd':'Emulation.setTouchEmulationEnabled','params':{'enabled':False}})
    # Saved profile changes update the selected region without rebuilding the page.
    set_value('.muscle-map-select','chest:clavicular')
    js('window.profiles[0].allocations=[{muscle:"chest",percent:100,heads:{clavicular:70}}];window.dispatchEvent(new Event("focus"))')
    wait_for('document.querySelector(".muscle-map-exercises").textContent.includes("Bench1,050")')
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
    click('.volume-view-control input')
    wait_for('document.querySelector(".muscle-map-select")')
    set_value('.muscle-map-select','chest:clavicular')
    wait_for('document.querySelector(".muscle-map-exercises").textContent.includes("Bench1,400")')
    click('[aria-controls="lift-tracker-panel"]')
    wait_for('document.querySelector(`[aria-label="Delete Bench set"]`)')
    click('[aria-label="Delete Bench set"]')
    wait_for('!document.querySelector(".lift-form .primary").disabled')
    click('[aria-controls="volume-tracker-panel"]')
    wait_for('document.querySelector(".volume-muscle")')
    click('.volume-view-control input')
    wait_for('document.querySelector(".muscle-map-select")')
    set_value('.muscle-map-select','chest:clavicular')
    wait_for('document.querySelector(".muscle-map-exercises").textContent.includes("Bench700")')
    # Different dates dispose the previous canvas, and empty days stay neutral.
    click('[aria-label="Previous day"]')
    wait_for('document.querySelector(".volume-message")?.textContent.includes("No volume logged")')
    assert not js('return !!document.querySelector(".muscle-map")')
    click('[aria-label="Next day"]')
    wait_for('document.querySelector("[data-testid=distributed-total]")?.textContent.includes("2,000")')
    wait_for('document.querySelector(".muscle-map")')
    click('.volume-view-control input')
    js('document.querySelector(".muscle-map").scrollIntoView({behavior:"instant",block:"start"})')
    wait_for('document.querySelector(".muscle-map-canvas").dataset.status==="ready"')
    # WebGL loss must leave the numerical explorer usable, with a working retry.
    js('document.querySelector(".muscle-map canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()')
    wait_for('document.querySelector(".muscle-map-canvas").dataset.status==="unavailable"')
    set_value('.muscle-map-select','chest:clavicular')
    assert js('return document.querySelector(".muscle-map-exercises").textContent.includes("Bench700")')
    click('.muscle-map-status button')
    wait_for('document.querySelector(".muscle-map-canvas").dataset.status==="ready"')
    assert js('return document.querySelectorAll(".muscle-map canvas").length')==1
    # A blocked context shows permission help; a lost context alone does not.
    js('document.querySelector(".muscle-map canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()')
    wait_for('document.querySelector(".muscle-map-canvas").dataset.status==="unavailable"')
    assert not js('return !!document.querySelector(".muscle-map-webgl-help")')
    js("""window.savedGetContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args) {
        if(type==='webgl2') {
          this.dispatchEvent(new WebGLContextEvent('webglcontextcreationerror',{statusMessage:'WebGL is currently disabled.'}));
          return null;
        }
        return window.savedGetContext.call(this,type,...args);
      };""")
    click('.muscle-map-status button')
    wait_for('document.querySelector(".muscle-map-webgl-help")')
    assert js('return document.querySelector(".muscle-map-webgl-help").textContent.includes("WebGL permissions")')
    assert js('return document.querySelector(".muscle-map-select").disabled') is False
    js('HTMLCanvasElement.prototype.getContext=window.savedGetContext')
    click('.muscle-map-status button')
    wait_for('document.querySelector(".muscle-map-canvas").dataset.status==="ready"')
    assert not js('return !!document.querySelector(".muscle-map-webgl-help")')
    print('PASS: real WebGL rendering and chest raycast, front/back, mouse and keyboard controls, head toggle, exact volume/contributions, unworked muscles, four responsive sizes, touch pinch/swipe, live profiles and add/delete updates, empty dates, context-loss fallback and retry.')
finally:
    request(prefix,method='DELETE')
