/* Noema: no frontend framework, background model, analytics, CDN or network fonts. */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
let state = null, online = false, currentPage = '', selectedFolder = '', searchTerm = '', timeBudget = '', taskFilter = 'open';
let draft = {id:uid(), raw:'', task_id:'', files:[]}, recording = null, recordChunks = [], recordStarted = 0, recordTimer = null;
let toastTimer, draftTimer, refreshTimer, noteCache = null, noteTab = 'organized', noteEditing = false;
let rendering = 0, flushing = false, dbPromise, previewURLs = [], notified = new Set();
let localSaveState = 'memory', captureSaving = false, draftWrites = Promise.resolve(), draftWriteVersion = 0;
let taskDraft = {id:uid(), raw:'', fields:{}, pending:null}, taskWrites = Promise.resolve(), taskSaving = false, taskSaveState = 'memory';

function toast(message, action=null) {
  $('#toast').innerHTML=h(message)+(action?` <button class="text-button" data-action="edit-task" data-id="${h(action)}">Edit</button>`:''); $('#toast').classList.toggle('with-action',!!action); $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5500);
}
function age(stamp) {
  const seconds = Math.max(0, (Date.now() - Date.parse(stamp))/1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`;
  return new Date(stamp).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function dateLabel(stamp) { return stamp ? new Date(stamp).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : ''; }
function localDateInput(stamp) { if(!stamp)return ''; const d=new Date(stamp);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
function fromLocal(value) { return value ? new Date(value).toISOString() : null; }
function sessionLink(url,label='Open session') {return /^https?:\/\//.test(url||'')?`<a class="text-button" href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(label)} ↗</a>`:'';}
function busy(button, value=true) { if(button)button.disabled=value; }

function database() {
  if (!dbPromise) dbPromise = new Promise((resolve,reject) => {
    const req = indexedDB.open('noema-local-v1',1);
    req.onupgradeneeded=()=> {req.result.createObjectStore('kv'); req.result.createObjectStore('outbox',{keyPath:'id'});};
    req.onsuccess=()=>{
      const db=req.result;
      db.onversionchange=()=>{db.close();dbPromise=undefined;};
      resolve(db);
    };
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('Close other Noema tabs and retry the local save.'));
  }).catch(error=>{dbPromise=undefined;throw error;});
  return dbPromise;
}
async function localOp(store,method,key,value) {
  return localTransaction(store,method==='get'||method==='getAll'?'readonly':'readwrite',tx=>{
    const table=tx.objectStore(store);
    if(method==='put')return key===undefined?table.put(value):table.put(value,key);
    return key===undefined?table[method]():table[method](key);
  });
}
async function localTransaction(stores,mode,operation) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);
    let result;
    tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('Local save failed'));
    try {const request=operation(tx);if(request)request.onsuccess=()=>result=request.result;}
    catch(error){tx.abort();reject(error);}
  });
}
function serializeDraftWrite(operation){
  const next=draftWrites.catch(()=>{}).then(operation);draftWrites=next;return next;
}
function draftStatus(){
  if(!$('#draft-status'))return;
  $('#draft-status').textContent=localSaveState==='saved'?'Draft on this device · not uploaded':localSaveState==='error'?'Local save failed · keep this page open':localSaveState==='pending'?'Saving draft on this device…':'Draft in this tab · not uploaded';
  if($('#local-save-error'))$('#local-save-error').hidden=localSaveState!=='error';
}
async function persistDraft() {
  if (currentPage==='capture' && $('#brain-dump')) draft.raw=$('#brain-dump').value;
  const version=++draftWriteVersion, snapshot=structuredClone(draft);localSaveState='pending';draftStatus();
  try {await serializeDraftWrite(()=>localOp('kv','put','draft',snapshot));if(version===draftWriteVersion){localSaveState='saved';draftStatus();}}
  catch {if(version===draftWriteVersion){localSaveState='error';draftStatus();toast('Local save failed. Keep this page open and retry; this draft has not been uploaded.');}}
}
async function api(path,options={}) {
  const headers={'X-Noema-Request':'1',...(options.headers||{})};
  if(options.body && !(options.body instanceof FormData))headers['Content-Type']='application/json';
  let response;
  try {response=await fetch('/api'+path,{...options,headers,credentials:'same-origin'});}
  catch {online=false; connection(); throw new Error('Server unreachable. Your saved captures remain queued on this device.');}
  let result;
  try {result=await response.json();}catch {result={};}
  if(!response.ok){const err=new Error(typeof result.detail==='string'?result.detail:JSON.stringify(result.detail||`Request failed (${response.status})`));err.status=response.status;throw err;}
  return result;
}
async function login(token='') { return api('/session',{method:'POST',body:JSON.stringify({token})}); }
async function refresh(repaint=true) {
  try {
    state=await api('/state'+(timeBudget?`?minutes=${encodeURIComponent(timeBudget)}`:''));online=true;
    await localOp('kv','put','snapshot',state).catch(()=>{});
    connection(); updateCompanion();
    if(repaint && ['overview','plan'].includes(currentPage) && !$('#modal').open)render();
    for(const reminder of state.reminders.filter(r=>r.state==='due')){
      if(!notified.has(reminder.id)){
        notified.add(reminder.id);
        if(localStorage.getItem('noema-notifications')==='1' && 'Notification' in window && Notification.permission==='granted'){
          const task=state.tasks.find(t=>t.id===reminder.task_id);
          try {new Notification('Noema reminder',{body:task?.title||'A task needs your attention.',tag:reminder.id,icon:'/static/icon.svg'});}catch{}
        }
      }
    }
  }catch(error){online=false;connection();if(error.status===401)showLogin();else if(repaint&&currentPage==='overview'&&!$('#modal').open)render();}
}
function connection() {
  $('#connection-label').textContent=online?'Server connected':'Offline · local drafts';
  $('.local-label .status-dot').classList.toggle('paused',!online);
  $('#status-summary').textContent=!online?'Status unavailable':!state?.tasks.length?(state?.notes.length?state.notes.length+' learning note'+(state.notes.length===1?'':'s'):'Nothing tracked yet'):`${state.attention.length} need you · ${state.runs.filter(r=>r.effective_status==='working').length} reported running`;
}
function updateCompanion(){
  const pref=state?.settings?.companion||'cat', b=$('#companion-launch'); b.hidden=pref==='hidden';
  b.innerHTML=pref==='dot'?'<span class="status-dot"></span>':'<img src="/static/cat.png" alt="" width="36" height="34">';
  b.style.setProperty('--companion-size',Math.min(40,Math.max(24,state?.settings?.companion_size||40))+'px');
  b.title='Companion controls · browser preview · '+observationStatus(state);
  drawAmbient();
}
async function flushOutbox() {
  if(flushing||!online)return;flushing=true;
  try {
    const items=await localOp('outbox','getAll');
    for(const item of items){
      if(item.error)continue;
      const form=new FormData();
      form.set('payload',JSON.stringify({capture_id:item.id,raw:item.raw,project:'',task_id:item.task_id||null,organize:true}));
      for(const file of item.files)form.append('attachments',file.blob,file.name);
      try {
        const note=await api('/captures',{method:'POST',body:form});
        await localOp('outbox','delete',item.id);
        if(items.length===1)toast(`Saved to ${note.folder}. ${note.processing?'Processing queued.':'Original preserved.'}`);
      } catch(error){
        if(error.status && error.status!==401 && error.status<500){item.error=error.message;await localOp('outbox','put',undefined,item);}
        break;
      }
    }
    await refresh(false);await queueIndicator();
  }catch {localSaveState='error';draftStatus();toast('Cannot read the local capture queue. Keep this page open and retry the local save.');}
  finally {flushing=false;}
}
async function queueIndicator(){
  const items=await localOp('outbox','getAll').catch(()=>[]);
  if(items.length)$('#status-summary').innerHTML=`<button class="text-button" data-action="outbox">${items.length} capture${items.length===1?'':'s'} on this device</button>`;
}
function offlineNotice(){return !online?`<div class="offline-banner">Server disconnected. ${state?.server_time?'Showing the last server snapshot; agent status may be outdated.':'Current work and integration status are unavailable.'} ${localSaveState==='error'?'Local save failed; keep unsaved work open.':'Capture can save on this device when local storage is available.'}</div>`:'';}
function header(title,sub='',action=''){return `<div class="page-heading"><div><h1>${h(title)}</h1>${sub?`<p>${h(sub)}</p>`:''}</div>${action}</div>`;}
function taskRow(task,kind='normal') {
  const stateText=(task.status==='done'?'Completed':task.attention_reason||task.next_action||task.project)+(task.planned_on?' · Planned '+task.planned_on:'');
  return `<div class="task-row" data-task="${h(task.id)}"><button class="check ${task.status==='done'?'done':''}" data-action="complete" data-id="${h(task.id)}" aria-label="${task.status==='done'?'Reopen':'Complete'} ${h(task.title)}">${task.status==='done'?'✓':''}</button><div class="task-content"><button class="task-title" data-action="task" data-id="${h(task.id)}">${h(task.title)}</button><div class="task-sub">${h(stateText)}</div></div><div class="row-end"><button class="pill ${h(task.effective_priority)}" data-action="priority" data-id="${h(task.id)}" title="${h(task.priority_reason)}">${h(task.effective_priority)}${task.priority_source==='automatic'?' · auto':''}</button></div></div>`;
}
// NOW_STATE_START: pure presentation of the existing server snapshot.
function focusKind(focus) {
  return focus?.pinned ? 'Pinned by you' : focus?.source === 'context' ? 'Inferred from window metadata' : 'Selected by you';
}
function observationStatus(snapshot) {
  if (!snapshot?.settings?.observation_enabled) return 'Observation paused';
  return snapshot.context && !snapshot.context.stale ? 'Recent window metadata report' : 'Allowed · no recent observer report';
}
function nowState(snapshot, connected, budget='') {
  const tasks=snapshot?.tasks||[], runs=snapshot?.runs||[], notes=snapshot?.notes||[];
  const open=tasks.filter(t=>t.status!=='done'), attention=snapshot?.attention||[], available=snapshot?.available||[];
  const focus=tasks.find(t=>t.id===snapshot?.focus?.task_id);
  const active=runs.filter(r=>r.effective_status==='working');
  const unknown=runs.filter(r=>r.effective_status==='unknown'||r.stale);
  const questions=runs.filter(r=>r.effective_status==='needs_input');
  const waiting=open.filter(t=>!attention.some(a=>a.id===t.id)&&(t.blocked_by?.length || ['waiting','blocked'].includes(t.status) || t.runs?.some(r=>['working','needs_input','unknown'].includes(r.effective_status))));
  const integration=!connected ? 'Integration status unavailable · server disconnected' : unknown.length ? 'Agent status unknown · '+unknown.length+' stale report'+(unknown.length===1?'':'s') : active.length||questions.length ? active.length+' running · '+questions.length+' awaiting input · recently reported' : 'Integration connection status unknown · no active runs reported';
  const actionableFocus=focus && ['todo','active','review'].includes(focus.status) && !focus.blocked_by?.length &&
    (!focus.not_before||focus.not_before<=snapshot.server_time) &&
    !focus.runs?.some(r=>['working','needs_input','unknown','failed'].includes(r.effective_status)) &&
    (!budget || (focus.estimate_minutes!=null && focus.estimate_minutes<=Number(budget)));
  let primary=attention[0]||available[0]||(actionableFocus?focus:null);
  let kind=attention.some(t=>t.id===primary?.id)?'attention':primary?.id===focus?.id?'focus':'available';
  let mode='idle', title='Nothing actionable right now', explanation='Some tracked work is scheduled, parked or not available yet. Plan keeps those items visible.';
  if (!connected) {mode='disconnected';title='Current status unavailable';explanation='The server is disconnected. Cached work and integration reports may be out of date. You can still capture locally.';primary=null;}
  else if (!tasks.length && !runs.length) {mode=notes.length?'notes-only':'new';title=notes.length?'No tasks tracked yet':'Nothing tracked yet';explanation=notes.length?'Your learning notes stay separate from tasks. Add a task only when you intend to do something.':'Capture something you are learning, or add a task you intend to do. Notes do not become to-dos automatically.';}
  else if (attention.length) {mode=attention.every(t=>t.runs?.some(r=>r.effective_status==='unknown')&&t.status!=='review'&&!t.reminders?.some(r=>r.state==='due')&&!t.runs.some(r=>r.effective_status==='needs_input'||['review','failed'].includes(r.status)))?'unknown':'attention';title=mode==='unknown'?'Agent status needs checking':'Your attention is needed';explanation=attention[0].attention_reason;}
  else if (tasks.length && tasks.every(t=>t.status==='done') && !active.length && !questions.length && !unknown.length) {mode='complete';title='All tracked work is complete';explanation='Every tracked task is marked done. Your learning notes remain available; there is no need to add more work.';primary=null;}
  else if (primary) {mode='available';title='Available work';explanation=primary.recommendation_reason||'Continue your selected focus.';}
  else if (unknown.length) {mode='unknown';title='Agent status needs checking';explanation='A previous run has stopped reporting. No current activity or completion can be confirmed.';}
  else if (waiting.length) {mode='waiting';title='Work is waiting';explanation='Tracked work is waiting on an agent, unresolved dependencies or an explicit waiting state.';}
  else if (budget) {mode='filtered';title='No work matches this time filter';explanation='Only saved estimates are used. Tasks without an estimate are excluded; no duration is invented.';}
  const alternatives=connected?[...attention,...available].filter((t,i,a)=>t.id!==primary?.id && a.findIndex(x=>x.id===t.id)===i):[];
  return {mode,title,explanation,primary,kind,alternatives,focus,active,unknown,questions,waiting,integration,open};
}
// NOW_STATE_END

function overview() {
  const n=nowState(state,online,timeBudget), primary=n.primary;
  const focus=n.focus;
  let html='<div class="now-page" data-now-state="'+n.mode+'">'+offlineNotice()+header('What can I do now?','Your work, without keeping it all in your head.');
  if(focus) html+='<div class="focus-line"><span class="status-dot"></span><span class="focus-label">CURRENT FOCUS</span><div class="focus-name"><button class="task-title" data-action="task" data-id="'+h(focus.id)+'">'+h(focus.title)+'</button><span data-focus-kind="'+(state.focus.pinned?'pinned':state.focus.source==='context'?'inferred':'manual')+'">'+(online?'':'Last known · ')+h(focusKind(state.focus))+(focus.project?' · '+h(focus.project):'')+'</span></div><button class="quiet-button" data-action="clear-focus">'+(state.focus.pinned?'Unpin & clear':'Clear')+'</button></div>';
  html+='<section class="recommendation" aria-label="Next action"><div class="section-header"><span class="eyebrow">'+(primary?(n.mode==='unknown'?'Status unknown':n.kind==='attention'?'Needs you · '+state.attention.length:'Available now'):'Workspace')+'</span>';
  if(online&&n.open.length) html+='<select id="time-budget" aria-label="Available time"><option value="">Any duration</option>'+[10,15,30,60].map(v=>'<option value="'+v+'" '+(timeBudget==v?'selected':'')+'>'+v+' minutes</option>').join('')+'</select>';
  html+='</div>';
  if(primary) {
    const reason=n.kind==='attention'?primary.attention_reason:primary.next_action||primary.recommendation_reason||'Continue your selected focus.';
    const label=n.mode==='unknown'?'Check agent status':n.kind==='attention'?'Open for review':n.kind==='focus'?'Continue current focus':state.focus?.pinned?'View next action':'Make current focus';
    const action=n.kind!=='available'||state.focus?.pinned?'task':'focus';
    html+='<h2>'+h(primary.title)+'</h2><p>'+h(reason)+'</p><div class="inline-actions"><button class="primary" data-action="'+action+'" data-id="'+h(primary.id)+'">'+label+'</button>'+(action==='focus'?'<button class="quiet-button" data-action="task" data-id="'+h(primary.id)+'">Details</button>':'')+(primary.estimate_minutes?'<span class="small dim">'+primary.estimate_minutes+' min · your estimate</span>':'')+'</div>';
  } else html+='<div class="empty"><h2>'+h(n.title)+'</h2><p>'+h(n.explanation)+'</p><div class="inline-actions"><button class="secondary" data-action="capture">Capture a thought</button>'+(online?'<button class="text-button" data-action="new-task">Add a task</button>':'<button class="text-button" data-action="refresh-now">Retry connection</button>')+'</div></div>';
  if(n.alternatives.length) html+='<details class="alternatives"><summary>'+n.alternatives.length+' other actionable task'+(n.alternatives.length===1?'':'s')+'</summary>'+n.alternatives.map(t=>taskRow(t)).join('')+'</details>';
  html+='</section>';
  if(n.waiting.length) html+='<details class="waiting-work"><summary>Waiting work <span class="count">'+n.waiting.length+'</span></summary>'+n.waiting.map(t=>{
    const dependencies=(t.blocked_by||[]).map(id=>state.tasks.find(x=>x.id===id)?.title).filter(Boolean);
    const reason=dependencies.length?'Waiting on: '+dependencies.join(', '):t.runs?.some(r=>r.effective_status==='unknown')?'Agent status unknown':t.runs?.some(r=>r.effective_status==='needs_input')?'Agent is awaiting your input':t.runs?.some(r=>r.effective_status==='working')?'Waiting on an agent report':'Marked '+t.status;
    return '<div class="task-row"><div class="task-content"><button class="task-title" data-action="task" data-id="'+h(t.id)+'">'+h(t.title)+'</button><div class="task-sub">'+h(reason)+'</div></div></div>';
  }).join('')+'</details>';
  if(state.tasks.length||state.runs.length) html+='<details class="agent-status" '+(n.mode==='unknown'||!online?'open':'')+'><summary>Agent reports</summary><p class="small dim" id="integration-status">'+h(n.integration)+'</p>'+state.runs.filter(r=>['working','needs_input','unknown'].includes(r.effective_status)).map(r=>'<div class="task-row"><span class="dot-square">'+(r.effective_status==='unknown'?'?':'·')+'</span><div class="task-content"><button class="task-title" data-action="task" data-id="'+h(r.task_id)+'">'+h(state.tasks.find(t=>t.id===r.task_id)?.title||r.agent)+'</button><div class="task-sub">'+h(r.agent)+' · '+(r.effective_status==='unknown'?'Status unknown':r.effective_status==='needs_input'?'Needs your input':'Reported running')+' · last report '+age(r.updated_at)+'</div></div></div>').join('')+(online&&n.open.some(t=>t.status!=='parked')?'<button class="text-button" data-action="agent-setup">Set up agent reporting</button><p class="small muted">Task-scoped tokens and the command wrapper; no automatic agent launch.</p>':'')+'</details>';
  if(primary)html+='<button class="add-later" data-action="new-task">＋ Add something for later</button>';
  html+='<button class="quiet-button mobile-only" data-action="settings">Settings</button></div>';
  return html;
}
function capturePage(){return `<section class="capture-page">${offlineNotice()}${header('A place to think.','Fragments, questions, things you figured out.')}
 <div class="capture-toolbar"><button class="record-button" data-action="record"><span class="record-circle"></span><span id="record-label">Record a thought</span></button><button id="pause-recording" class="quiet-button" data-action="pause-recording" hidden>Pause</button><span id="record-status" class="record-status">Audio stays local until you save.</span></div>
 <textarea id="brain-dump" class="brain-dump" aria-label="Brain dump" placeholder="Start anywhere. You don’t have to explain it neatly.">${h(draft.raw)}</textarea>
 <div id="visual-tray" class="visual-tray"><div class="visual-header"><span>Visuals & recordings</span><div><button class="quiet-button" data-action="attach">＋ Add</button><button class="quiet-button" data-action="sketch">Sketch</button></div></div><div id="visual-items" class="visual-items"></div><div id="visual-hint" class="small muted">Paste or drop an image. Diagrams and audio stay with this note.</div></div>
 <input id="file-picker" type="file" accept="image/png,image/jpeg,image/webp,audio/*" multiple hidden>
 <div class="capture-link"><span>Link to a task</span><select id="capture-task"><option value="">None — just a learning note</option>${state.tasks.filter(t=>t.status!=='done').map(t=>`<option value="${h(t.id)}" ${draft.task_id===t.id?'selected':''}>${h(t.title)}</option>`).join('')}</select></div>
 <div class="capture-footer"><div class="draft-meta" id="draft-status" role="status"></div><button id="save-capture" class="primary" data-action="save-capture">Save note ↗</button></div>
 <div id="local-save-error" class="notice error" hidden role="alert">Latest local save failed. Keep this page open. <button class="text-button" data-action="retry-local-save">Retry local save</button></div>
 <p class="small muted">${state.capabilities?.organizer?'Local AI cleanup runs after save. The original is preserved.':'Basic folder filing is on. AI rewriting is off until you connect a local model.'}</p></section>`;}
function renderFiles(){
  previewURLs.forEach(url=>URL.revokeObjectURL(url));previewURLs=[];
  if(!$('#visual-items'))return;
  $('#visual-items').innerHTML=draft.files.map((file,i)=>{
    const url=URL.createObjectURL(file.blob);previewURLs.push(url);
    return `<div class="visual-item ${file.blob.type.startsWith('audio/')?'audio-item':''}">${file.blob.type.startsWith('image/')?`<img src="${url}" alt="${h(file.name)}">`:`<audio src="${url}" controls preload="metadata"></audio><span class="small muted">${h(file.name)}</span>`}<button class="remove-attachment" data-action="remove-attachment" data-index="${i}" aria-label="Remove ${h(file.name)}">×</button></div>`;
  }).join('');$('#visual-hint').hidden=draft.files.length>0;
}
async function notesPage(){
 const rows=searchTerm?await api('/search?q='+encodeURIComponent(searchTerm)).catch(()=>state.notes.filter(n=>(n.title+' '+n.folder).toLowerCase().includes(searchTerm.toLowerCase()))):state.notes;
 const folders=[...new Set(state.notes.map(n=>n.folder))].sort();
 return `${offlineNotice()}${header('Notes','What you learned, kept in one place.','<button class="primary" data-action="capture">＋ Capture</button>')}<input id="note-search" class="search-field" type="search" aria-label="Search notes" placeholder="Search words in your notes…" value="${h(searchTerm)}"><div class="notes-layout"><aside class="folder-list" aria-label="Note folders"><button data-action="folder" data-folder="" class="${!selectedFolder?'active':''}">All notes <span class="count">${state.notes.length}</span></button>${folders.map(f=>`<button data-action="folder" data-folder="${h(f)}" class="${f===selectedFolder?'active':''}">${h(f)}</button>`).join('')}</aside><section>${rows.filter(n=>!selectedFolder||n.folder===selectedFolder).map(n=>`<button class="note-row" data-action="note" data-id="${h(n.id)}"><h3>${h(n.title)}</h3><div class="small">${h(n.folder)} · ${age(n.updated_at)}${n.processing?` · ${h(n.processing)}`:''}</div></button>`).join('')||'<div class="empty"><h2>No notes here yet.</h2><p>Save a brain dump. Folder filing happens after capture, not before it.</p></div>'}</section></div>`;
}
function md(text){
 // Deliberately small renderer. User and model HTML is always escaped.
 const out=[]; let code=false, codeLines=[], inList=false;
 const inline=s=>h(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
 for(const line of text.split('\n')){
  if(line.startsWith('```')){if(inList){out.push('</ul>');inList=false;}if(code){out.push('<pre><code>'+h(codeLines.join('\n'))+'</code></pre>');codeLines=[];}code=!code;continue;}
  if(code){codeLines.push(line);continue;}
  const li=line.match(/^\s*[-*] (.*)/), head=line.match(/^(#{1,3}) (.*)/);
  if(li){if(!inList){out.push('<ul>');inList=true;}out.push('<li>'+inline(li[1])+'</li>');continue;}
  if(inList){out.push('</ul>');inList=false;}
  if(head)out.push(`<h${head[1].length}>${inline(head[2])}</h${head[1].length}>`);
  else if(line.trim())out.push('<p>'+inline(line)+'</p>');
 }
 if(inList)out.push('</ul>');if(code)out.push('<pre><code>'+h(codeLines.join('\n'))+'</code></pre>');return out.join('');
}
function notePage(n){return `${offlineNotice()}<button class="text-button small" data-action="notes">← All notes</button><div class="note-breadcrumb">${h(n.folder)} · ${age(n.updated_at)}</div>${header(n.title,'',`<button class="quiet-button" data-action="edit-note">Edit</button>`)}
 ${n.error?`<div class="notice error">${h(n.error)}</div>`:''}${n.processing && n.processing!=='error'?`<div class="notice">${h(n.processing)}. Your original is saved. <button class="text-button" data-action="reload-note">Refresh</button></div>`:''}
 <div class="status-line"><span class="status-dot"></span>${h(n.mode==='original'?'Original wording · basic folder filing':n.mode)}${n.mode.startsWith('AI')?' · review the interpretation':''}</div>
 ${n.task_id?`<p class="small"><button class="text-button" data-action="task" data-id="${h(n.task_id)}">Linked task ↗</button></p>`:''}
 <div class="tabs"><button data-action="note-tab" data-tab="organized" class="${noteTab==='organized'?'active':''}">Note</button><button data-action="note-tab" data-tab="original" class="${noteTab==='original'?'active':''}">Original</button><button data-action="history">History</button></div>
 ${noteEditing?`<form id="note-form"><div class="form-grid"><label class="full">Title<input name="title" required maxlength="240" value="${h(n.title)}"></label><label class="full">Folder<input name="folder" required maxlength="240" value="${h(n.folder)}"></label><label class="full">Note<textarea name="body" class="note-edit">${h(n.body)}</textarea></label></div><div class="field-error"></div><div class="form-actions"><button type="button" class="quiet-button" data-action="cancel-edit">Cancel</button><button class="primary" type="submit">Save changes</button></div></form>`:noteTab==='original'?`<div class="original-block">${h(n.raw||'(No typed input)')}${n.transcript?'\n\nVOICE TRANSCRIPT\n\n'+h(n.transcript):''}</div>`:`<article class="note-body">${md(n.body||'Your visual or recording is saved below.')}</article>`}
 ${n.suggestions.map(s=>`<details><summary>An AI suggestion arrived after your edit. Nothing was overwritten.</summary><div class="note-body">${md(s.body)}</div><button class="secondary" data-action="apply-suggestion" data-id="${h(s.id)}">Use this version</button></details>`).join('')}
 <div class="note-visuals">${n.attachments.map(f=>`<figure>${f.mime.startsWith('image/')?`<a href="/api/attachments/${h(f.id)}" target="_blank" rel="noopener"><img src="/api/attachments/${h(f.id)}" alt="${h(f.name)}" loading="lazy"></a>`:`<audio controls src="/api/attachments/${h(f.id)}" preload="metadata"></audio>`}<figcaption>${h(f.name)}</figcaption></figure>`).join('')}</div>
 <div class="inline-actions" style="margin-top:30px"><button class="secondary" data-action="organize">Organize with local AI</button>${n.attachments.some(f=>f.mime.startsWith('audio/'))?'<button class="quiet-button" data-action="transcribe">Transcribe recording</button>':''}<button class="quiet-button" data-action="download-note">Export Markdown</button></div>`;}
function planPage(){
 const list=state.tasks.filter(t=>taskFilter==='all'||(taskFilter==='open'?!['done','parked'].includes(t.status):t.status===taskFilter)).sort((a,b)=>({'high':0,'medium':1,'low':2}[a.effective_priority]-{'high':0,'medium':1,'low':2}[b.effective_priority]));
 return `${offlineNotice()}${header('A little further ahead.','Priorities are suggested. Your changes stay yours.','<button class="primary" data-action="new-task">＋ Task</button>')}<div class="filter-bar">${[['open','Open'],['parked','Parked'],['done','Completed'],['all','All']].map(([v,label])=>`<button data-action="task-filter" data-filter="${v}" class="filter-chip ${taskFilter===v?'active':''}">${label}</button>`).join('')}</div><div class="plan-list">${list.map(t=>taskRow(t)).join('')||'<div class="empty"><p>No tasks in this view.</p><button class="text-button" data-action="new-task">Add something for later</button></div>'}</div>`;
}
async function render(){
 const token=++rendering;
 let route=location.hash.slice(1)||'overview';
 const settingsLink=route==='settings';
 const taskLink=route.startsWith('task/')?route.slice(5):'';
 if(settingsLink)route='overview';
 if(taskLink)route='plan';
 const page=route.startsWith('note/')?'note':route;
 if(recording && recording.state!=='inactive' && page!=='capture'){location.hash='capture';toast('Stop recording before leaving Capture.');return;}
 if(!state)state={tasks:[],notes:[],runs:[],available:[],attention:[],reminders:[],settings:{},capabilities:{}};
 currentPage=page;
 $$('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===(page==='note'?'notes':page)));
 $('#breadcrumb').innerHTML=page==='note'?'Knowledge':page==='capture'?'Capture':page==='notes'?'Knowledge':page==='plan'?'Tasks & reminders':'Your workspace';
 let html;
 if(page==='capture')html=capturePage();
 else if(page==='notes')html=await notesPage();
 else if(page==='note'){
   try {noteCache=await api('/notes/'+encodeURIComponent(route.split('/')[1]));html=notePage(noteCache);}
   catch(error){html=header('Note unavailable',error.message);}
 }else if(page==='plan')html=planPage();
 else{currentPage='overview';html=overview();}
 if(token!==rendering)return;
 $('#view').innerHTML=html;
 if(page==='capture'){renderFiles();bindCapture();}
 if(page==='notes')bindSearch();
 if($('#time-budget'))$('#time-budget').onchange=async e=>{timeBudget=e.target.value;await refresh();};
 if($('#note-form'))$('#note-form').onsubmit=saveNoteEdit;
 if(settingsLink){history.replaceState(null,'','#overview');lastRoute='#overview';await settings();}
 if(taskLink){history.replaceState(null,'','#plan');lastRoute='#plan';if(state.tasks.some(t=>t.id===taskLink))showTask(taskLink);else toast('Task unavailable.');}
}
function modal(title,body){
 const d=$('#modal');$('#modal-content').innerHTML=`<div class="modal-heading"><h2>${h(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}`;
 if(!d.open)d.showModal();
}
function closeModal(){
 if($('#task-form [name=raw]')){
   if(taskSaving)return;
   const form=$('#task-form');
   persistTaskDraft().then(()=>{if(form===$('#task-form'))$('#modal').close();}).catch(()=>{if(form===$('#task-form'))taskDraftStatus('Draft not stored. Keep this dialog open and retry; the task is not added.');});
 }else $('#modal').close();
}
function showLogin(){modal('Unlock Noema',`<p class="dim small">This server needs your access token. On the host machine, it is in the selected data directory’s admin.token file or your NOEMA_ACCESS_TOKEN setting.</p><form id="login-form"><label class="small dim">Access token<input class="full-width" type="password" name="token" autocomplete="current-password" required></label><div class="field-error"></div><div class="form-actions"><button class="primary">Unlock</button></div></form>`);$('#login-form').onsubmit=async e=>{e.preventDefault();try{await login(new FormData(e.target).get('token'));closeModal();await refresh();await flushOutbox();}catch(error){$('.field-error',e.target).textContent=error.message;}};}
function taskOptions(selected='',exclude=''){return `<option value="">No dependency</option>${state.tasks.filter(t=>t.id!==exclude&&t.status!=='done').map(t=>`<option value="${h(t.id)}" ${selected===t.id?'selected':''}>${h(t.title)}</option>`).join('')}`;}
function taskDetails(t){return `<div class="form-grid"><label>Workflow · optional<input name="project" maxlength="80" list="projects" value="${h(t.project)}" placeholder="Unassigned"><datalist id="projects">${[...new Set(state.tasks.map(x=>x.project))].map(p=>`<option>${h(p)}</option>`).join('')}</datalist></label><label>Priority<select name="priority">${['auto','high','medium','low'].map(p=>`<option value="${p}" ${t.priority===p?'selected':''}>${p==='auto'?'Automatic':p[0].toUpperCase()+p.slice(1)+' · set by me'}</option>`).join('')}</select></label><label class="full">Continue here<textarea name="next_action" maxlength="1000">${h(t.next_action)}</textarea></label><label>Status<select name="status">${['todo','active','waiting','blocked','review','parked','done'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Estimated minutes · optional<input type="number" name="estimate_minutes" min="1" max="1440" value="${h(t.estimate_minutes??'')}"></label><label>Planned day · optional<input type="date" name="planned_on" value="${h(t.planned_on||'')}"></label><label>Deadline · optional<input type="datetime-local" name="due_at" value="${localDateInput(t.due_at)}"></label><label>Available after · optional<input type="datetime-local" name="not_before" value="${localDateInput(t.not_before)}"></label><label class="full">Dependencies <span class="muted">Select zero or more. Use Ctrl / Cmd for multiple.</span><select name="dependencies" multiple size="3">${state.tasks.filter(x=>x.id!==t.id).map(x=>`<option value="${h(x.id)}" ${t.dependencies.includes(x.id)?'selected':''}>${h(x.title)}</option>`).join('')}</select></label><label class="full">Context<textarea name="detail" maxlength="16000">${h(t.detail)}</textarea></label><label class="full">Session or document link · optional<input type="url" name="session_url" placeholder="https://…" value="${h(t.session_url)}"></label></div>`;}
function taskDraftStatus(message=''){
 const status=$('#task-draft-status');if(status)status.textContent=message||(taskSaveState==='saved'?(taskDraft.pending?'Save unconfirmed · retry the same attempt':'Draft on this device · not added'):taskSaveState==='error'?'Local draft save failed · keep this dialog open':taskSaveState==='pending'?'Saving draft on this device…':'Draft in this tab · not added');
}
function persistTaskDraft(){
 const snapshot=structuredClone(taskDraft);taskSaveState='pending';taskDraftStatus();
 const next=taskWrites.catch(()=>{}).then(()=>localOp('kv','put','task-draft',snapshot));taskWrites=next;
 return next.then(()=>{taskSaveState='saved';taskDraftStatus();},error=>{taskSaveState='error';taskDraftStatus();throw error;});
}
function taskFieldValue(form,name){
 const f=new FormData(form),value=f.get(name);
 if(name==='dependencies')return f.getAll(name);
 if(name==='estimate_minutes')return value?Number(value):null;
 if(name==='due_at'||name==='not_before')return fromLocal(value);
 if(name==='planned_on')return value||null;
 return value;
}
function taskForm(task=null){
 const t=task||{title:'',project:'',detail:'',next_action:'',status:'todo',priority:'auto',due_at:null,not_before:null,planned_on:null,estimate_minutes:null,dependencies:[],session_url:'',...taskDraft.fields};
 modal(task?'Edit task':'Add task',`<form id="task-form" class="${task?'':'task-capture-form'}">${task?`<label class="task-input-label">Title<input name="title" required maxlength="240" value="${h(t.title)}"></label>`:`<label class="task-input-label" for="task-input">What do you need to do?</label><textarea id="task-input" name="raw" required maxlength="16000" rows="4" placeholder="Review the cleanup path">${h(taskDraft.raw)}</textarea>`}<details id="task-details"><summary>Details</summary>${task?'':`<label class="task-input-label">Title override · optional<input name="title" maxlength="240" value="${h(t.title)}"></label>`}${taskDetails(t)}</details>${task?'':`<p class="small muted task-capture-help">Ctrl / ⌘ + Enter to add. Enter starts a new line.</p><p class="small dim" id="task-draft-status" role="status"></p>`}<div class="field-error" role="alert"></div><div class="form-actions"><button type="button" class="quiet-button" data-action="close-modal">${task?'Cancel':'Close'}</button><button class="primary" type="submit">${task?'Save task':taskDraft.pending?'Retry add task':'Add task'}</button></div></form>`);
 const form=$('#task-form');
 if(!task){
   taskDraftStatus();
   if(taskDraft.pending){$$('input,textarea,select',form).forEach(c=>c.disabled=true);taskDraftStatus('Previous save is unconfirmed. Retry the same attempt; this draft is not an offline task queue.');}
   form.addEventListener('input',event=>{
     const name=event.target.name;
     if(name==='raw')taskDraft.raw=event.target.value;
     else if(name){const value=taskFieldValue(form,name);if((name==='project'||name==='title')&&!value)delete taskDraft.fields[name];else taskDraft.fields[name]=value;}
     persistTaskDraft().catch(()=>{});
   });
   $('#task-input').focus();
 }else $('[name=title]',form).focus();
 form.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();form.requestSubmit();}};
 form.onsubmit=async e=>{
   e.preventDefault();if(taskSaving)return;
   taskSaving=true;const button=$('[type=submit]',form);busy(button);$('.field-error',form).textContent='';
   try {
     let result;
     if(task){
       const payload={};for(const name of ['title','project','detail','next_action','status','priority','due_at','not_before','planned_on','estimate_minutes','dependencies','session_url'])payload[name]=taskFieldValue(form,name);
       for(const name of ['due_at','not_before'])if($('[name='+name+']',form).value===localDateInput(task[name]))payload[name]=task[name];
       result=await api('/tasks/'+task.id,{method:'PUT',body:JSON.stringify({...payload,expected_version:task.version})});
     }else{
       $$('input,textarea,select',form).forEach(c=>c.disabled=true);
       if(!taskDraft.pending){
         const day=new Date();day.setMinutes(day.getMinutes()-day.getTimezoneOffset());
         taskDraft.pending={capture_id:taskDraft.id,raw:taskDraft.raw,local_day:day.toISOString().slice(0,10),details:taskDraft.fields};
         try{await persistTaskDraft();}catch(error){taskDraft.pending=null;$$('input,textarea,select',form).forEach(c=>c.disabled=false);throw new Error('Draft storage failed. Task not added; keep this dialog open and retry.');}
       }
       $$('input,textarea,select',form).forEach(c=>c.disabled=true);
       result=await api('/task-captures',{method:'POST',body:JSON.stringify(taskDraft.pending)});
       if(!result.id||result.original_input!==taskDraft.pending.raw)throw new Error('Task acknowledgement could not be verified; retry the same attempt.');
       taskDraft={id:uid(),raw:'',fields:{},pending:null};
       // The task is already durably acknowledged. Failed local clearing is safe to retry by capture ID.
       await persistTaskDraft().catch(()=>{});
     }
     $('#modal').close();await refresh(false);
     if(['overview','plan'].includes(currentPage))await render();
     toast(task?'Task saved.':result.interpretation?.explanation?.startsWith('Scheduling wording')?'Task added. Date wording kept; correct it in Edit if needed.':'Task added.',result.id);
   }catch(error){
     if(!task&&error.status&&error.status<500&&error.status!==409){taskDraft.pending=null;$$('input,textarea,select',form).forEach(c=>c.disabled=false);persistTaskDraft().catch(()=>{});}
     $('.field-error',form).textContent=task?error.message:'Not confirmed added. Your input is preserved. '+(error.status?error.message:'Check the service or local storage, then retry the same attempt.');
     if(!task&&taskDraft.pending){button.textContent='Retry add task';taskDraftStatus('Save unconfirmed · draft preserved. Retry does not create a second task.');}
     busy(button,false);
   }finally{taskSaving=false;}
 };
}
function showTask(id){
 const task=state.tasks.find(t=>t.id===id);if(!task)return;
 modal(task.title,`<div class="inline-actions"><span class="pill">${h(task.project)}</span><button class="pill ${h(task.effective_priority)}" data-action="priority" data-id="${id}">${h(task.effective_priority)} · ${h(task.priority_source)}</button><span class="small muted">${h(task.status)}</span></div><p class="small dim">${h(task.priority_reason)}</p>${task.next_action?`<div class="subheading">Continue here</div><p>${h(task.next_action)}</p>`:''}${task.detail?`<details open><summary>Context</summary><div class="original-block">${h(task.detail)}</div></details>`:''}${task.blocked_by.length?`<div class="notice">Waiting on: ${task.blocked_by.map(dep=>h(state.tasks.find(t=>t.id===dep)?.title)).join(', ')}</div>`:''}${task.due_at?`<p class="small dim">Deadline: ${dateLabel(task.due_at)}</p>`:''}
 ${task.planned_on?`<p class="small dim">Planned day: ${h(task.planned_on)} · not a deadline or reminder.</p>`:''}${task.interpretation?.explanation?`<p class="small dim">At capture: ${h(task.interpretation.explanation)}</p>`:''}${task.original_input?`<details><summary>Original task input</summary><pre class="original-block">${h(task.original_input)}</pre><p class="small muted">Limited capture rules, not AI interpretation. Your original stays unchanged when you edit.</p></details>`:''}
 <div class="inline-actions" style="margin:20px 0"><button class="primary" data-action="focus" data-id="${id}">Focus on this</button>${sessionLink(task.session_url)}<button class="quiet-button" data-action="edit-task" data-id="${id}">Edit</button></div>
 ${task.runs.length?`<div class="subheading">Agent runs</div>${task.runs.map(r=>`<div class="run-detail"><div class="small">${h(r.agent)} · ${h(r.effective_status)} · ${age(r.updated_at)}</div><p class="small dim">${h(r.message)}</p>${sessionLink(r.session_url)}${['working','needs_input'].includes(r.status)?`<button class="quiet-button small" data-action="end-run" data-id="${h(r.id)}">End tracking</button>`:''}</div>`).join('')}`:''}
 <div class="subheading">Reminders</div>${task.reminders.map(r=>`<div class="token-row small"><span>${h(r.state)} · ${dateLabel(r.at)}</span><span><button class="quiet-button" data-action="snooze" data-id="${h(r.id)}">+20 min</button><button class="quiet-button" data-action="dismiss" data-id="${h(r.id)}">Dismiss</button></span></div>`).join('')}
 <form id="reminder-form" class="inline-actions"><input type="datetime-local" name="at" required aria-label="Reminder time"><button class="secondary" type="submit">Add reminder</button><div class="field-error"></div></form><p class="small muted">Times use this device’s timezone. Server-saved reminders survive closing the app; delivery requires a connected client.</p>
 <div class="subheading">Linked learning notes</div>${state.notes.filter(n=>n.task_id===id).map(n=>`<div><button class="text-button" data-action="note" data-id="${h(n.id)}">${h(n.title)} ↗</button></div>`).join('')||'<p class="small muted">No notes linked yet.</p>'}<button class="quiet-button small" data-action="capture-for-task" data-id="${id}">＋ Capture what you learned</button><details><summary>Connect an agent</summary><p class="small muted">Create a task-scoped token in Settings, then wrap your command. Task ID:</p><code class="token-value">${id}</code><pre class="original-block">python tools/agent.py --task ${id} -- your-command</pre></details>`);
 $('#reminder-form').onsubmit=async e=>{e.preventDefault();try{await api('/reminders',{method:'POST',body:JSON.stringify({task_id:id,at:fromLocal(new FormData(e.target).get('at'))})});await refresh(false);showTask(id);toast('Reminder saved.');}catch(error){$('.field-error',e.target).textContent=error.message;}};
}
async function patchTask(id,changes){const t=await api('/tasks/'+id);const payload={};for(const k of ['title','project','detail','next_action','status','priority','due_at','not_before','planned_on','estimate_minutes','dependencies','session_url'])payload[k]=t[k];await api('/tasks/'+id,{method:'PUT',body:JSON.stringify({...payload,...changes,expected_version:t.version})});await refresh(false);}
function showPriority(id){const t=state.tasks.find(t=>t.id===id);modal('Priority',`<p>${h(t.title)}</p><p class="small dim">${h(t.priority_reason)}</p><div class="inline-actions">${['auto','high','medium','low'].map(p=>`<button class="${t.priority===p?'primary':'secondary'}" data-action="set-priority" data-id="${id}" data-priority="${p}">${p==='auto'?'Automatic':p[0].toUpperCase()+p.slice(1)}</button>`).join('')}</div><p class="small muted">Your choice stays in effect until you select Automatic again.</p>`);}
async function saveNoteEdit(event){event.preventDefault();const form=event.target;const payload=Object.fromEntries(new FormData(form));payload.expected_version=noteCache.version;busy($('[type=submit]',form));try{noteCache=await api('/notes/'+noteCache.id,{method:'PUT',body:JSON.stringify(payload)});noteEditing=false;await refresh(false);await render();toast('Revision saved. The original is unchanged.');}catch(error){$('.field-error',form).textContent=error.message;busy($('[type=submit]',form),false);}}
async function showHistory(){const history=await api('/notes/'+noteCache.id+'/history');modal('Note history',history.map(r=>`<div class="history-item"><div class="inline-actions"><span class="small dim">Version ${r.version} · ${h(r.source)} · ${dateLabel(r.created_at)}</span>${r.version!==noteCache.version?`<button class="text-button small" data-action="restore-note" data-version="${r.version}">Restore as a new revision</button>`:''}</div><details><summary>${h(r.title)}</summary><pre class="original-block history-preview">${h(r.body)}</pre></details></div>`).join(''));}
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function bindCapture(){
 draftStatus();
 $('#brain-dump').addEventListener('input',()=>{draft.raw=$('#brain-dump').value;++draftWriteVersion;localSaveState='pending';draftStatus();clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,350);});
 $('#capture-task').onchange=e=>{draft.task_id=e.target.value;persistDraft();};
 $('#file-picker').onchange=e=>{addFiles(e.target.files);e.target.value='';};
 const tray=$('#visual-tray');
 tray.ondragover=e=>{e.preventDefault();tray.classList.add('dragging');};tray.ondragleave=()=>tray.classList.remove('dragging');
 tray.ondrop=e=>{e.preventDefault();tray.classList.remove('dragging');addFiles(e.dataTransfer.files);};
 $('#brain-dump').onpaste=e=>{if(e.clipboardData.files.length){e.preventDefault();addFiles(e.clipboardData.files);}};
}
async function addFiles(files){if(captureSaving)return;for(const file of files){if(draft.files.length>=12){toast('Keep each capture to 12 attachments.');break;}if(file.size>32*1024*1024){toast(`${file.name} exceeds 32 MB.`);continue;}if(!file.type.startsWith('image/')&&!file.type.startsWith('audio/')){toast('Use an image or audio recording.');continue;}draft.files.push({name:file.name||'visual.png',blob:file});}renderFiles();await persistDraft();}
async function saveCapture(){
 if(captureSaving)return;
 if(recording && recording.state!=='inactive'){toast('Stop recording before saving.');return;}
 draft.raw=$('#brain-dump').value;if(!draft.raw.trim()&&!draft.files.length){toast('Write something or add a recording or visual.');return;}
 clearTimeout(draftTimer);++draftWriteVersion;captureSaving=true;
 const controls=$$('.capture-page button, .capture-page input, .capture-page select, .capture-page textarea');
 const enabled=controls.filter(control=>!control.disabled);enabled.forEach(control=>busy(control));
 try {
   const capture=structuredClone({...draft,error:''}), nextDraft={id:uid(),raw:'',task_id:'',files:[]};
   await serializeDraftWrite(()=>localTransaction(['kv','outbox'],'readwrite',tx=>{
     // One commit: a failed/aborted draft reset must also roll back the queue.
     tx.objectStore('outbox').add(capture);
     tx.objectStore('kv').put(nextDraft,'draft');
   }));
   draft=nextDraft;localSaveState='saved';
 }catch(error){localSaveState='error';draftStatus();toast('Could not save the capture: '+error.message);}
 finally {captureSaving=false;enabled.forEach(control=>busy(control,false));}
 if(localSaveState==='error')return;
 await render();toast(online?'Capture saved on this device. Sending to your server…':'Capture saved on this device. It will upload when connected.');
 await flushOutbox();
}
async function toggleRecord(){
 if(recording && recording.state!=='inactive'){recording.stop();return;}
 if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){toast('Recording requires a supported browser on localhost or HTTPS. You can still attach an audio file.');return;}
 try {
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
  recording=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:64000}:{audioBitsPerSecond:64000});
  recordChunks=[];recordStarted=Date.now();let total=0;
  recording.ondataavailable=e=>{if(e.data.size){recordChunks.push(e.data);total+=e.data.size;if(total>30*1024*1024&&recording.state!=='inactive'){recording.stop();toast('Recording stopped near the 32 MB limit. Save this part before continuing.');}}};
  recording.onstop=async()=>{
    stream.getTracks().forEach(t=>t.stop());clearInterval(recordTimer);
    const type=recording.mimeType||'audio/webm';const blob=new Blob(recordChunks,{type});
    const extension=type.includes('ogg')?'ogg':type.includes('mp4')?'m4a':'webm';
    recording=null;recordChunks=[];
    if(blob.size)await addFiles([new File([blob],`voice-${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`,{type})]);
    if($('#record-label')){$('#record-label').textContent='Record another thought';$('.record-button').classList.remove('recording');$('#record-status').textContent='Recording added. Save when ready.';$('#pause-recording').hidden=true;$('#save-capture').disabled=false;}
  };
  recording.onerror=()=>{toast('Recording failed. Stop and check your microphone.');stream.getTracks().forEach(t=>t.stop());};
  recording.start(1000);$('#record-label').textContent='Stop recording';$('.record-button').classList.add('recording');$('#pause-recording').hidden=false;$('#save-capture').disabled=true;
  recordTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-recordStarted)/1000);if($('#record-status'))$('#record-status').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} · ${recording?.state==='paused'?'paused':'recording locally'}`;},1000);
 }catch(error){toast('Microphone unavailable: '+error.message);}
}
function pauseRecord(){if(!recording)return;if(recording.state==='recording'){recording.pause();$('#pause-recording').textContent='Resume';}else if(recording.state==='paused'){recording.resume();$('#pause-recording').textContent='Pause';}}
function sketch(){
 modal('A quick sketch',`<p class="small muted">Draw while you talk. Your recording continues.</p><canvas id="sketch" class="sketch-canvas" aria-label="Drawing canvas"></canvas><div class="form-actions"><button class="quiet-button" id="sketch-undo">Undo</button><button class="quiet-button" id="sketch-clear">Clear</button><button class="primary" id="sketch-add">Add to capture</button></div>`);
 const canvas=$('#sketch'),ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio,2);canvas.width=rect.width*scale;canvas.height=rect.height*scale;
 ctx.scale(scale,scale);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#d6e1be';
 const undo=[];let drawing=false,hasDrawing=false;
 function coords(e){const r=canvas.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];}
 canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);undo.push(ctx.getImageData(0,0,canvas.width,canvas.height));if(undo.length>12)undo.shift();drawing=true;hasDrawing=true;ctx.beginPath();ctx.moveTo(...coords(e));};
 canvas.onpointermove=e=>{if(drawing){ctx.lineTo(...coords(e));ctx.stroke();}};canvas.onpointerup=()=>drawing=false;canvas.onpointercancel=()=>drawing=false;
 $('#sketch-undo').onclick=()=>{if(undo.length)ctx.putImageData(undo.pop(),0,0);};$('#sketch-clear').onclick=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
 $('#sketch-add').onclick=()=>{if(!hasDrawing){toast('Draw something first.');return;}canvas.toBlob(async blob=>{await addFiles([new File([blob],'sketch.png',{type:'image/png'})]);closeModal();},'image/png');};
}
function bindSearch(){let timer;$('#note-search').oninput=e=>{searchTerm=e.target.value;clearTimeout(timer);timer=setTimeout(async()=>{const pos=e.target.selectionStart;await render();const input=$('#note-search');input.focus();try{input.setSelectionRange(pos,pos);}catch{}},300);};}
async function settings(section=''){
 const s=state.settings,c=state.capabilities||{};
 modal('Your workspace',`<div class="setting-row"><div>Screen context<p>Off by default. The Sway helper reports window metadata only.<br>No screenshot analysis is implemented in this build.</p></div><input id="observation-setting" type="checkbox" ${s.observation_enabled?'checked':''} aria-label="Enable window context"></div>
 <div class="setting-row"><div>Slow background motion<p>Pauses when hidden. Static by default.</p></div><input id="motion-setting" type="checkbox" ${s.motion?'checked':''} aria-label="Enable background motion"></div>
 <div class="setting-row"><div>Companion<p>The native helper is separate from this browser preview.</p></div><select id="companion-setting" aria-label="Companion mode">${['cat','dot','hidden'].map(v=>`<option value="${v}" ${s.companion===v?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="setting-row"><div>Companion size<p>Logical pixels; native helper reads this setting.</p></div><input id="companion-size" type="range" min="24" max="72" value="${s.companion_size||40}" aria-label="Companion size"></div>
 <div class="setting-row"><div>Reminder notifications<p>Opt-in browser notifications while a client is open.<br>No push service or always-on delivery yet.</p></div><button class="secondary small" data-action="notifications">${localStorage.getItem('noema-notifications')==='1'?'Disable':'Enable'}</button></div>
 <div class="subheading">Local processing</div><div class="notice">Note cleanup: ${c.organizer?h(c.model):'off — original wording is preserved'}<br>Speech: ${c.speech?h(c.speech_model):'off — recordings can still be saved'}<br>No models download or load automatically. Enable them using the README’s optional setup.</div>
 <details><summary>Window-to-task rules</summary><p class="small muted">A known application or title maps to a task. Unmatched windows do not become made-up focus claims. Pinned focus wins.</p>${(state.context_rules||[]).map(r=>`<div class="token-row small"><span>${h(r.app||'Any app')} / ${h(r.contains_text||'Any title')} → ${h(state.tasks.find(t=>t.id===r.task_id)?.title)}</span><button class="quiet-button" data-action="delete-rule" data-id="${h(r.id)}">Remove</button></div>`).join('')}
 <form id="rule-form" class="form-grid"><label>App ID<input name="app" placeholder="org.mozilla.firefox"></label><label>Title contains<input name="contains" placeholder="Two Sum"></label><label class="full">Task<select name="task_id" required>${taskOptions()}</select></label><div class="full"><button class="secondary">Add rule</button><div class="field-error"></div></div></form></details>
 <details id="agent-setup"><summary>Agent & observer tokens</summary><p class="small muted">An agent token can report runs and read only the tasks you choose. Observer tokens may report window context and read the small companion summary. Never paste tokens into notes.</p><div id="token-list"></div><form id="token-form" class="form-grid"><label>Label<input name="name" required placeholder="Local coding agent"></label><label>Access<select name="scope"><option value="agent">Task-scoped agent</option><option value="observer">Window observer</option></select></label><label class="full">Allowed tasks · agent tokens<select name="task_ids" multiple size="3">${state.tasks.map(t=>`<option value="${h(t.id)}">${h(t.title)}</option>`).join('')}</select></label><div class="full"><button class="secondary">Create token</button><div class="field-error"></div></div></form><div id="new-token"></div><p class="small dim">Use the generated task-scoped token with tools/agent.py. The wrapper tracks only the command you explicitly start; it does not attach to arbitrary browser sessions. See the README for the exact command and token environment setup.</p></details>
 <div class="subheading">Keep your data</div><p class="small muted">One SQLite database and an attachments directory on the server. This build does not automatically deploy or synchronize independent servers.</p><div class="inline-actions"><a href="/api/export" class="secondary-link">Export notes & tasks</a><button class="quiet-button" data-action="outbox">Local capture queue</button></div><p class="small muted">Version 0.1.0 · local-first development build</p><div class="field-error" id="settings-error"></div>`);
 const update=async body=>{try{await api('/settings',{method:'PATCH',body:JSON.stringify(body)});await refresh(false);drawAmbient();}catch(error){$('#settings-error').textContent=error.message;}};
 $('#observation-setting').onchange=e=>update({observation_enabled:e.target.checked});$('#motion-setting').onchange=e=>update({motion:e.target.checked});$('#companion-setting').onchange=e=>update({companion:e.target.value});$('#companion-size').onchange=e=>update({companion_size:Number(e.target.value)});
 $('#rule-form').onsubmit=async e=>{e.preventDefault();try{await api('/context/rules',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});await refresh(false);await settings();}catch(error){$('.field-error',e.target).textContent=error.message;}};
 $('#token-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const result=await api('/tokens',{method:'POST',body:JSON.stringify({name:f.get('name'),scope:f.get('scope'),task_ids:f.get('scope')==='agent'?f.getAll('task_ids'):[]})});$('#new-token').innerHTML=`<div class="notice">Copy this token now. It will not be displayed again.<code class="token-value">${h(result.token)}</code></div>`;loadTokens();}catch(error){$('.field-error',e.target).textContent=error.message;}};
 loadTokens();
 if(section==='agents'){$('#agent-setup').open=true;$('#agent-setup').scrollIntoView({block:'nearest'});$('#token-form input[name=name]').focus();}
}
async function companionControls(){
 const s=state.settings;
 modal('Companion',`<p class="dim">Small browser preview · not a native desktop overlay.</p><p class="small dim" id="companion-observation-status">${h(observationStatus(state))}. Window metadata only; no screenshot observation is implemented.</p><div class="setting-row"><label for="pet-mode">Mode</label><select id="pet-mode">${['cat','dot','hidden'].map(v=>`<option value="${v}" ${s.companion===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="setting-row"><label for="pet-size">Size<p>The app preview stays at most 40 px (28 px on phones). The separately launched native helper reads this setting.</p></label><input id="pet-size" type="range" min="24" max="72" value="${s.companion_size||40}" aria-label="Companion size"></div><div class="setting-row"><label for="pet-observation">Allow window metadata<p>This does not start the Sway helper or prove it is reporting. Pinned focus stays yours.</p></label><input id="pet-observation" type="checkbox" ${s.observation_enabled?'checked':''}></div><div class="inline-actions"><button class="secondary" data-action="companion-preview">Open browser preview</button><button class="quiet-button" data-action="settings">All settings</button></div><div class="field-error" id="pet-error"></div>`);
 let updates=Promise.resolve();
 const update=body=>{updates=updates.catch(()=>{}).then(async()=>{try{await api('/settings',{method:'PATCH',body:JSON.stringify(body)});await refresh(false);const status=$('#companion-observation-status');if(status)status.textContent=observationStatus(state)+'. Window metadata only; no screenshot observation is implemented.';}catch(error){const message=$('#pet-error');if(message)message.textContent=error.message;else toast(error.message);}});return updates;};
 $('#pet-mode').onchange=e=>update({companion:e.target.value});$('#pet-size').onchange=e=>update({companion_size:Number(e.target.value)});$('#pet-observation').onchange=e=>update({observation_enabled:e.target.checked});
}
async function loadTokens(){try{const tokens=await api('/tokens');if($('#token-list'))$('#token-list').innerHTML=tokens.map(t=>`<div class="token-row small"><span>${h(t.name)} · ${h(t.scope)}</span><button class="quiet-button" data-action="revoke-token" data-id="${h(t.id)}">Revoke</button></div>`).join('');}catch{}}
async function showOutbox(){const items=await localOp('outbox','getAll');modal('Captures on this device',`<p class="small dim">Saved explicitly, but not yet acknowledged by the server. Attachments are kept with each capture. Keep this browser’s site storage until they upload.</p>${items.map(item=>`<div class="history-item"><p>${h(item.raw.slice(0,180)||'Visual or voice capture')}</p><div class="small muted">${item.files.length} attachments</div>${item.error?`<div class="notice error">${h(item.error)}</div>`:''}<div class="inline-actions"><button class="secondary small" data-action="retry-capture" data-id="${h(item.id)}">Retry</button><button class="quiet-button small" data-action="restore-capture" data-id="${h(item.id)}">Open a copy in Capture</button><button class="quiet-button danger small" data-action="discard-capture" data-id="${h(item.id)}">Discard</button></div></div>`).join('')||'<p class="small muted">All saved captures have reached the server.</p>'}`);}
async function handleAction(button,event){
 const action=button.dataset.action,id=button.dataset.id;
 if(noteEditing && ['capture','overview','notes','plan','note','search','note-tab'].includes(action)){if(!confirm('Leave without saving this note edit? The last saved revision remains safe.'))return;noteEditing=false;}
 if(action==='close-modal'){closeModal();return;}
 if(['capture','overview','notes','plan'].includes(action)){closeModal();location.hash=action;if(currentPage===action)render();return;}
 if(action==='search'){closeModal();location.hash='notes';await render();$('#note-search')?.focus();return;}
 if(action==='settings'){await settings();return;}
 if(action==='agent-setup'){await settings('agents');return;}
 if(action==='refresh-now'){await login();await refresh();return;}
 if(action==='new-task'){taskForm();return;}
 if(action==='task'){showTask(id);return;}
 if(action==='edit-task'){const task=state.tasks.find(t=>t.id===id)||await api('/tasks/'+encodeURIComponent(id));taskForm(task);return;}
 if(action==='priority'){showPriority(id);return;}
 if(action==='set-priority'){await patchTask(id,{priority:button.dataset.priority});closeModal();await render();toast('Priority updated.');return;}
 if(action==='complete'){
  const task=state.tasks.find(t=>t.id===id);
  await patchTask(id,{status:task.status==='done'?'todo':'done'});await render();toast(task.status==='done'?'Task reopened.':'Task completed.');return;
 }
 if(action==='focus'){if(state.focus?.pinned&&state.focus.task_id!==id&&!confirm('Replace your pinned focus with this task?'))return;await api('/focus',{method:'POST',body:JSON.stringify({task_id:id,pinned:true})});closeModal();await refresh(false);location.hash='overview';await render();return;}
 if(action==='clear-focus'){if(state.focus?.pinned&&!confirm('Unpin and clear your current focus?'))return;await api('/focus',{method:'POST',body:'{"task_id":null}'});await refresh();return;}
 if(action==='task-filter'){taskFilter=button.dataset.filter;await render();return;}
 if(action==='folder'){selectedFolder=button.dataset.folder;await render();return;}
 if(action==='note'){closeModal();noteEditing=false;noteTab='organized';location.hash='note/'+id;return;}
 if(action==='note-tab'){noteTab=button.dataset.tab;noteEditing=false;$('#view').innerHTML=notePage(noteCache);return;}
 if(action==='reload-note'){await refresh(false);await render();return;}
 if(action==='edit-note'){noteEditing=true;$('#view').innerHTML=notePage(noteCache);$('#note-form').onsubmit=saveNoteEdit;return;}
 if(action==='cancel-edit'){noteEditing=false;$('#view').innerHTML=notePage(noteCache);return;}
 if(action==='history'){await showHistory();return;}
 if(action==='restore-note'){await api(`/notes/${noteCache.id}/restore/${button.dataset.version}`,{method:'POST',body:JSON.stringify({expected_version:noteCache.version})});closeModal();await refresh(false);await render();toast('Restored as a new revision.');return;}
 if(action==='apply-suggestion'){await api(`/notes/${noteCache.id}/suggestions/${id}/apply`,{method:'POST',body:JSON.stringify({expected_version:noteCache.version})});await render();return;}
 if(action==='organize'||action==='transcribe'){await api(`/notes/${noteCache.id}/${action}`,{method:'POST',body:'{}'});await render();toast('Queued for local processing.');return;}
 if(action==='download-note'){download(`${noteCache.title.replace(/[^\w -]/g,'').slice(0,70)||'note'}.md`,`# ${noteCache.title}\n\nFolder: ${noteCache.folder}\n\n${noteCache.body}\n`,'text/markdown');return;}
 if(action==='capture-for-task'){closeModal();draft.task_id=id;await persistDraft();location.hash='capture';return;}
 if(action==='snooze'){await api(`/reminders/${id}/snooze`,{method:'POST',body:'{"minutes":20}'});await refresh(false);notified.delete(id);toast('Reminder moved forward by 20 minutes.');closeModal();await render();return;}
 if(action==='dismiss'){await api('/reminders/'+id,{method:'DELETE'});await refresh(false);closeModal();await render();return;}
 if(action==='end-run'){
  if(!confirm('End tracking this run? This does not stop or kill the external agent process.'))return;
  await api(`/runs/${id}/end-tracking`,{method:'POST',body:'{}'});await refresh(false);closeModal();await render();return;
 }
 if(action==='attach'){$('#file-picker').click();return;}
 if(action==='remove-attachment'){draft.files.splice(Number(button.dataset.index),1);renderFiles();await persistDraft();return;}
 if(action==='sketch'){sketch();return;}
 if(action==='save-capture'){await saveCapture();return;}
 if(action==='retry-local-save'){await persistDraft();return;}
 if(action==='record'){await toggleRecord();return;}
 if(action==='pause-recording'){pauseRecord();return;}
 if(action==='companion'){await companionControls();return;}
 if(action==='companion-preview'){window.open('/companion','noema-companion','popup,width=260,height=310');return;}
 if(action==='delete-rule'){await api('/context/rules/'+id,{method:'DELETE'});await refresh(false);await settings();return;}
 if(action==='revoke-token'){await api('/tokens/'+id,{method:'DELETE'});await loadTokens();return;}
 if(action==='notifications'){
  if(localStorage.getItem('noema-notifications')==='1'){localStorage.setItem('noema-notifications','0');await settings();return;}
  if(!('Notification'in window)){toast('This browser does not expose notifications here. Reminders still appear in Needs you.');return;}
  const permission=await Notification.requestPermission();localStorage.setItem('noema-notifications',permission==='granted'?'1':'0');await settings();return;
 }
 if(action==='outbox'){await showOutbox();return;}
 if(action==='retry-capture'){const item=await localOp('outbox','get',id);item.error='';await localOp('outbox','put',undefined,item);await flushOutbox();await showOutbox();return;}
 if(action==='restore-capture'){
  if((draft.raw||draft.files.length)&&!confirm('Replace the current unsaved Capture draft? The queued capture remains safe.'))return;
  const item=await localOp('outbox','get',id);draft={...item,id:uid(),error:undefined};await localOp('kv','put','draft',draft);closeModal();location.hash='capture';await render();toast('Opened a copy. The queued original still exists.');return;
 }
 if(action==='discard-capture'){if(!confirm('Permanently discard this unsent capture and its local attachments?'))return;await localOp('outbox','delete',id);await showOutbox();await queueIndicator();return;}
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button)return;event.preventDefault();handleAction(button,event).catch(error=>toast(error.message));});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
$('#modal').addEventListener('cancel',e=>{if($('#task-form [name=raw]')){e.preventDefault();closeModal();}});
$('#modal').addEventListener('close',()=>{if(currentPage==='overview')render();});
let lastRoute=location.hash||'#overview', restoringRoute=false;
window.addEventListener('hashchange',()=>{
 if(restoringRoute){restoringRoute=false;return;}
 if(location.hash==='#settings'&&state){history.replaceState(null,'',lastRoute);settings();return;}
 if(location.hash.startsWith('#task/')&&state){const id=location.hash.slice(6);history.replaceState(null,'',lastRoute);if(state.tasks.some(t=>t.id===id))showTask(id);else toast('Task unavailable.');return;}
 if(captureSaving||(recording&&recording.state!=='inactive'&&location.hash!=='#capture')||(noteEditing&&!confirm('Leave without saving this note edit?'))){restoringRoute=true;location.hash=lastRoute;toast(captureSaving?'Finishing the local save.':recording?'Stop recording before leaving Capture.':'Your edit is still open.');return;}
 lastRoute=location.hash;noteEditing=false;render();
});
window.addEventListener('online',async()=>{await refresh(false);await flushOutbox();if(currentPage!=='capture'&&!noteEditing)render();});
window.addEventListener('offline',()=>{online=false;connection();if(currentPage==='overview'&&!$('#modal').open)render();});
window.addEventListener('beforeunload',event=>{if((recording&&recording.state!=='inactive')||noteEditing){event.preventDefault();event.returnValue='';}});
document.addEventListener('keydown',e=>{
 if(e.key==='n'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!$('#modal').open){e.preventDefault();location.hash='capture';}
 if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();location.hash='notes';setTimeout(()=>$('#note-search')?.focus(),100);}
 if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&currentPage==='capture'){e.preventDefault();saveCapture();}
});
let animation=null,phase=0,ambientWidth=0,ambientHeight=0;
function drawAmbient(){
 if(animation){clearTimeout(animation);animation=null;}
 const canvas=$('#ambient'),ctx=canvas.getContext('2d');
 if(document.hidden)return;
 const ratio=Math.min(devicePixelRatio||1,1.5);ambientWidth=innerWidth;ambientHeight=innerHeight;
 if(canvas.width!==ambientWidth*ratio||canvas.height!==ambientHeight*ratio){canvas.width=ambientWidth*ratio;canvas.height=ambientHeight*ratio;canvas.style.width=ambientWidth+'px';canvas.style.height=ambientHeight+'px';}
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,ambientWidth,ambientHeight);
 const reading=$('#view').getBoundingClientRect();
 // Sparse, low-contrast curved field inside the app; no full-screen simulation.
 for(let row=0;row<14;row++)for(let col=0;col<44;col++){
   const x=ambientWidth*.58+col*19+Math.sin(row*.32+phase)*8;
   const y=ambientHeight*.03+row*11+Math.sin(col*.1+row*.08+phase)*29;
   if(x>ambientWidth)continue;
   if(x>=reading.left&&x<=reading.right&&y>=reading.top&&y<=reading.bottom)continue;
   const a=.12+col/44*.15;ctx.fillStyle=`rgba(179,194,151,${a})`;ctx.beginPath();ctx.arc(x,y,.65,0,Math.PI*2);ctx.fill();
 }
 if(state?.settings?.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches){phase+=.008;animation=setTimeout(drawAmbient,100);}
}
window.addEventListener('resize',drawAmbient);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',drawAmbient);
document.addEventListener('visibilitychange',()=>{drawAmbient();if(!document.hidden){refresh(currentPage!=='capture'&&!noteEditing);flushOutbox();}scheduleRefresh();});
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{if(!document.hidden){await refresh();await flushOutbox();}scheduleRefresh();},document.hidden?60000:15000);}
async function boot(){
 try{const recovered=await localOp('kv','get','draft');draft=recovered||draft;localSaveState=recovered?'saved':'memory';state=await localOp('kv','get','snapshot')||null;}catch{localSaveState='error';}
 try{const recovered=await localOp('kv','get','task-draft');if(recovered){taskDraft=recovered;taskSaveState='saved';}}catch{taskSaveState='error';}
 try{await login();await refresh(false);}catch(error){if(error.status===401)showLogin();}
 await render();await flushOutbox();scheduleRefresh();drawAmbient();
 if(navigator.serviceWorker)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
// The native shell closes through the module's existing serialized draft writes.
// Ordinary browsers have no native IPC and ignore this request.
let desktopClosing=false;
window.addEventListener('noema:checkpoint-close',async()=>{
 if(typeof window.ipc?.postMessage!=='function'||desktopClosing)return;
 desktopClosing=true;
 try{
  if(captureSaving){alert('A capture save is still finishing. Try closing again shortly.');return;}
  if(((recording&&recording.state!=='inactive')||noteEditing)&&!confirm('Close Noema? An unfinished recording or unsaved note edit may be lost. Cancel to stop/save or copy it first.'))return;
  // Before startup recovers local state, don't overwrite the persisted draft.
  if(state!==null){
   clearTimeout(draftTimer);await persistDraft();
   if(localSaveState!=='saved'&&(draft.raw||draft.files.length)&&!confirm('Local draft saving failed. Close anyway and risk losing this draft? Cancel to keep it open and retry.'))return;
  }
  if(taskDraft.raw||taskDraft.pending)await persistTaskDraft();
  window.ipc.postMessage('noema:close-approved');
 }catch{alert('Could not checkpoint your draft. Keep Noema open and retry the local save.');}
 finally{desktopClosing=false;}
});
if(typeof window.ipc?.postMessage==='function')window.__noemaCheckpointCloseReady=true;
boot().catch(error=>{toast(error.message);$('#view').innerHTML=header('Noema', 'Could not open the workspace. Check the server and reload.');});
