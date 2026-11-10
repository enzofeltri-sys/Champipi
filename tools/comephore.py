# Pluie réelle avant les sorties passées : réanalyse COMEPHORE de Météo-France (radar + pluviomètres, 1 km, horaire,
# Licence Ouverte, publiée avec ~2 mois de retard). Pour chaque sortie : pluie des 30 jours d'avant, au point du coin.
# Sert à revoir après coup les seuils du conseiller (pas à l'alerte du jour). Les archives mensuelles (~230 Mo) sont
# lues en flux : rien n'est gardé sur le disque.
# Usage : python3 -I tools/comephore.py <sorties.json> <résultat.json>
#   sorties.json = [{ "id": ..., "lat": ..., "lon": ..., "date": "AAAA-MM-JJ" }, ...]  (fichier hors du dépôt : coins privés)
import datetime as dt, io, json, math, sys, tarfile, urllib.request
from PIL import Image

URL = 'https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/REANALYSES/COMEPHORE/H_COMEPHORE_{}.tar'
A, F = 6378137.0, 1 / 298.257223563
E = math.sqrt(2 * F - F * F)

def stereo(lat, lon, lat_ts, lon0):
    """Stéréographique polaire nord (ellipsoïde WGS84), latitude de vraie échelle lat_ts."""
    t = lambda p: math.tan(math.pi / 4 - p / 2) / (((1 - E * math.sin(p)) / (1 + E * math.sin(p))) ** (E / 2))
    m = lambda p: math.cos(p) / math.sqrt(1 - (E * math.sin(p)) ** 2)
    pc, p, l = math.radians(lat_ts), math.radians(lat), math.radians(lon - lon0)
    r = A * m(pc) * t(p) / t(pc)
    return r * math.sin(l), -r * math.cos(l)

def georef(im):
    tag = im.tag_v2
    keys = tag[34735]; dbl = tag.get(34736, ())
    geo = {keys[i]: (keys[i + 3] if keys[i + 1] == 0 else dbl[keys[i + 3]]) for i in range(4, len(keys), 4)}
    assert geo.get(3075) == 15, f'projection inattendue {geo}'   # 15 = stéréographique polaire
    sx, sy = tag[33550][:2]; tie = tag[33922]
    return {'x0': tie[3] - tie[0] * sx, 'y0': tie[4] + tie[1] * sy, 'sx': sx, 'sy': sy,
            'lat_ts': geo.get(3081, 45.0), 'lon0': geo.get(3095, geo.get(3080, 0.0))}

def main(src, dst):
    outs = json.load(open(src))
    need = {}   # mois → jours utiles
    for o in outs:
        d = dt.date.fromisoformat(o['date'])
        for k in range(1, 31): day = d - dt.timedelta(days=k); need.setdefault(day.strftime('%Y%m'), set()).add(day)
    rain = {o['id']: {} for o in outs}   # id → jour → mm
    for month in sorted(need):
        days = need[month]; print('mois', month, len(days), 'jours', file=sys.stderr)
        try:
            with urllib.request.urlopen(URL.format(month), timeout=600) as resp, tarfile.open(fileobj=resp, mode='r|') as tar:
                for mem in tar:
                    name = mem.name.rsplit('/', 1)[-1]
                    if not name.endswith('_RR.gtif'): continue
                    end = dt.datetime.strptime(name[:10], '%Y%m%d%H')
                    day = (end - dt.timedelta(hours=1)).date()   # cumul de l'heure qui finit à HH (UTC)
                    if day not in days: continue
                    im = Image.open(io.BytesIO(tar.extractfile(mem).read())); g = georef(im); px = im.load()
                    for o in outs:
                        if not (dt.date.fromisoformat(o['date']) - dt.timedelta(days=30) <= day < dt.date.fromisoformat(o['date'])): continue
                        x, y = stereo(o['lat'], o['lon'], g['lat_ts'], g['lon0'])
                        c, r = int((x - g['x0']) / g['sx']), int((g['y0'] - y) / g['sy'])
                        if not (0 <= c < im.size[0] and 0 <= r < im.size[1]): continue
                        v = px[c, r]
                        if v == 65535: continue
                        rain[o['id']][day.isoformat()] = rain[o['id']].get(day.isoformat(), 0) + v / 10
        except Exception as e:
            print('  mois indisponible :', month, e, file=sys.stderr)
    res = {}
    for o in outs:
        d = dt.date.fromisoformat(o['date'])
        series = [round(rain[o['id']].get((d - dt.timedelta(days=k)).isoformat(), float('nan')), 1) for k in range(1, 31)]   # j−1 … j−30
        if sum(1 for v in series if v == v) < 28: continue
        s = [0 if v != v else v for v in series]
        ago = next((k + 1 for k in range(30) if s[k] >= 15 or (k and s[k] + s[k - 1] >= 20)), None)
        res[o['id']] = {'source': 'COMEPHORE (Météo-France, radar + pluviomètres)', 'rain10': round(sum(s[:10]), 1), 'rain30': round(sum(s), 1),
                        'bigRainAgo': ago, 'daily': series}
    json.dump(res, open(dst, 'w'), ensure_ascii=False)
    print(len(res), 'sorties calculées', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
