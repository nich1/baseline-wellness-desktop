"""Check library serving controls with browser fixtures; no real records are changed.

Start chromedriver on :9515, then run python scripts/library-quantity-smoke.py.
"""
import base64
import json
import time
import urllib.request


def request(path, data=None, method=None):
    req = urllib.request.Request('http://127.0.0.1:9515' + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Content-Type': 'application/json'}, method=method)
    with urllib.request.urlopen(req) as response:
        result = json.load(response)['value']
    if isinstance(result, dict) and 'error' in result:
        raise AssertionError(result)
    return result


sid = request('/session', {'capabilities': {'alwaysMatch': {
    'browserName': 'chrome', 'goog:chromeOptions': {
        'binary': '/usr/bin/chromium', 'args': ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,1000'],
    },
}}})['sessionId']
prefix = '/session/' + sid


def js(source, *args):
    return request(prefix + '/execute/sync', {'script': source, 'args': list(args)})


def wait(source):
    for _ in range(100):
        if js('return ' + source):
            return
        time.sleep(.1)
    raise AssertionError(source)


def fill(value):
    js("""const el=document.querySelector('.library-quantity input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,arguments[0]);
      el.dispatchEvent(new Event('input',{bubbles:true}));""", value)


def click(selector):
    js('document.querySelector(arguments[0]).click()', selector)


try:
    request(prefix + '/goog/cdp/execute', {'cmd': 'Page.addScriptToEvaluateOnNewDocument', 'params': {'source': """
      const realFetch=window.fetch;
      const nutrients={calories:140,protein:25,carbohydrates:8,fat:4,fiber:2,saturated_fat:1.5,sugars:3,added_sugars:1,sodium:100,potassium:0,cholesterol:0,sugar_alcohols:0,trans_fat:0,monounsaturated_fat:0,polyunsaturated_fat:0};
      const food={...nutrients,id:1,name:'Chicken',serving:'112 g',created_at:'2026-10-01T12:00:00Z'};
      const meal={id:1,name:'Chicken meal',calories:210,protein:37.5,items:[{id:1,food,quantity:1.5}]};
      window.logRequests=[];
      window.fetch=async (url,options={})=>{
        if(!String(url).startsWith('http://localhost:8000'))return realFetch(url,options);
        const u=new URL(url),path=u.pathname;
        let result=[];
        if(path==='/foods')result=[food];
        if(path==='/meals')result=[meal];
        if(path==='/targets')result={calories:2200,protein:160,carbohydrates:250,fat:75};
        if(path==='/entries')result={date:u.searchParams.get('eaten_on'),entries:[],bodyweight:null,totals:{...nutrients}};
        if(options.method==='POST'){
          window.logRequests.push({path,...JSON.parse(options.body)});
          result=path.startsWith('/meals')?[]:{};
        }
        return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix + '/url', {'url': 'http://localhost:3000'})
    wait('document.querySelector(".entry-library-button")')
    click('.entry-library-button')
    wait('document.querySelector(".library-quantity input")')
    assert js('return document.querySelector(".library-quantity input").value') == '1'
    click('[aria-label="Increase servings for Chicken"]')
    assert js('return document.querySelector(".library-macros").textContent') == '280KCAL50gPROTEIN16gCARBS8gFAT'
    assert js('return document.querySelector(".library-nutrient-details").textContent') == 'Fiber 4gSaturated fat 3gSugars 6gAdded sugars 2g'
    click('.library-row-actions .add-record')
    wait('window.logRequests.length===1 && !document.querySelector(".library-quantity input").disabled')
    saved = js('return window.logRequests[0]')
    assert saved['path'] == '/foods/1/log' and saved['quantity'] == 2 and saved['eaten_on']
    click('[aria-label="Decrease servings for Chicken"]')
    assert js('return document.querySelector(".library-quantity input").value') == '1'
    for invalid in ['', '0', '-1']:
        fill(invalid)
        assert js('return document.querySelector(".add-record").disabled')
        click('.add-record')
        assert js('return window.logRequests.length') == 1
    fill('0.5')
    click('.add-record')
    wait('window.logRequests.length===2 && !document.querySelector(".library-quantity input").disabled')
    assert js('return window.logRequests[1].quantity') == .5
    click('.library-tabs button:nth-child(2)')
    wait('document.querySelector(".meal-row")')
    assert js('return document.querySelector(".library-quantity input").value') == '1'
    fill('2')
    assert js('return document.querySelector(".library-macros").textContent') == '420KCAL75gPROTEIN24gCARBS12gFAT'
    assert js('return document.querySelector(".library-nutrient-details").textContent') == 'Fiber 6gSaturated fat 4.5gSugars 9gAdded sugars 3g'
    click('.add-record')
    wait('window.logRequests.length===3 && !document.querySelector(".library-quantity input").disabled')
    assert js('return window.logRequests[2].path') == '/meals/1/log'
    assert js('return window.logRequests[2].quantity') == 2
    fill('1.5')
    click('.add-record')
    wait('window.logRequests.length===4 && !document.querySelector(".library-quantity input").disabled')
    assert js('return window.logRequests[3].quantity') == 1.5
    click('.library-tabs button:first-child')
    assert js('return document.querySelector(".library-quantity input").value') == '0.5'
    for width in [1280,768,390,320]:
        request(prefix+'/window/rect',{'width':width,'height':1000})
        assert js('return [...document.querySelectorAll(".library-body,.library-row,.library-row-actions,.library-quantity")].every(e=>e.scrollWidth<=e.clientWidth+1)'),width
        if width in [1280,390]:
            with open(f'/tmp/library-quantity-{width}.png','wb') as output:
                output.write(base64.b64decode(request(prefix+'/screenshot')))
    print('PASS: food and meal quantities, fractional servings, nutrient previews, invalid input, independent counts, request dates, desktop/mobile layout')
finally:
    request(prefix, method='DELETE')
