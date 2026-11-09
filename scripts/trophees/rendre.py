"""Rend chaque trophée de src/data/trophees.json en WebP transparent (public/trophees/).
Usage : python3 scripts/trophees/rendre.py [id ...]   (depuis la racine du projet)
Nécessite Playwright (Chromium) et Pillow."""
import base64, io, json, sys, threading, functools, http.server, socketserver
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parents[2]
SORTIE = RACINE / 'public' / 'trophees'
L, H = 720, 960  # rendu ; recadré puis réduit à 2× l'affichage

def serveur():
    class Silencieux(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    gest = functools.partial(Silencieux, directory=str(RACINE))
    s = socketserver.TCPServer(('127.0.0.1', 0), gest)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

def main():
    specs = json.loads((RACINE / 'src/data/trophees.json').read_text())
    ids = sys.argv[1:] or list(specs)
    fond = '--fond' in ids
    ids = [i for i in ids if not i.startswith('--')] or list(specs)
    SORTIE.mkdir(parents=True, exist_ok=True)
    manifeste_f = RACINE / 'src' / 'data' / 'trophees-images.json'
    manifeste = json.loads(manifeste_f.read_text()) if manifeste_f.exists() else {}
    s = serveur()
    port = s.server_address[1]
    with sync_playwright() as p:
        nav = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = nav.new_page(viewport={'width': L, 'height': H})
        page.on('console', lambda m: print('  console:', m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: print('  ERREUR:', e))
        for i in ids:
            page.goto(f'http://127.0.0.1:{port}/scripts/trophees/rendu.html?id={i}&l={L}&h={H}' + ('&fond=1' if fond else ''))
            page.wait_for_function('window.__fini', timeout=180000)
            png = base64.b64decode(page.evaluate('window.__fini').split(',')[1])
            im = Image.open(io.BytesIO(png)).convert('RGBA')
            # recadrage sur l'objet (alpha), marge régulière, format 3:4
            boite = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
            if boite:
                x0, y0, x1, y1 = boite
                m = 16
                im = im.crop((max(0, x0 - m), max(0, y0 - m), min(L, x1 + m), min(H, y1 + m)))
            w, h = im.size
            cible_h = 520
            im = im.resize((round(w * cible_h / h), cible_h), Image.LANCZOS)
            nom = SORTIE / f'{i}.webp'
            im.save(nom, 'WEBP', quality=88, method=6)
            if fond:
                im.save(SORTIE.parent.parent / 'scripts' / 'trophees' / f'apercu-{i}.png')
            manifeste[i] = list(im.size)
            print(i, im.size, nom.stat().st_size // 1024, 'Ko')
        nav.close()
    manifeste_f.write_text(json.dumps({k: manifeste[k] for k in specs if k in manifeste}, indent=2) + '\n')
    s.shutdown()

if __name__ == '__main__':
    main()
