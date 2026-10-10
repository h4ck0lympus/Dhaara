import {test} from 'node:test';
import assert from 'node:assert/strict';
import {QUALITY_STEPS,QUIET_SLOTS,buildGrid,fieldDetail,fieldState,packQuietRects} from '../dist-host/frontend/src/field.js';
test('Field state pauses when hidden, stays static with reduced motion and reports missing WebGL',()=>{
 assert.equal(fieldState(true,false,false),'animated');assert.equal(fieldState(true,false,true),'static');
 assert.equal(fieldState(true,true,false),'paused');assert.equal(fieldState(true,true,true),'paused');
 assert.equal(fieldState(false,false,false),'unsupported');assert.equal(fieldState(false,true,true),'unsupported');
});
test('Small screens and weak devices get fewer strokes, slower frames and a capped pixel ratio',()=>{
 const desktop=fieldDetail(1600,8,2),phone=fieldDetail(390,8,3),weak=fieldDetail(1600,4,1);
 assert.deepEqual(desktop,{columns:300,rows:170,interval:33,ratio:1.5});
 assert.equal(phone.ratio,1);assert.equal(phone.interval,50);assert.ok(phone.columns*phone.rows<desktop.columns*desktop.rows/3);
 assert.ok(weak.columns<desktop.columns);assert.equal(weak.interval,50);
 assert.equal(fieldDetail(1600,0,0).ratio,1,'Unknown core count and pixel ratio fall back safely');
});
test('Quality steps only reduce detail and never fall below the last step',()=>{
 let previous=Infinity;
 for(const step of QUALITY_STEPS){const {columns,rows}=fieldDetail(1600,8,1,step);assert.ok(columns*rows<previous);previous=columns*rows;}
 assert.deepEqual(fieldDetail(1600,8,1,0),fieldDetail(1600,8,1,QUALITY_STEPS.at(-1)));
 assert.deepEqual(fieldDetail(1600,8,1,4),fieldDetail(1600,8,1,1));
});
test('Grid emits a base and tip vertex per point with normalized coordinates and stable seeds',()=>{
 const grid=buildGrid(3,2);assert.equal(grid.length,3*2*8);
 for(let i=0;i<grid.length;i+=8){
  assert.deepEqual([grid[i],grid[i+1]],[grid[i+4],grid[i+5]]);assert.equal(grid[i+2],0);assert.equal(grid[i+6],1);
  assert.equal(grid[i+3],grid[i+7]);assert.ok(grid[i+3]>=0&&grid[i+3]<1);
  for(const value of [grid[i],grid[i+1]])assert.ok(value>=0&&value<=1);
 }
 assert.deepEqual([grid[0],grid[1]],[0,0]);assert.deepEqual([grid.at(-8),grid.at(-7)],[1,1]);
 assert.deepEqual(buildGrid(3,2),grid);
 assert.throws(()=>buildGrid(1,5),RangeError);assert.throws(()=>buildGrid(5,0),RangeError);
});
test('Quiet rectangles are clipped to the viewport, drop empty or offscreen ones and keep the largest',()=>{
 const packed=packQuietRects([
  {left:-20,top:10,width:120,height:50},
  {left:900,top:900,width:200,height:200},
  {left:10,top:2000,width:300,height:300},
  {left:0,top:0,width:0,height:40},
  {left:0,top:0,width:Number.NaN,height:40},
 ],1000,1000);
 assert.equal(packed.length,QUIET_SLOTS*4);
 assert.deepEqual([...packed.slice(0,8)],[900,900,100,100,0,10,100,50]);
 assert.ok(packed.slice(8).every(value=>value===0));
 const many=packQuietRects(Array.from({length:QUIET_SLOTS+3},(_,i)=>({left:0,top:0,width:10+i,height:10})),100,100);
 assert.equal(many[2],10+QUIET_SLOTS+2);assert.equal(many[(QUIET_SLOTS-1)*4+2],13);
 assert.ok(packQuietRects([],0,0).every(value=>value===0));
});
