# Surfaces brûlées en PACA (site/data/burned.json), pour le bonus « zone brûlée » de la morille.
# Source : Copernicus EFFIS (cartographie des feux par satellite MODIS / Sentinel-2, dès ~1 ha), service WFS public.
# Garde les feux des deux années passées et de la saison en cours (une morille sort le printemps qui suit un feu).
# Usage : python3 -I tools/burned.py site/data/burned.json   (à relancer de temps en temps, par exemple chaque printemps)
import datetime, json, sys, time, urllib.parse, urllib.request

S, N, W, E = 42.9, 45.3, 4.1, 7.9
URL = 'https://maps.effis.emergency.copernicus.eu/effis?'
year = datetime.date.today().year

def layer(name):
    q = {'SERVICE': 'WFS', 'VERSION': '1.1.0', 'REQUEST': 'GetFeature', 'TYPENAME': name, 'OUTPUTFORMAT': 'geojson', 'BBOX': f'{S},{W},{N},{E},EPSG:4326'}
    for k in range(4):
        try:
            return json.loads(urllib.request.urlopen(URL + urllib.parse.urlencode(q), timeout=180).read())['features']
        except Exception as e:
            print('  nouvel essai :', e, file=sys.stderr); time.sleep(5 * (k + 1))
    raise SystemExit('EFFIS indisponible')

fires, seen = [], set()
for name in [f'modis.ba.poly.{year - 2}', f'modis.ba.poly.{year - 1}', 'modis.ba.poly.season']:
    for f in layer(name):
        p, g = f['properties'], f.get('geometry')
        if p.get('COUNTRY') != 'FR' or not g or p['id'] in seen: continue
        seen.add(p['id'])
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        rings = []
        for poly in polys:   # ~100 m près (la précision du satellite), sans points répétés
            r = []
            for x, y in poly[0]:
                pt = [round(x, 3), round(y, 3)]
                if not r or r[-1] != pt: r.append(pt)
            if len(r) >= 4: rings.append(r)
        if not rings: continue
        xs = [x for r in rings for x, _ in r]; ys = [y for r in rings for _, y in r]
        fires.append({'date': p['FIREDATE'][:10], 'ha': int(float(p.get('AREA_HA') or 0)), 'commune': p.get('COMMUNE'),
                      'bbox': [min(xs), min(ys), max(xs), max(ys)], 'rings': rings})
    print(name, ':', len(fires), 'feux en tout', file=sys.stderr)
fires.sort(key=lambda f: f['date'])
json.dump({'source': 'Copernicus EFFIS (surfaces brûlées, MODIS / Sentinel-2)', 'fetched': datetime.date.today().isoformat(), 'fires': fires},
          open(sys.argv[1], 'w'), ensure_ascii=False, separators=(',', ':'))
