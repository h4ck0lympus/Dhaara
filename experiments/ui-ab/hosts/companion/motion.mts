export type Rect={x:number;y:number;width:number;height:number};
export function clampPet(rect:Rect,area:Rect):Rect{
 const width=Math.min(rect.width,area.width),height=Math.min(rect.height,area.height);
 return {width,height,x:Math.round(Math.max(area.x,Math.min(rect.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(rect.y,area.y+area.height-height)))};
}
export function corner(area:Rect,size:number):Rect{return clampPet({x:area.x+area.width-size-16,y:area.y+area.height-size-16,width:size,height:size},area);}
export function motionFrame(start:Rect,end:Rect,progress:number):Rect{
 const t=Math.max(0,Math.min(1,progress));const ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
 const bend=Math.sin(Math.PI*ease)*Math.min(40,Math.hypot(end.x-start.x,end.y-start.y)*.08);
 return {x:Math.round(start.x+(end.x-start.x)*ease),y:Math.round(start.y+(end.y-start.y)*ease-bend),width:Math.round(start.width+(end.width-start.width)*ease),height:Math.round(start.height+(end.height-start.height)*ease)};
}
