import {useEffect,useRef} from 'react';
import {QUALITY_STEPS,QUIET_SLOTS,buildGrid,fieldDetail,fieldState,packQuietRects} from './field';

/** Content the field dims beneath, so text never sits on a busy texture. */
export const QUIET_SELECTOR='.page-heading,.now-column,.writing-canvas,.voice-panel,.note-page,.note-navigation,.plan-list,.dialog,.empty-state';
const STATIC_TIME=21.5;

/* Each grid point is a ray from the camera to the ground plane, so the field covers the viewport evenly
   at any aspect. The hit point is lifted by a slow domain-warped height field and grown into a short
   stroke along its lit surface normal: flat ground reads as dots, slopes as combed filaments. */
const VERTEX=`
attribute vec4 point;
uniform float time,aspect;
uniform vec2 pointer;
varying float shade;
varying vec2 screen;
const float H=4.2,P=.78,F=.62;
float field(vec2 p,float t){
 vec2 q=p+vec2(sin(p.y*.21+t*.11)*2.1,cos(p.x*.17-t*.09)*2.4);
 return sin(q.x*.33+t*.23)*.9+cos(q.y*.41-t*.17)*.7+sin((q.x+q.y)*.57+t*.31)*.32+cos(q.x*.9-q.y*.6)*.1;
}
void main(){
 vec2 ndc=(point.xy*2.-1.)*vec2(1.18,1.14);
 vec3 up=vec3(0.,cos(P),sin(P)),forward=vec3(0.,-sin(P),cos(P));
 vec3 ray=vec3(ndc.x*F*aspect,0.,0.)+up*ndc.y*F+forward;
 vec3 camera=vec3(pointer.x*.55,H-pointer.y*.25,0.);
 vec3 ground=camera+ray*(camera.y/max(-ray.y,.05));
 vec2 drift=ground.xz+vec2(0.,time*.42);
 float swell=.38*exp(-dot(ndc-pointer*2.,ndc-pointer*2.)*1.6);
 float height=field(drift,time)+swell;
 vec2 slope=vec2(field(drift+vec2(.06,0.),time)-field(drift-vec2(.06,0.),time),field(drift+vec2(0.,.06),time)-field(drift-vec2(0.,.06),time))/.12;
 vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
 float steep=smoothstep(.12,1.05,length(slope)),comb=field(drift*.35+9.,time*.5)*2.4;
 vec3 direction=normalize(normal+vec3(cos(comb),.0,sin(comb))*(.35+steep*.6));
 vec3 base=vec3(ground.x,height,ground.z);
 vec3 world=base+direction*point.z*(.025+steep*.7)*(.5+point.w*1.);
 vec3 view=world-camera;
 float depth=dot(view,forward);
 float light=max(dot(normal,normalize(vec3(-.55,.62,-.56))),0.);
 shade=(.07+1.1*pow(light,2.4))*mix(.32,1.,point.z)*exp(-depth*.055)*(.72+.28*smoothstep(-.6,.9,height));
 shade*=.55+.45*smoothstep(-1.,.6,ndc.x+ndc.y*.6);
 gl_Position=depth<.2?vec4(2.,2.,2.,1.):vec4(view.x/(F*aspect),dot(view,up)/F,0.,depth);
 screen=gl_Position.xy/gl_Position.w;
}`;
const FRAGMENT=`
precision mediump float;
uniform vec4 quiet[${QUIET_SLOTS}];
uniform vec2 viewport;
uniform float ratio,strength;
varying float shade;
void main(){
 vec2 at=vec2(gl_FragCoord.x,viewport.y*ratio-gl_FragCoord.y)/ratio;
 float calm=1.;
 for(int i=0;i<${QUIET_SLOTS};i++){
  vec4 r=quiet[i];
  if(r.z<1.)continue;
  vec2 d=abs(at-(r.xy+r.zw*.5))-r.zw*.5;
  calm=min(calm,smoothstep(-28.,110.,length(max(d,0.))+min(max(d.x,d.y),0.)));
 }
 float alpha=shade*strength*mix(.2,1.,calm);
 gl_FragColor=vec4(vec3(.84,.86,.9),alpha);
}`;

function compile(gl:WebGLRenderingContext,type:number,source:string){
 const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);
 if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Field shader failed');
 return shader;
}

