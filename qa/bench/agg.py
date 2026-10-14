import json,statistics as st
R=[json.loads(l) for l in open('out/results.jsonl')]
med=lambda xs:round(st.median(xs),2) if xs else None
print('STARTUP')
for h in 'ab':
  s=[r for r in R if r['kind']=='startup' and r['host']==h]
  print(h,'ok',sum(r['ok'] for r in s),'/',len(s),'mapped',med([r['mapped_s'] for r in s if r['mapped_s']]),'ready',med([r['ready_s'] for r in s if r['ready_s']]),'range',min(r['ready_s'] for r in s),max(r['ready_s'] for r in s))
K=('cpu_pct_one_core','gpu_pct_app','gpu_pct_compositor','cg_nonfile_mib_median','cg_host_only_nonfile_mib_median','gpu_resident_mib_median','pss_mib_median')
for comp,ren in ((False,'gles2'),(True,'gles2'),(False,'pixman')):
  print('\nWORKLOAD companion=%s renderer=%s'%(comp,ren))
  for h in 'ab':
    ws=[r for r in R if r['kind']=='workload' and r['host']==h and r['companion']==comp and r['renderer']==ren]
    print(h,'runs',len(ws),'alive',all(w.get('alive') for w in ws))
    for ph in ('idle','editing','hidden'):
      xs=[w[ph] for w in ws if ph in w]
      if xs: print('  ',ph.ljust(8),{k.replace('_mib_median','').replace('_pct',''):med([x[k] for x in xs if x.get(k) is not None]) for k in K})
    if comp: print('   companion views',[[(v['floating'],v['focused'],v['rect']['width'],v['rect']['height']) for v in (w.get('companion_views') or [])] for w in ws],'main focused',[w.get('main_focused_after_companion') for w in ws])
    else: print('   hidden visible flags',[w.get('hidden_views_visible') for w in ws])
print('\nWAYLAND')
for r in R:
  if r['kind']=='wayland': print(json.dumps({k:v for k,v in r.items() if k not in('t','kind')}))
print('\nSOAK')
for r in R:
  if r['kind']=='soak':
    s=r['nonfile_series_mib']; q=len(s)//4
    print(r['host'],'alive',r['alive'],'cpu',r['cpu_pct_one_core'],'gpu',r['gpu_pct_app'],'nonfile start/min/max/end',s[0],min(s),max(s),s[-1],'host-only',r['cg_host_only_nonfile_mib_median'],'gpuRes',r['gpu_resident_mib_median'],'n',len(s),'Q1 med',st.median(s[:q]),'Q4 med',st.median(s[-q:]))
