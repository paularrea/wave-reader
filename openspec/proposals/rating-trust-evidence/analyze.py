import json, collections, itertools, sys
rows = json.load(open(sys.argv[1]))
def sc(e,p,w): return min(round(e*p+1e-9), round(e*p*w+1e-9))
BOUND = {'atlantic':[6,8,10],'mediterranean':[5,6]}
def same_look(a,b):
    if a['dispT']!=b['dispT']: return False
    if a['dispH'] is None or b['dispH'] is None or abs(a['dispH']-b['dispH'])>1: return False
    if (a['dispW'] is None)!=(b['dispW'] is None): return False
    return a['dispW'] is None or abs(a['dispW']-b['dispW'])<=3
def blame(a,b):
    full=sc(b['fE'],b['fP'],b['fW']); c={}
    c['energía']=abs(full-sc(a['fE'],b['fP'],b['fW']))
    c['periodo']=abs(full-sc(b['fE'],a['fP'],b['fW']))
    c['viento']=abs(full-sc(b['fE'],b['fP'],a['fW']))
    k=max(c,key=c.get)
    tag=k
    if k=='periodo' and any(min(a['wPeriod'],b['wPeriod'])<x<=max(a['wPeriod'],b['wPeriod']) for x in BOUND[a['basin']]): tag='periodo: cruza escalón'
    if k=='viento' and a['eff'] is not None and b['eff'] is not None and min(a['eff'],b['eff'])<7.08<=max(a['eff'],b['eff']): tag='viento: cruza 7 km/h'
    elif k=='viento': tag='viento: pendiente'
    return tag
by=collections.defaultdict(dict)
for r in rows: by[r['id']][r['h']]=r
def report(title,pairs):
    n=len(pairs); d=collections.Counter(min(abs(a['stars']-b['stars']),5) for a,b in pairs)
    big=[(a,b) for a,b in pairs if abs(a['stars']-b['stars'])>=3]
    print(f"\n## {title}: {n} pares")
    print("  |Δ| distribución:", {k:f"{100*v/n:.1f}%" for k,v in sorted(d.items())})
    print(f"  Δ≥2: {100*sum(v for k,v in d.items() if k>=2)/n:.1f}%   Δ≥3: {100*len(big)/n:.2f}% ({len(big)})")
    if big:
        bl=collections.Counter(blame(a,b) for a,b in big)
        print("  causa de Δ≥3:", {k:f"{100*v/len(big):.0f}%" for k,v in bl.most_common()})
    return big
temporal=[]; temporal_look=[]
for sid,hs in by.items():
    for h,a in hs.items():
        b=hs.get(h+1)
        if b: temporal.append((a,b)); 
        if b and same_look(a,b): temporal_look.append((a,b))
report("A. Hora a hora, mismo spot (todos)",temporal)
big=report("B. Hora a hora, mismo spot, pronóstico visualmente IDÉNTICO",temporal_look)
for basin in ['atlantic','mediterranean']:
    report(f"   B·{basin}",[p for p in temporal_look if p[0]['basin']==basin])
# spot-days affected
days=collections.defaultdict(set); aff=set()
for a,b in temporal_look:
    days[a['id']].add(a['h']//24)
    if abs(a['stars']-b['stars'])>=3: aff.add((a['id'],a['h']//24))
tot=sum(len(v) for v in days.values())
print(f"\n  spot-días con al menos un salto ≥3 sin cambio visible: {100*len(aff)/tot:.1f}% ({len(aff)}/{tot})")
print("  ejemplos:")
for a,b in big[:6]:
    print(f"   {a['name'][:28]:28} h{a['h']:>3}→{b['h']}: {a['dispH']/10:.1f}m {a['dispT']}s {a['dispW']}km/h → {b['dispH']/10:.1f}m {b['dispT']}s {b['dispW']}km/h | ★{a['stars']}→{b['stars']} | Tpond {a['wPeriod']:.2f}→{b['wPeriod']:.2f} vientoEf {a['eff']:.1f}→{b['eff']:.1f} ({blame(a,b)})")
# spatial
byh=collections.defaultdict(list)
for r in rows: byh[(r['region'],r['h'])].append(r)
sp=[]
for k,lst in byh.items():
    for a,b in itertools.combinations(lst,2):
        if a['dispH']==b['dispH'] and same_look(a,b) and a['wDir'] is not None and b['wDir'] is not None and abs(((a['wDir']-b['wDir'])+180)%360-180)<=20: sp.append((a,b))
report("C. Misma hora y región, dos spots con pronóstico IDÉNTICO en pantalla",sp)
print("\n## D. Histograma de estrellas (horas puntuadas)")
for basin in ['atlantic','mediterranean']:
    h=collections.Counter(r['stars'] for r in rows if r['basin']==basin); n=sum(h.values())
    print(f"  {basin:13}", " ".join(f"{k}:{100*h[k]/n:.0f}%" for k in range(11)))
