# Carte du sol des forêts (site/data/soil-grid.json), en cases de 0,01° (~1 km), pour la carte « bon moment ».
# Pour chaque case :
#   1. au moins 3 relevés de l'Inventaire forestier IGN à moins de 2,5 km → médiane du niveau trophique (1 très acide … 10 calcaire) ;
#   2. sinon le sol dominant de la carte des sols INRAE / Gis Sol (1/250 000), classé comme dans l'appli (site/js/here.js, soilKind) ;
#   3. sinon les relevés jusqu'à 6 km (au moins 3) ;
#   4. sinon inconnu (la carte ne filtre pas).
# Codage : une lettre par case, rangées du sud au nord : a = acide, c = calcaire, n = neutre / mixte, . = inconnu.
# Usage : python3 -I tools/soil-grid.py site/data/soil-grid.json
import json, math, re, statistics, sys, time, unicodedata, urllib.parse, urllib.request
from PIL import Image, ImageDraw

S, N, W, E, STEP = 42.9, 45.3, 4.1, 7.9, 0.01
ROWS, COLS = round((N - S) / STEP), round((E - W) / STEP)
WFS = 'https://data.geopf.fr/wfs/ows?'

def get(params, tries=4):
    for k in range(tries):
        try:
            return json.loads(urllib.request.urlopen(WFS + urllib.parse.urlencode(params), timeout=180).read())
        except Exception as e:
            print('  nouvel essai :', e, file=sys.stderr); time.sleep(3 * (k + 1))
    raise SystemExit('service IGN indisponible')

def paged(typename, bbox, props=None):
    out, start = [], 0
    while True:
        p = {'SERVICE': 'WFS', 'VERSION': '2.0.0', 'REQUEST': 'GetFeature', 'TYPENAMES': typename, 'OUTPUTFORMAT': 'application/json',
             'COUNT': 5000, 'STARTINDEX': start, 'SRSNAME': 'EPSG:4326', 'BBOX': f'{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]},urn:ogc:def:crs:EPSG::4326'}
        if props: p['PROPERTYNAME'] = props
        f = get(p)['features']; out += f
        if len(f) < 5000: return out
        start += 5000

# --- 1. Relevés de l'Inventaire forestier
pts = [(x['geometry']['coordinates'][1], x['geometry']['coordinates'][0], x['properties']['troph'])
       for x in paged('ObsForets.Sols:repartition_niveaux_trophiques_toutes_campagnes', (S, W, N, E))
       if x.get('geometry') and x['properties'].get('troph')]
print('relevés IFN :', len(pts), file=sys.stderr)
BIN = 0.05
bins = {}
for la, lo, t in pts: bins.setdefault((int(la // BIN), int(lo // BIN)), []).append((la, lo, t))
def near(la, lo, km):
    r = math.ceil(km / (BIN * 80)) + 1
    bi, bj = int(la // BIN), int(lo // BIN); c = math.cos(math.radians(la))
    return [t for di in range(-r, r + 1) for dj in range(-r, r + 1) for (a, b, t) in bins.get((bi + di, bj + dj), ())
            if math.hypot((a - la) * 111.2, (b - lo) * 111.2 * c) <= km]
def cls(v): return 'a' if v <= 5 else 'c' if v >= 8 else 'n'

# --- 2. Carte des sols INRAE, découpée en tuiles de 0,5° (une zone à cheval sur deux tuiles n'est gardée qu'une fois)
def fix(s): return re.sub(r'\s+', ' ', (s or '').replace('\x92', '’')).strip()
def soil_kind(p):
    s = fix(p.get('nom_sol_dominant')).upper(); d = fix(p.get('nom_ucs')).lower()
    if re.search(r'RENDOSOL|RENDISOL|CALCOSOL|CALCISOL|DOLOMITOSOL', s): return 'c'
    if re.search(r'RANKOSOL|PODZOSOL|ALOCRISOL|VERACRISOL', s): return 'a'
    calc = re.search(r'calcaire|calcarénite|marno|marne|dolo?mi|dolimi|gypse|travertin|molasse calcaire', d)
    sil = re.search(r'cristallin|granit|gneiss|schiste|micaschiste|phyllade|quartzite|rhyolit|grès|siliceu|acide|maures|estérel|tanneron', d)
    if calc and not sil: return 'c'
    if sil and not calc: return 'a'
    return 'n'
img = Image.new('L', (COLS, ROWS), 0)
draw = ImageDraw.Draw(img)
code = {'a': 1, 'c': 2, 'n': 3}
seen = set(); npoly = 0
la = S
while la < N:
    lo = W
    while lo < E:
        for f in paged('INRAE_CARTE-SOLS:sols_dominants_france_metropolitaine', (la, lo, min(la + .5, N), min(lo + .5, E)), 'nom_sol_dominant,nom_ucs,the_geom_l93'):
            if f['id'] in seen or not f.get('geometry'): continue
            seen.add(f['id']); npoly += 1
            k = code[soil_kind(f['properties'])]
            polys = f['geometry']['coordinates'] if f['geometry']['type'] == 'MultiPolygon' else [f['geometry']['coordinates']]
            for poly in polys:
                xy = [((x - W) / STEP, (N - y) / STEP) for x, y in poly[0]]   # image : y vers le bas (nord en haut)
                if len(xy) > 2: draw.polygon(xy, fill=k)
                for hole in poly[1:]:
                    h = [((x - W) / STEP, (N - y) / STEP) for x, y in hole]
                    if len(h) > 2: draw.polygon(h, fill=0)
        lo += .5
    la += .5
    print('  INRAE jusqu’à', round(la, 1), '° N :', npoly, 'zones', file=sys.stderr)
inrae = img.load()

# --- 3. Fusion, case par case
rows, stats, agree = [], {'ifn': 0, 'inrae': 0, 'ifn6': 0, 'inconnu': 0}, [0, 0]
back = {1: 'a', 2: 'c', 3: 'n'}
for i in range(ROWS):           # du sud au nord
    lat = S + (i + .5) * STEP
    line = []
    for j in range(COLS):
        lon = W + (j + .5) * STEP
        v = inrae[j, ROWS - 1 - i]
        ink = back.get(v)
        loc = near(lat, lon, 2.5)
        if len(loc) >= 3:
            ch = cls(statistics.median(loc)); stats['ifn'] += 1
            if ink in ('a', 'c') and ch in ('a', 'c'): agree[0] += ink == ch; agree[1] += 1
        elif ink in ('a', 'c'):
            ch = ink; stats['inrae'] += 1
        else:
            far = near(lat, lon, 6)
            if len(far) >= 3: ch = cls(statistics.median(far)); stats['ifn6'] += 1
            elif ink == 'n': ch = 'n'; stats['inrae'] += 1
            else: ch = '.'; stats['inconnu'] += 1
        line.append(ch)
    rows.append(''.join(line))
json.dump({'v': 2, 'step': STEP, 'south': S, 'west': W, 'rows': ROWS, 'cols': COLS,
           'source': "IGN, Inventaire forestier (niveau trophique des placettes) et INRAE / Gis Sol (carte des sols au 1/250 000) — cases de 0,01°",
           'legend': {'a': 'acide', 'c': 'calcaire', 'n': 'neutre ou mixte', '.': 'inconnu'},
           'data': ''.join(rows)}, open(sys.argv[1], 'w'), ensure_ascii=False, separators=(',', ':'))
print('cases :', stats, '| accord IFN / INRAE là où les deux tranchent :', f'{agree[0]}/{agree[1]}' + (f' ({100*agree[0]//max(agree[1],1)} %)'), file=sys.stderr)
