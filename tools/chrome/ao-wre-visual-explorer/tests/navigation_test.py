"""DOM-based navigation tests. Runs in headless Chromium with set_content
because some CI containers forbid file:// and loopback navigation."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
fixture=(root/'tests'/'fixtures'/'roadmap.html').read_text()
js=(root/'navigation.js').read_text().replace('export function','function')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-gpu'])
    page=browser.new_page(viewport={'width':1280,'height':800})
    page.set_content(fixture,wait_until='load')
    page.evaluate(js)
    nav=page.evaluate('inspectSideNavigation()')
    assert nav['rootFound'] and len(nav['items'])==9, nav
    assert nav['items'][0]['selected'],nav
    assert not any(x['label']=='Borrar proyecto' for x in nav['items']),nav
    for item in nav['items'][1:]:
        page.evaluate('inspectSideNavigation()')
        assert page.evaluate('([i,label])=>clickSideNavigation(i,label)',[item['index'],item['label']])
        assert page.locator('#title').inner_text()==item['label']
        assert page.url=='about:blank' # Misma URL: navegación tipo SPA.
    page.evaluate('inspectSideNavigation()')
    assert page.evaluate('()=>clickSideNavigation(0,"Identificar Problemas")')
    assert page.locator('#title').inner_text()=='Identificar Problemas'
    assert page.evaluate('window.__danger||0')==0
    print('PASS: nueve pantallas SPA, exclusión de borrado y restauración')

    # Alternativa sin <aside>, sin roles ARIA y sin cursor:pointer: búsqueda por SECCIONES.
    page.set_content('''<style>.layout{display:flex}.navlist{width:260px;height:700px}main{flex:1}.hover-row{padding:14px;height:25px}</style>
       <div class="layout"><div class="navlist"><b>SECCIONES</b>
       <div class="hover-row" onclick="document.querySelector('main').textContent='uno'">Módulo uno</div>
       <div class="hover-row" onclick="document.querySelector('main').textContent='dos'">Módulo dos</div>
       <div class="hover-row" onclick="document.querySelector('main').textContent='tres'">Módulo tres</div>
       </div><main>Original</main></div>''')
    nav=page.evaluate('inspectSideNavigation()')
    assert nav['rootFound'] and [x['label'] for x in nav['items']]==['Módulo uno','Módulo dos','Módulo tres'],nav
    item=nav['items'][1]
    assert page.evaluate('([i,label])=>clickSideNavigation(i,label)',[item['index'],item['label']])
    assert page.locator('main').inner_text()=='dos'
    print('PASS: menú lateral sin etiquetas semánticas')
    browser.close()
