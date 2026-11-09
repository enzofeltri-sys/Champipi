# Carte du sol des forêts (site/data/soil-grid.json) : médiane du niveau trophique des placettes de l'Inventaire forestier IGN
# par case de 0,1° (1 = très acide … 10 = calcaire). Usage : python3 -I tools/soil-grid.py site/data/soil-grid.json
import json, urllib.request, urllib.parse, statistics, sys
S, N, W, E = 42.9, 45.3, 4.1, 7.9   # PACA + bords
pts = []
start = 0
while True:
    p = {'SERVICE':'WFS','VERSION':'2.0.0','REQUEST':'GetFeature','TYPENAMES':'ObsForets.Sols:repartition_niveaux_trophiques_toutes_campagnes',
         'OUTPUTFORMAT':'application/json','COUNT':5000,'STARTINDEX':start,'SRSNAME':'EPSG:4326','BBOX':f'{S},{W},{N},{E},urn:ogc:def:crs:EPSG::4326'}
    j = json.loads(urllib.request.urlopen('https://data.geopf.fr/wfs/ows?' + urllib.parse.urlencode(p), timeout=120).read())
    f = j['features']
    pts += [(x['geometry']['coordinates'][1], x['geometry']['coordinates'][0], x['properties']['troph']) for x in f if x.get('geometry') and x['properties'].get('troph')]
    print('reçus', len(f), 'total', len(pts), file=sys.stderr)
    if len(f) < 5000: break
    start += 5000
cells = {}
for la, lo, t in pts:
    cells.setdefault((int(la * 10 // 1), int(lo * 10 // 1)), []).append(t)
out = {}
for i in range(int(S * 10), int(N * 10) + 1):
    for k in range(int(W * 10), int(E * 10) + 1):
        own = cells.get((i, k), [])
        vals = own if len(own) >= 3 else own + [t for di in (-1, 0, 1) for dk in (-1, 0, 1) if (di or dk) for t in cells.get((i + di, k + dk), [])]
        if len(vals) >= 3: out[f'{i}:{k}'] = round(statistics.median(vals), 1)
json.dump({'source': "IGN, Inventaire forestier : niveau trophique des placettes (1 très acide → 10 calcaire), médiane par case de 0,1°", 'step': 0.1, 'cells': out},
          open(sys.argv[1], 'w'), separators=(',', ':'), ensure_ascii=False)
print('cases', len(out), 'relevés', len(pts))
for name, la, lo in [('Grans', 43.61, 5.06), ('Vernègues', 43.68, 5.15), ('Maures', 43.27, 6.35), ('Estérel', 43.48, 6.85), ('Sainte-Baume', 43.32, 5.75), ('Luberon N', 43.83, 5.35), ('Mercantour', 44.15, 7.2)]:
    print(name, out.get(f'{int(la*10//1)}:{int(lo*10//1)}'))
