/** Pure helpers for the generative background field. No DOM or WebGL access, so hosts can test them. */
export type FieldState='animated'|'static'|'paused'|'unsupported';
export type FieldDetail={columns:number;rows:number;interval:number;ratio:number};
export type Rect={left:number;top:number;width:number;height:number};
export const QUIET_SLOTS=6;
export const QUALITY_STEPS=[1,.75,.55] as const;

export function fieldState(supported:boolean,hidden:boolean,reduced:boolean):FieldState{
 if(!supported)return 'unsupported';
 if(hidden)return 'paused';
 return reduced?'static':'animated';
}

/** Stroke density, frame interval and pixel ratio for a viewport. Small or weak devices get less of everything. */
export function fieldDetail(width:number,cores:number,devicePixelRatio:number,quality=1):FieldDetail{
 const small=width<700,weak=cores>0&&cores<=4;
 const scale=Math.max(QUALITY_STEPS[QUALITY_STEPS.length-1],Math.min(1,quality))*(weak?.7:1);
 return {
  columns:Math.round((small?150:300)*scale),
  rows:Math.round((small?90:170)*scale),
  interval:small||weak?50:33,
  ratio:Math.max(1,Math.min(devicePixelRatio||1,small?1:1.5)),
 };
}

/** One line segment per grid point: [u, v, end, seed] for its base (end=0) and tip (end=1). */
export function buildGrid(columns:number,rows:number):Float32Array{
 if(columns<2||rows<2)throw new RangeError('Field grid needs at least 2x2 points');
 const data=new Float32Array(columns*rows*8);
 let i=0;
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){
  const u=c/(columns-1),v=r/(rows-1),seed=fract(Math.sin(c*12.9898+r*78.233)*43758.5453);
  data[i++]=u;data[i++]=v;data[i++]=0;data[i++]=seed;
  data[i++]=u;data[i++]=v;data[i++]=1;data[i++]=seed;
 }
 return data;
}

/** Visible content rectangles packed for the shader, largest first, clipped to the viewport. Unused slots are zero. */
export function packQuietRects(rects:Rect[],viewportWidth:number,viewportHeight:number):Float32Array{
 const packed=new Float32Array(QUIET_SLOTS*4);
 const visible=rects
  .map(rect=>{
   const left=Math.max(0,rect.left),top=Math.max(0,rect.top);
   const right=Math.min(viewportWidth,rect.left+rect.width),bottom=Math.min(viewportHeight,rect.top+rect.height);
   return {left,top,width:right-left,height:bottom-top};
  })
  .filter(rect=>Number.isFinite(rect.width+rect.height)&&rect.width>1&&rect.height>1)
  .sort((a,b)=>b.width*b.height-a.width*a.height)
  .slice(0,QUIET_SLOTS);
 visible.forEach((rect,i)=>packed.set([rect.left,rect.top,rect.width,rect.height],i*4));
 return packed;
}

function fract(value:number){return value-Math.floor(value);}
