import {useEffect,useRef} from 'react';

/** A projected, deforming terrain. Drawn in batches, with no scene-graph dependency. */
export function BackgroundField(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current!;
  const context=canvas.getContext('2d',{alpha:true});
  if(!context)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,frame=0,last=0,phase=0,previous=0,slowFrames=0,quality=1;
  let pointer={x:0,y:0},parallax={x:0,y:0};
  const buckets=Array.from({length:7},()=>new Path2D());
  function paint(time:number){
   context!.clearRect(0,0,width,height);
   for(let i=0;i<buckets.length;i++)buckets[i]=new Path2D();
   const small=width<700||(navigator.hardwareConcurrency||4)<=4;
   const columns=Math.round((small?64:108)*quality),rows=Math.round((small?22:36)*quality);
   parallax.x+=(pointer.x-parallax.x)*.035;parallax.y+=(pointer.y-parallax.y)*.035;
   function surface(originX:number,originY:number,scale:number,strength:number,offset:number){
    for(let r=0;r<rows;r++){
     const v=(r/(rows-1)-.5)*5.8;
     const depth=1/(1.5+(v+2.9)*.12);
     let previousPoint:{x:number;y:number}|null=null;
     for(let c=0;c<columns;c++){
      const u=(c/(columns-1)-.5)*11;
      const z=Math.sin(u*.9+time+offset)*.43+Math.cos(v*1.12-time*.62)*.31+Math.sin(u*.4+v*.85+time*.35)*.22;
      const x=originX+(u*.94-v*.32)*scale*depth+parallax.x*12;
      const y=originY+(u*.22+v*.71)*scale*.34*depth-z*scale*.73*depth+parallax.y*9;
      if(x<0||x>width||y<0||y>height){previousPoint=null;continue;}
      const edge=Math.pow(Math.sin(c/(columns-1)*Math.PI)*Math.sin(r/(rows-1)*Math.PI),.55);
      const ridge=.35+.65*(z+1)/2;
      const alpha=Math.min(.66,strength*edge*ridge*depth);
      const level=Math.min(6,Math.floor(alpha*11));
      if(level===0){previousPoint={x,y};continue;}
      const radius=(.42+depth*.42)*(small?.85:1);
      buckets[level].rect(x-radius*.5,y-radius*.5,radius,radius);
      if(r%5===0&&previousPoint){buckets[Math.max(1,level-1)].moveTo(previousPoint.x,previousPoint.y);buckets[Math.max(1,level-1)].lineTo(x,y);}
      previousPoint={x,y};
     }
    }
   }
   surface(width*.76,height*.24,Math.max(100,width*.19),.78,0);
   surface(width*.19,height*.97,Math.max(90,width*.14),.39,2.8);
   for(let i=1;i<buckets.length;i++){
    context!.fillStyle=`rgba(209,214,223,${i*.07})`;context!.strokeStyle=`rgba(178,186,200,${i*.035})`;
    context!.lineWidth=.35;context!.fill(buckets[i]);context!.stroke(buckets[i]);
   }
  }
  function tick(now:number){
   if(document.hidden||motion.matches){canvas.dataset.state=document.hidden?'paused':'static';if(motion.matches){parallax={x:0,y:0};paint(0);}frame=0;return;}
   frame=requestAnimationFrame(tick);
   if(now-last<(width<700?66:40))return;
   if(previous)phase+=Math.min(now-previous,100)*.000085;
   previous=now;last=now;
   const start=performance.now();paint(phase);
   if(performance.now()-start>12){if(++slowFrames>6){quality=Math.max(.55,quality-.15);slowFrames=0;}}
   else slowFrames=Math.max(0,slowFrames-1);
  }
  function start(){
   cancelAnimationFrame(frame);frame=0;previous=0;
   canvas.dataset.state=document.hidden?'paused':motion.matches?'static':'animated';
   if(document.hidden)return;
   if(motion.matches){parallax={x:0,y:0};paint(0);}
   else{paint(phase);frame=requestAnimationFrame(tick);}
  }
  function resize(){
   width=innerWidth;height=innerHeight;
   const ratio=Math.min(devicePixelRatio||1,width<700?1:1.5);
   canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context!.setTransform(ratio,0,0,ratio,0,0);start();
  }
  function cursor(event:PointerEvent){if(!motion.matches&&event.pointerType!=='touch')pointer={x:event.clientX/width-.5,y:event.clientY/height-.5};}
  resize();window.addEventListener('resize',resize);window.addEventListener('pointermove',cursor,{passive:true});document.addEventListener('visibilitychange',start);motion.addEventListener('change',start);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('pointermove',cursor);document.removeEventListener('visibilitychange',start);motion.removeEventListener('change',start);};
 },[]);
 return <canvas ref={ref} className="background-field" aria-hidden="true"/>;
}
