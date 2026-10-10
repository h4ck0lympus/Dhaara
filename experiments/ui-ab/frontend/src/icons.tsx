import { memo, type CSSProperties } from 'react';
export function Icon({name, size=20, style}:{name:string;size?:number;style?:CSSProperties}) {
 const paths:Record<string, React.ReactNode>={
 now:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/></>,
 home:<><path d="m2.5 10 9.5-8 9.5 8M5 9v12h5v-7h4v7h5V9"/></>,
 pen:<><path d="m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4"/></>,
 'task-check':<><circle cx="12" cy="12" r="9.5"/><path d="m7 12 3 3 7-7"/></>,
 arrow:<path d="M3 12h17m-6-6 6 6-6 6"/>,
 waveform:<path d="M3 10v4M7 6v12M12 3v18M17 7v10M21 10v4"/>,
 plus:<path d="M12 5v14M5 12h14"/>,
 notes:<><path d="M5 2.5h10l4 4v15H5zM15 2.5v5h4M8 11h8M8 15h8M8 18h6"/></>,
 plan:<path d="M5 5h14M5 12h12M5 19h14"/>,
 search:<><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
 chevron:<path d="m9 5 6 7-6 7"/>, close:<path d="m6 6 12 12M18 6 6 18"/>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/></>,
 chart:<><path d="M5 20V12M12 20V5M19 20V9" strokeWidth="4"/></>,
 settings:<><path d="m9 3 .6-1h4.8l.8 3 2.4 1.4 3-.6 2.4 4.2-2.2 2 .1 2.8 2 2.2-2.4 4.1-3-.7-2.4 1.4-.8 2.7H9.5l-.8-2.7-2.4-1.4-3 .7L1 17l2-2.2V12L1 10l2.4-4.2 3 .6L9 5z" transform="translate(1 0) scale(.9)"/><circle cx="12" cy="12" r="3"/></>,
 play:<path d="m7 4 13 8-13 8z" fill="currentColor" strokeWidth="0"/>,
 spark:<path d="M12 1c1 8 3 10 11 11-8 1-10 3-11 11C11 15 9 13 1 12c8-1 10-3 11-11Z" fill="currentColor" strokeWidth="0"/>,
 image:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
 mic:<><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
 folder:<path d="M3 5h7l2 3h9v12H3z"/>, check:<path d="m5 12 4 4L19 6"/>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]||paths.notes}</svg>;
}
// Static, deterministic strands. Memoization keeps decoration out of the typing path.
export const Ribbon = memo(function Ribbon() {
 type Point=[number,number];
 const streams:{points:Point[];rows:number;strength:number;seed:number}[]=[
  {points:[[-60,460],[20,275],[190,208],[345,232],[540,207],[760,145],[1020,118],[1170,255],[1340,340]],rows:17,strength:.65,seed:17},
  {points:[[0,225],[195,202],[345,244],[540,185],[720,170],[920,75],[1100,145],[1340,275]],rows:13,strength:.30,seed:37},
  {points:[[-30,380],[180,242],[350,246],[545,177],[715,204],[945,136],[1090,145],[1280,308]],rows:11,strength:.42,seed:53},
 ];
 function sample(points:Point[],t:number):Point{
  const index=Math.min(points.length-2,Math.floor(t)),u=t-index;
  const p0=points[Math.max(0,index-1)],p1=points[index],p2=points[index+1],p3=points[Math.min(points.length-1,index+2)];
  return [0,1].map(a=>.5*(2*p1[a]+(-p0[a]+p2[a])*u+(2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*u*u+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*u*u*u)) as Point;
 }
 function noise(n:number){const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);}
 const dots=[];
 for(const stream of streams){
  const count=225;
  for(let row=0;row<stream.rows;row++)for(let col=0;col<count;col++){
   const key=stream.seed*10000+row*count+col;
   if(noise(key)<.13)continue;
   const progress=col/(count-1),t=progress*(stream.points.length-1);
   const center=sample(stream.points,t),ahead=sample(stream.points,Math.min(stream.points.length-1,t+.005));
   const dx=ahead[0]-center[0],dy=ahead[1]-center[1],length=Math.hypot(dx,dy)||1;
   const twist=Math.sin(progress*9+stream.seed)*.5+.5;
   const offset=(row-(stream.rows-1)/2)*(4+twist*6)+Math.sin(progress*17+row*.2)*5;
   const x=center[0]-dy/length*offset+(noise(key+1)-.5)*2;
   const y=center[1]+dx/length*offset+(noise(key+2)-.5)*2;
   const edge=1-Math.abs(row-(stream.rows-1)/2)/(stream.rows/2);
   const opacity=stream.strength*(.35+edge*.65)*(.4+noise(key+3)*.6);
   dots.push(<circle key={key} cx={x} cy={y} r={.45+noise(key+4)*.4} opacity={opacity}/>);
  }
 }
 return <svg className="ribbon" viewBox="0 0 1344 570" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="reading-clear"><stop stopColor="white" stopOpacity=".06"/><stop offset="1" stopColor="white"/></radialGradient><mask id="ribbon-mask"><rect width="1344" height="570" fill="white"/><ellipse cx="320" cy="165" rx="355" ry="95" fill="url(#reading-clear)"/></mask></defs><g fill="#78a0ce" mask="url(#ribbon-mask)">{dots}</g></svg>;
});
export const Contours = memo(function Contours() {
 return <svg className="contours" viewBox="0 0 420 218" preserveAspectRatio="none" aria-hidden="true">{Array.from({length:37},(_,i)=><path key={i} d={`M-45 ${225+i*3} C60 ${238+i*2.4} 107 ${160+i*2.5} 161 ${148+i*2.2} S225 ${91+i*2.6} 253 ${102+i*2} S299 ${102+i*2.3} 326 ${83+i*2.5} S370 ${65+i*2.7} 435 ${65+i*2.8}`} fill="none" stroke="#aab977" strokeWidth={i===0?1.3:.55} opacity={i===0?.26:i<5?.16:.065}/>)}</svg>;
});
