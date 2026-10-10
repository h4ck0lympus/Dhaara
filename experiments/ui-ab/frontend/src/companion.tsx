import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './companion.css';
type State={observing:boolean;mode:'Cat'|'Dot'|'Hidden';status:string;provider:string;context:{app:string;title:string;workspace:string;monitor:string}|null;taskId:string|null};
declare global{interface Window{noemaCompanion:{state():Promise<State>;settings(value:unknown):Promise<State>;toggle():Promise<void>;close():Promise<void>;changed(callback:(state:State)=>void):()=>void}}}
function Companion(){
 const [state,setState]=useState<State|null>(null);
 useEffect(()=>{window.noemaCompanion.state().then(setState);return window.noemaCompanion.changed(setState);},[]);
 if(!state)return null;
 if(new URLSearchParams(location.search).get('view')!=='controls')return <button className="pet" aria-label="Desktop companion controls" onClick={()=>window.noemaCompanion.toggle()}>{state.mode==='Dot'?<span className="dot"/>:<img src="./assets/cat-transparent.png" alt="Black kitten"/>}</button>;
 return <main className="controls"><div className="heading"><strong>Companion</strong><button aria-label="Close companion controls" onClick={()=>window.noemaCompanion.close()}>×</button></div><p className="status">{state.status}</p><div className="modes">{(['Cat','Dot','Hidden'] as const).map(mode=><button key={mode} aria-pressed={state.mode===mode} onClick={()=>window.noemaCompanion.settings({mode}).then(setState)}>{mode}</button>)}</div><button className="observe" onClick={()=>window.noemaCompanion.settings({observing:!state.observing}).then(setState)}>{state.observing?'Pause observation':'Start observation'}</button>{state.context&&<><p className="app-name">{state.context.app}</p><p className="window-title">{state.context.title}</p><p className="location">{[state.context.workspace&&'Workspace '+state.context.workspace,state.context.monitor].filter(Boolean).join(' · ')}</p></>}<p className="note">Window metadata · {state.provider}<br/>Task activity updates; completion stays manual.</p></main>;
}
createRoot(document.getElementById('root')!).render(<Companion/>);
