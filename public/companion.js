const $=s=>document.querySelector(s);let dot=false;
$('#pet').onclick=()=>$('#compact-list').hidden=!$('#compact-list').hidden;
$('#mode').onclick=()=>{dot=!dot;$('#pet').innerHTML=dot?'<span class="dot-mode"></span>':'<img src="/static/cat.png" width="40" alt="Little cat">';$('#mode').textContent=dot?'Cat mode':'Dot mode';};
$('#open').onclick=()=>{window.open('/#overview','_blank','noopener');};
async function update(){try{const r=await fetch('/api/companion');if(!r.ok)throw Error();const s=await r.json();$('#compact-list').replaceChildren();for(const t of s.next){const b=document.createElement('button');b.textContent=t.title;b.onclick=()=>window.open('/#plan','_blank','noopener');$('#compact-list').append(b);}$('#context-label').textContent=s.settings.observation_enabled?(s.context&&!s.context.stale?`${s.context.workspace} · ${s.context.monitor}`:'Waiting for observer'):'Observation paused';}catch{$('#context-label').textContent='Open Noema to connect.';}}
update();setInterval(()=>{if(!document.hidden)update();},15000);