/** Monochrome generative stroke terrain. Decorative only: it never takes input and pauses with the page. */
export function BackgroundField({quietSelector=QUIET_SELECTOR}:{quietSelector?:string}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current!;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let gl:WebGLRenderingContext|null=null,program:WebGLProgram|null=null,uniforms:Record<string,WebGLUniformLocation|null>={};
  let width=0,height=0,ratio=1,vertices=0,quality=0,interval=33;
  let frame=0,last=0,time=0,slowFrames=0,quiet=packQuietRects([],0,0);
  let pointer={x:0,y:0},parallax={x:0,y:0};

  function setup(){
   gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
   if(!gl)return false;
   try{
    program=gl.createProgram()!;
    gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,FRAGMENT));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Field program failed');
   }catch(error){console.warn(error);gl=null;return false;}
   gl.useProgram(program);
   for(const name of ['time','aspect','pointer','quiet','viewport','ratio','strength'])uniforms[name]=gl.getUniformLocation(program,name);
   gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
   const point=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,4,gl.FLOAT,false,0,0);
   gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE);
   vertices=0;return true;
  }
  function upload(){
   const detail=fieldDetail(width,navigator.hardwareConcurrency||0,devicePixelRatio,QUALITY_STEPS[quality]);
   interval=detail.interval;
   if(!gl)return;
   const grid=buildGrid(detail.columns,detail.rows);
   gl.bufferData(gl.ARRAY_BUFFER,grid,gl.STATIC_DRAW);vertices=grid.length/4;
  }
  function draw(){
   if(!gl)return;
   gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
   gl.uniform1f(uniforms.time,time);gl.uniform1f(uniforms.aspect,width/Math.max(1,height));
   gl.uniform2f(uniforms.pointer,parallax.x,parallax.y);gl.uniform4fv(uniforms.quiet,quiet);
   gl.uniform2f(uniforms.viewport,width,height);gl.uniform1f(uniforms.ratio,ratio);gl.uniform1f(uniforms.strength,width<700?.75:1.);
   gl.drawArrays(gl.LINES,0,vertices);
  }
  function measureQuiet(){
   const rects=Array.from(document.querySelectorAll(quietSelector),element=>element.getBoundingClientRect());
   const next=packQuietRects(rects,width,height);
   const changed=next.some((value,i)=>Math.abs(value-quiet[i])>.5);
   quiet=next;return changed;
  }
  function tick(now:number){
   frame=requestAnimationFrame(tick);
   const elapsed=now-last;
   if(elapsed<interval)return;
   if(last){
    time+=Math.min(elapsed,100)*.00011;
    slowFrames=elapsed>interval*2.4?slowFrames+1:Math.max(0,slowFrames-1);
    if(slowFrames>20&&quality<QUALITY_STEPS.length-1){quality++;slowFrames=0;upload();}
   }
   last=now;
   parallax.x+=(pointer.x-parallax.x)*.04;parallax.y+=(pointer.y-parallax.y)*.04;
   draw();
  }
  function start(){
   cancelAnimationFrame(frame);frame=0;last=0;
   const state=fieldState(Boolean(gl),document.hidden,motion.matches);
   canvas.dataset.state=state;
   if(state==='static'){parallax={x:0,y:0};time=STATIC_TIME;measureQuiet();draw();}
   else if(state==='animated'){measureQuiet();draw();frame=requestAnimationFrame(tick);}
  }
  function resize(){
   width=innerWidth;height=innerHeight;
   ratio=fieldDetail(width,navigator.hardwareConcurrency||0,devicePixelRatio).ratio;
   canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
   upload();start();
  }
  function refreshQuiet(){
   if(!gl||document.hidden)return;
   if(measureQuiet()&&canvas.dataset.state==='static')draw();
  }
  function cursor(event:PointerEvent){
   if(event.pointerType==='touch'||motion.matches)return;
   pointer={x:event.clientX/Math.max(1,width)-.5,y:.5-event.clientY/Math.max(1,height)};
  }
  function lost(event:Event){event.preventDefault();cancelAnimationFrame(frame);frame=0;gl=null;canvas.dataset.state='unsupported';}
  function restored(){if(setup())resize();}

  setup();resize();
  const poll=setInterval(refreshQuiet,500);
  window.addEventListener('resize',resize);window.addEventListener('scroll',refreshQuiet,{passive:true,capture:true});
  window.addEventListener('pointermove',cursor,{passive:true});document.addEventListener('visibilitychange',start);motion.addEventListener('change',start);
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  return()=>{
   cancelAnimationFrame(frame);clearInterval(poll);
   window.removeEventListener('resize',resize);window.removeEventListener('scroll',refreshQuiet,{capture:true});
   window.removeEventListener('pointermove',cursor);document.removeEventListener('visibilitychange',start);motion.removeEventListener('change',start);
   canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
  };
 },[quietSelector]);
 return <canvas ref={ref} className="background-field" aria-hidden="true"/>;
}
