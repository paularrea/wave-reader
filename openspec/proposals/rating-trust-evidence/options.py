import json, math, collections, statistics, sys
rows=[r for r in json.load(open(sys.argv[1])) if r['basin']=='atlantic']
PSTEP=[(6,.48),(8,.69),(10,.71)]
def p_step(t):
    for u,f in PSTEP:
        if t<u: return f
    return 1
def p_smooth(t):  # lineal por tramos que pasa por el centro de cada escalón
    pts=[(5,.48),(7,.69),(9,.71),(10,1.0)]
    if t<=pts[0][0]: return pts[0][1]
    for (a,fa),(b,fb) in zip(pts,pts[1:]):
        if t<=b: return fa+(fb-fa)*(t-a)/(b-a)
    return 1
def comp(speed,wdir,off):
    rad=math.radians(wdir-((off+180)%360))
    return speed*max(0,math.cos(rad)), speed*abs(math.sin(rad))
def strong(f,speed): return f*max(0,1-(speed-45)/30) if speed>45 else f
def w_base(r):
    if r['mean'] is None or r['wDir'] is None: return 1
    s=max(r['mean'], (r['gust'] or 0)/1.77)
    if s<7.08: return 1
    on,cr=comp(s,r['wDir'],r['off'])
    return min(1,max(0,strong(1-on/19.28-cr/30.1,s)))
def w_calm(r, calm=10, on0=19.28-7.08, cr0=30.1-7.08):
    # viento medio (sin rachas); nada por debajo de 'calm'; rampa continua desde ahí
    if r['mean'] is None or r['wDir'] is None: return 1
    s=r['mean']; x=max(0,s-calm)
    if x==0: return 1
    on,cr=comp(x,r['wDir'],r['off'])
    return min(1,max(0,strong(1-on/on0-cr/cr0,s)))
def w_gentle(r): return w_calm(r, calm=10, on0=20, cr0=30)   # onshore anula a 30, cruzado a 40 (tipo Wavey)
def stars(r,pf,wf):
    s=r['fE']*pf(r['wPeriod']); return min(round(s+1e-9), round(s*wf(r)+1e-9))
V={
 'Hoy (baseline)':                          lambda r: stars(r,p_step,w_base),
 'A · Viento honesto (media, calma<10, rampa)': lambda r: stars(r,p_step,w_calm),
 'B · A + onshore suave (tipo Wavey)':       lambda r: stars(r,p_step,w_gentle),
 'C · B + periodo continuo':                lambda r: stars(r,p_smooth,w_gentle),
 'F · Solo swell (viento fuera de la nota)': lambda r: round(r['fE']*p_step(r['wPeriod'])+1e-9),
}
by=collections.defaultdict(dict)
for r in rows: by[r['id']][r['h']]=r
def look(a,b):
    return a['dispT']==b['dispT'] and a['dispH'] is not None and b['dispH'] is not None and abs(a['dispH']-b['dispH'])<=1 and \
      ((a['dispW'] is None and b['dispW'] is None) or (a['dispW'] is not None and b['dispW'] is not None and abs(a['dispW']-b['dispW'])<=3))
pairs=[(a,hs[h+1]) for hs in by.values() for h,a in hs.items() if h+1 in hs and look(a,hs[h+1])]
glass=[r for r in rows if r['dispW'] is not None and r['dispW']<5]
def smooth3(fn):
    cache={}
    def g(r):
        hs=by[r['id']]; vals=[fn(hs[h]) for h in (r['h']-1,r['h'],r['h']+1) if h in hs]
        return statistics.median(vals)
    return g
V['D · Hoy + mediana móvil 3 h']=smooth3(V['Hoy (baseline)'])
V['E · C + mediana móvil 3 h']=smooth3(V['C · B + periodo continuo'])
# guardarraíl: mar de 7 limpio (1.4 m @10 s ≈ fE 7), onshore puro a 15 y 25 km/h
def guard(wf, speed):
    r={'mean':speed,'gust':speed*1.77,'wDir':0,'off':180,'fE':7,'wPeriod':10}
    return round(7*wf(r))
print(f"Atlántico: {len(rows)} horas · {len(pairs)} pares visualmente idénticos · {len(glass)} horas 'Glass'\n")
print(f"{'Opción':46} {'saltos≥3':>9} {'Glass penaliz.':>14} {'horas≥5':>8} {'nota media':>10}")
for name,fn in V.items():
    j=sum(abs(fn(a)-fn(b))>=3 for a,b in pairs)/len(pairs)
    gp=sum(fn(r)<V['F · Solo swell (viento fuera de la nota)'](r) for r in glass)/len(glass)
    vals=[fn(r) for r in rows]
    print(f"{name:46} {100*j:8.2f}% {100*gp:13.0f}% {100*sum(v>=5 for v in vals)/len(vals):7.1f}% {statistics.mean(vals):10.2f}")
print("\nGuardarraíl (mar de 7 estrellas limpio, onshore puro, rachas normales):")
for name,wf in [('Hoy',w_base),('A',w_calm),('B/C',w_gentle)]:
    print(f"  {name:4} onshore 2 km/h → {guard(wf,2)}   5 → {guard(wf,5)}   10 → {guard(wf,10)}   15 → {guard(wf,15)}   20 → {guard(wf,20)}   25 → {guard(wf,25)}   30 → {guard(wf,30)}")
