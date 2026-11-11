import os,sys,time,threading,http.server,socketserver,tempfile,zipfile,json,glob,traceback
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

extension = '/mnt/data/ao-wre-visual-explorer'
fixtures='/mnt/data/ao-wre-visual-fixture'
profile=tempfile.mkdtemp(prefix='ao-vex-chrome-')
downloads=tempfile.mkdtemp(prefix='ao-vex-downloads-')
os.chdir(fixtures)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
class Server(socketserver.ThreadingMixIn,http.server.HTTPServer): daemon_threads=True
srv=Server(('127.0.0.1',0),Handler);port=srv.server_port
threading.Thread(target=srv.serve_forever,daemon=True).start()
print('FIXTURE_PORT',port,flush=True)
with sync_playwright() as p:
 context=p.chromium.launch_persistent_context(profile, executable_path='/usr/bin/chromium',headless=False,viewport={'width':1280,'height':760},args=[f'--disable-extensions-except={extension}',f'--load-extension={extension}','--no-sandbox','--disable-gpu','--window-size=1450,950','--disable-popup-blocking'])
 try:
  context.set_default_timeout(10000)
  page=context.pages[0] if context.pages else context.new_page()
  page.goto(f'http://127.0.0.1:{port}/index.html', wait_until='load')
  page.wait_for_timeout(1400)
  workers=context.service_workers
  print('WORKERS',[w.url for w in workers],flush=True)
  if not workers:
   workers=[context.wait_for_event('serviceworker',timeout=10000)]
  ext_id=workers[0].url.split('/')[2]
  # Teclado simula clic en icono usando el atajo declarado en manifest.
  page.keyboard.press('Control+Shift+Y')
  try:
   visual=context.wait_for_event('page',timeout=10000)
   print('ACTION OPENED',visual.url,flush=True)
  except Exception as ex:
   print('ACTION shortcut failed, diagnostic:',ex,flush=True)
   # UI directa no concede activeTab, pero permite verificar carga y scripts.
   visual=context.new_page()
   visual.goto(f'chrome-extension://{ext_id}/visual.html?tabId=1&windowId=1')
  visual.wait_for_load_state('domcontentloaded')
  visual.screenshot(path='/mnt/data/ao-wre-visual-explorer/tests/ui.png')
  print('UI_ORIGIN',visual.locator('#origin').inner_text(),flush=True)
  visual.locator('#mode').select_option('site')
  visual.locator('#maxPages').select_option('3')
  visual.locator('#maxTiles').select_option('30')
  # verify via UI; Chrome prompts permission by interaction
  visual.locator('#start').click()
  for i in range(45):
   visual.wait_for_timeout(1000)
   status=visual.locator('#message').inner_text()
   if i%5==0:print('STATUS',i,status,flush=True)
   if visual.locator('#start').is_enabled() and ('descarga' in status.lower() or 'error' in status.lower() or 'permiso' in status.lower()):break
  print('FINAL_STATUS',visual.locator('#message').inner_text(),flush=True)
  print('FINAL_LOG',visual.locator('#log').inner_text()[-2800:],flush=True)
  print('FINAL_RESULT',visual.locator('#result').inner_text() if visual.locator('#result').is_visible() else '-',flush=True)
  # check downloads events on browser and files if any
  print('DOWNLOADS',glob.glob(profile+'/Default/Downloads/*')+glob.glob(downloads+'/*'),flush=True)
 finally:
  context.close()
  srv.shutdown()
