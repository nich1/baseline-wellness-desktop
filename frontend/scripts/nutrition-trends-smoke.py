"""Read-only browser fixtures for weekly nutrition. Start chromedriver on :9515."""
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


def click(selector):
    js('document.querySelector(arguments[0]).click()', selector)


try:
    request(prefix + '/goog/cdp/execute', {'cmd': 'Page.addScriptToEvaluateOnNewDocument', 'params': {'source': """
      const RealDate=Date;
      window.Date=class extends RealDate { constructor(...args) { super(...(args.length?args:['2026-10-08T17:00:00Z'])); } static now(){return new RealDate('2026-10-08T17:00:00Z').getTime();} };
      window.historyRequests=[]; window.failHistory=false;
      const realFetch=window.fetch;
      window.fetch=async(url,options={})=>{
        if(!String(url).startsWith('http://localhost:8000'))return realFetch(url,options);
        if(options.method && options.method!=='GET')throw new Error('Unexpected write');
        const u=new URL(url); let result=[];
        if(u.pathname==='/targets')result={calories:2200,protein:160,carbohydrates:250,fat:75,fiber:30,saturated_fat:20,sugars:65,added_sugars:30};
        if(u.pathname==='/target-history'){
          const start=u.searchParams.get('start_date'),end=u.searchParams.get('end_date');window.historyRequests.push([start,end]);
          if(window.failHistory)return new Response(JSON.stringify({detail:'History unavailable'}),{status:500});
          for(let date=start;date<=end;){
            const entries=date==='2026-10-05'?2:date==='2026-10-07'?3:date==='2026-10-08'?1:start==='2026-09-28'?7:0;
            const calories=date==='2026-10-05'?2000:date==='2026-10-07'?2200:start==='2026-09-28'?1995:0;
            result.push({date,entries,nutrients:{calories,protein:date==='2026-10-05'?150:date==='2026-10-07'?180:start==='2026-09-28'?175.5:0,carbohydrates:entries?180:0,fat:entries?60:0,fiber:entries?24:0,saturated_fat:entries?12:0,sugars:entries?32:0,added_sugars:entries?8:0}});
            const next=new RealDate(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);
          }
        }
        return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
      };
    """}})
    request(prefix+'/url',{'url':'http://localhost:3000/trends/nutrition'})
    wait('document.querySelector(".nutrition-history-table")')
    assert js('return document.querySelector(`.analysis-nav [aria-current="page"]`).textContent')=='Nutrition'
    assert js('return document.querySelector(".trend-stat-grid article strong").textContent')=='1,400KCAL/DAY'
    assert js('return document.querySelectorAll(".trend-stat-grid article strong")[1].textContent')=='110G/DAY'
    assert js('return document.querySelector(".nutrition-week-heading").textContent.includes("3 of 4 days so far logged")')
    assert js('return document.querySelectorAll("tbody tr").length')==7
    assert js('return document.querySelectorAll(`tr[data-status="future"]`).length')==3
    assert js('return document.querySelectorAll(`tr[data-status="missing"]`).length')==1
    assert js('return document.querySelector("tr.is-today td").textContent')=='0'
    assert js('return document.querySelector(`[aria-label="Next nutrition week"]`).disabled')
    js('document.querySelectorAll(".nutrition-chart-day")[7].focus()')
    assert js('return document.querySelectorAll(".nutrition-chart-readout")[1].textContent.includes("Protein: 150 g")')
    js("""const el=document.querySelector('[aria-label="Nutrient to chart"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'added_sugars');el.dispatchEvent(new Event('change',{bubbles:true}));""")
    assert js('return document.querySelector(".nutrition-detail-panel .nutrition-week-chart").getAttribute("aria-label")').startswith('Added sugars')
    for width in [1920,1440,1280,900,768,390,320]:
        request(prefix+'/window/rect',{'width':width,'height':1100})
        time.sleep(.2)
        assert js('return document.documentElement.scrollWidth<=innerWidth'),width
        assert js('return [...document.querySelectorAll(".nutrition-week-controls,.nutrition-chart-legend,.nutrition-chart-readout,.trend-stat-grid article")].every(e=>e.scrollWidth<=e.clientWidth+1)'),width
        if width>=900:
            assert js('const panels=[...document.querySelectorAll(".nutrition-chart-grid .chart-panel")].map(e=>e.getBoundingClientRect());return Math.abs(panels[0].top-panels[1].top)<1 && Math.abs(panels[0].height-panels[1].height)<1'),width
        if width>=1440:
            assert js('const top=[...document.querySelectorAll(".nutrition-chart-grid > section")].map(e=>e.getBoundingClientRect()), bottom=[...document.querySelectorAll(".nutrition-detail-grid > section")].map(e=>e.getBoundingClientRect());return top.every((r,i)=>Math.abs(r.left-bottom[i].left)<1 && Math.abs(r.width-bottom[i].width)<1)'),width
        if width in [1920,390]:
            metrics=request(prefix+'/goog/cdp/execute',{'cmd':'Page.getLayoutMetrics','params':{}})['cssContentSize']
            screenshot=request(prefix+'/goog/cdp/execute',{'cmd':'Page.captureScreenshot','params':{'captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':metrics['width'],'height':metrics['height'],'scale':1}}})['data']
            with open(f'/tmp/nutrition-trends-{width}.png','wb') as output:output.write(base64.b64decode(screenshot))
    click('[aria-label="Previous nutrition week"]')
    wait('document.querySelector(".nutrition-history-table") && document.querySelector(".trend-stat-grid article strong").textContent==="1,995KCAL/DAY"')
    assert js('return window.historyRequests.at(-1)')==['2026-09-28','2026-10-04']
    assert js('return document.querySelectorAll(`tr[data-status="logged"]`).length')==7
    click('[aria-label="Previous nutrition week"]')
    wait('document.querySelector(".nutrition-empty")')
    assert js('return document.querySelector(".trend-stat-grid article strong").textContent')=='—KCAL/DAY'
    js('window.failHistory=true')
    click('[aria-label="Previous nutrition week"]')
    wait('document.querySelector(".nutrition-error")')
    assert not js('return !!document.querySelector(".nutrition-history-table")')
    js('window.failHistory=false')
    click('.nutrition-error button')
    wait('document.querySelector(".nutrition-empty")')
    click('.nutrition-this-week')
    wait('document.querySelector(".nutrition-history-table") && document.querySelector(".trend-stat-grid article strong").textContent==="1,400KCAL/DAY"')
    assert js('return document.querySelector("#nutrition-week").value')=='2026-10-05'
    print('PASS: navigation, averages, zero/missing/future days, chart interaction, nutrient switching, week navigation, empty/error/retry states, seven responsive widths, aligned charts')
finally:
    request(prefix,method='DELETE')
