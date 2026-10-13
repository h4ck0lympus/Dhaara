import { QUIET_SLOTS } from './field';

/* Shared by both passes (DRY): the camera ray to the ground plane and the height packing ranges.
   Camera constants and math are ported from experiments/ui-ab/frontend/src/BackgroundField.tsx:17-27. */
const SHARED = `
const float H=4.2,P=.78,F=.62;
const float HEIGHT_RANGE=5.,SLOPE_RANGE=8.,TAU=6.2831853;
const vec3 UP=vec3(0.,cos(P),sin(P)),FORWARD=vec3(0.,-sin(P),cos(P)),EYE=vec3(0.,H,0.);
vec2 gridNdc(vec2 uv){return (uv*2.-1.)*vec2(1.18,1.14);}
vec3 groundAt(vec2 ndc,float aspect){
 vec3 ray=vec3(ndc.x*F*aspect,0.,0.)+UP*ndc.y*F+FORWARD;
 return EYE+ray*(EYE.y/max(-ray.y,.05));
}
`;

/** Full-screen triangle from gl_VertexID; no buffers. */
export const HEIGHT_VERTEX = `#version 300 es
void main(){
 vec2 corner=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
 gl_Position=vec4(corner*2.-1.,0.,1.);
}
`;

/** One texel per grid point: the 8,400 field() evaluations per frame (spec §7). Values are normalized so RGBA8 works too. */
export const HEIGHT_FRAGMENT = `#version 300 es
precision highp float;
${SHARED}
uniform float time,aspect;
uniform vec2 grid;
out vec4 outHeight;
float field(vec2 p,float t){
 vec2 q=p+vec2(sin(p.y*.21+t*.11)*2.1,cos(p.x*.17-t*.09)*2.4);
 return sin(q.x*.33+t*.23)*.9+cos(q.y*.41-t*.17)*.7+sin((q.x+q.y)*.57+t*.31)*.32+cos(q.x*.9-q.y*.6)*.1;
}
void main(){
 vec3 ground=groundAt(gridNdc(floor(gl_FragCoord.xy)/grid),aspect);
 vec2 drift=ground.xz+vec2(0.,time*.42);
 float height=field(drift,time);
 vec2 slope=vec2(field(drift+vec2(.06,0.),time)-field(drift-vec2(.06,0.),time),field(drift+vec2(0.,.06),time)-field(drift-vec2(0.,.06),time))/.12;
 float comb=field(drift*.35+9.,time*.5)*2.4;
 outHeight=vec4(clamp(height/HEIGHT_RANGE+.5,0.,1.),clamp(slope/SLOPE_RANGE+.5,0.,1.),fract(comb/TAU));
}
`;

/** Instanced: 2 vertices (base gl_VertexID 0, tip 1) per grid point, both fetching the same texel. */
export const STROKE_VERTEX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
${SHARED}
layout(location=0) in vec3 point;
uniform sampler2D heights;
uniform float aspect;
uniform ivec2 size;
out float shade;
void main(){
 float end=float(gl_VertexID);
 vec4 t=texelFetch(heights,clamp(ivec2(round(point.xy*vec2(size-1))),ivec2(0),size-1),0);
 float height=(t.x-.5)*HEIGHT_RANGE;
 // Original flowing ribbons: tiny luminous marks on a gently folded sheet.
 // Reuse the existing slow height field, visibility gating and pixel budget.
 float x=(point.x*2.-1.)*1.12;
 float row=point.y*2.-1.;
 float wave=sin(x*3.7+row*.8+height*.32)*.18;
 wave+=sin(x*6.1-row*1.6)*.065;
 float y=row*.72+wave-.12;
 float ribbon=pow(.5+.5*cos(row*8.+x*1.4),5.);
 shade=(.05+ribbon*.38)*(.45+point.z*.55);
 shade*=1.-smoothstep(.65,1.2,abs(row));
 gl_Position=vec4(x+(end-.5)*.0022,y,0.,1.);
}
`;

/** Quiet rects are CSS px; gl_FragCoord is backing px (scale = backing px per CSS px). */
export const STROKE_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 quiet[${QUIET_SLOTS}];
uniform float backing,scale,strength;
in float shade;
out vec4 outColor;
void main(){
 vec2 at=vec2(gl_FragCoord.x,backing-gl_FragCoord.y)/scale;
 float calm=1.;
 for(int i=0;i<${QUIET_SLOTS};i++){
  vec4 r=quiet[i];
  if(r.z<1.)continue;
  vec2 d=abs(at-(r.xy+r.zw*.5))-r.zw*.5;
  // 0 inside the rect and 2 CSS px beyond it (one backing pixel at 0.5x): the reading column stays at alpha 0.
  calm=min(calm,smoothstep(2.,112.,length(max(d,0.))+min(max(d.x,d.y),0.)));
 }
 float alpha=shade*strength*calm;
 if(alpha<=0.)discard;
 outColor=vec4(vec3(.84,.86,.9),alpha);
}
`;
