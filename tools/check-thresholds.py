# Contrôle grossier des seuils du conseiller avec les observations publiques (GBIF, dont iNaturalist) sur l'arc
# méditerranéen (Catalogne → Ligurie), par genre, automnes 2021–2025 (morilles : printemps).
# Pour chaque observation : météo du jour (ERA5 via Open-Meteo archive, cases de 0,5°) — pluie 10 et 30 jours,
# bilan pluie − évaporation sur 30 jours, délai depuis la dernière grosse pluie. On compare à tous les jours de la
# même saison dans les mêmes cases (le « fond ») : si un seuil compte, les observations le dépassent plus souvent.
# Limites : observations rares, biais du week-end et de l'effort (on sort quand ça pousse), météo à 25–50 km.
# Usage : python3 -I tools/check-thresholds.py <dossier de travail vide> > rapport.md
import collections, json, math, os, statistics, sys, time, urllib.parse, urllib.request

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
BBOX = dict(decimalLatitude='41,45.5', decimalLongitude='0.5,9.5')
GENERA = {'Boletus': 8287374, 'Cantharellus': 9623860, 'Craterellus': 2521421, 'Lactarius': 2532156, 'Hydnum': 2513763, 'Morchella': 2594601}
DELAY = {'Boletus': (7, 25)}   # même chose que l'appli ; sinon 5–15 j
YEARS = range(2021, 2026)

def get(url, tries=5):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r: return json.loads(r.read())
        except Exception as e:
            print('  nouvel essai', e, file=sys.stderr); time.sleep(5 * (k + 1))
    raise SystemExit('service indisponible : ' + url[:80])

def cached(name, fn):
    p = os.path.join(OUT, name)
    if os.path.exists(p): return json.load(open(p))
    v = fn(); json.dump(v, open(p, 'w')); return v

def occurrences(key, months):
    out, off = [], 0
    while True:
        q = dict(BBOX, taxonKey=key, year='2021,2025', month=months, hasCoordinate='true', limit=300, offset=off)
        d = get('https://api.gbif.org/v1/occurrence/search?' + urllib.parse.urlencode(q))
        for o in d['results']:
            if o.get('eventDate') and o.get('decimalLatitude') is not None and (o.get('coordinateUncertaintyInMeters') or 0) <= 5000:
                out.append({'d': o['eventDate'][:10], 'lat': o['decimalLatitude'], 'lon': o['decimalLongitude']})
        off += 300
        if d['endOfRecords'] or off > 9000: return out

obs = {g: cached(f'obs_{g}.json', lambda g=g, k=k: occurrences(k, '3,6' if g == 'Morchella' else '9,12')) for g, k in GENERA.items()}
cell = lambda lat, lon: (math.floor(lat * 2) / 2 + 0.25, math.floor(lon * 2) / 2 + 0.25)
counts = collections.Counter(cell(o['lat'], o['lon']) for v in obs.values() for o in v)
cells = [c for c, _ in counts.most_common(40)]
print('cases météo :', len(cells), '— observations couvertes :', sum(counts[c] for c in cells), '/', sum(counts.values()), file=sys.stderr)

def weather(c):
    days = {}
    for y in YEARS:
        for a, b in ((f'{y}-02-01', f'{y}-06-30'), (f'{y}-08-01', f'{y}-12-31')):
            q = dict(latitude=c[0], longitude=c[1], start_date=a, end_date=b, timezone='Europe/Paris',
                     daily='precipitation_sum,et0_fao_evapotranspiration')
            d = get('https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(q))['daily']
            for i, t in enumerate(d['time']): days[t] = (d['precipitation_sum'][i] or 0, d['et0_fao_evapotranspiration'][i] or 0)
            time.sleep(0.4)
    return days
W = {c: cached(f'w_{c[0]}_{c[1]}.json', lambda c=c: weather(c)) for c in cells}

def cond(days, day):
    t = time.mktime(time.strptime(day, '%Y-%m-%d'))
    back = [time.strftime('%Y-%m-%d', time.localtime(t - k * 86400)) for k in range(1, 31)]
    if not all(b in days for b in back): return None
    rr = [days[b][0] for b in back]; et = [days[b][1] for b in back]
    ago = next((k + 1 for k in range(30) if rr[k] >= 15 or (rr[k] + (rr[k - 1] if k else 0)) >= 20), None)
    return {'rain10': sum(rr[:10]), 'rain30': sum(rr), 'bal30': sum(rr) - sum(et), 'ago': ago}

def share(xs, f): xs = [x for x in xs if x]; return 100 * sum(1 for x in xs if f(x)) / max(len(xs), 1)
print('# Contrôle des seuils avec les observations publiques\n')
print('Observations GBIF (dont iNaturalist), arc méditerranéen 41–45,5° N / 0,5–9,5° E, 2021–2025 ; météo ERA5 (Open-Meteo), cases de 0,5°.')
print('« Fond » = tous les jours de la même saison dans les mêmes cases. Un seuil utile est franchi **plus souvent** les jours d\'observation.\n')
print('| Genre | Obs. | Bilan 30 j ≥ 0 (obs / fond) | Bilan ≤ −60 | Pluie 10 j ≥ 20 mm | Grosse pluie dans la fenêtre | Délai médian |')
print('|---|---|---|---|---|---|---|')
for g, v in obs.items():
    months = (3, 4, 5, 6) if g == 'Morchella' else (9, 10, 11, 12)
    oc = [cond(W[cell(o['lat'], o['lon'])], o['d']) for o in v if cell(o['lat'], o['lon']) in W]
    bg = [cond(W[c], d) for c in cells for d in W[c] if int(d[5:7]) in months and int(d[:4]) in YEARS]
    lo, hi = DELAY.get(g, (5, 15))
    row = [share(oc, lambda x: x['bal30'] >= 0), share(bg, lambda x: x['bal30'] >= 0),
           share(oc, lambda x: x['bal30'] <= -60), share(bg, lambda x: x['bal30'] <= -60),
           share(oc, lambda x: x['rain10'] >= 20), share(bg, lambda x: x['rain10'] >= 20),
           share(oc, lambda x: x['ago'] and lo <= x['ago'] <= hi), share(bg, lambda x: x['ago'] and lo <= x['ago'] <= hi)]
    agos = [x['ago'] for x in oc if x and x['ago']]
    n = len([x for x in oc if x])
    print(f"| {g} | {n} | {row[0]:.0f} % / {row[1]:.0f} % | {row[2]:.0f} % / {row[3]:.0f} % | {row[4]:.0f} % / {row[5]:.0f} % | {row[6]:.0f} % / {row[7]:.0f} % ({lo}–{hi} j) | {statistics.median(agos) if agos else '–'} j |")
    hist = collections.Counter(min(a // 5 * 5, 30) for a in agos)
    print(f"|  | délais (j) | " + ' · '.join(f'{k}–{k + 4}: {hist[k]}' for k in range(0, 31, 5)) + ' | | | | |', file=sys.stderr)
