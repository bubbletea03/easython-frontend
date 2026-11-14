import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeHandlePoint,followHandlePoint,createGripSuccessGate} from '../src/gripGeometry.ts';
import {colorMismatchText,createColorNoticeGate} from '../src/colorNotice.ts';
test('handle point follows translation and resizing of the same object',()=>{
  const point=relativeHandlePoint({x:.42,y:.3},{x:.1,y:.1,width:.4,height:.4});
  assert.ok(point);assert.ok(Math.abs(point.u-.8)<1e-8);
  const next=followHandlePoint(point,{x:.2,y:.3,width:.2,height:.6});
  assert.ok(Math.abs(next.x-.36)<1e-8);assert.ok(Math.abs(next.y-.6)<1e-8);
  assert.equal(relativeHandlePoint({x:.9,y:.9},{x:.1,y:.1,width:.2,height:.2}),undefined);
});
test('grip requires both fingertips in 10% expanded box continuously for one second',()=>{
  const gate=createGripSuccessGate(),box={x:100,y:100,width:100,height:100};
  const fingers={thumb:{x:95,y:150},index:{x:205,y:150}};
  assert.equal(gate.update(1,box,fingers,0,true),false);
  assert.equal(gate.update(1,box,fingers,999,true),false);
  assert.equal(gate.update(1,box,fingers,1000,true),true);
  assert.equal(gate.update(1,box,{...fingers,index:{x:211,y:150}},1100,true),false);
  assert.equal(gate.update(1,box,fingers,1200,true),false);
  assert.equal(gate.update(2,box,fingers,2200,true),false);
  assert.equal(gate.update(2,box,fingers,2300,false),false);
});
test('color alternatives wait three seconds, repeat no faster than ten seconds, reset on success',()=>{
  const result={detections:[],color_filter:'black',color_rejected:[{detected_color:'white'}]};
  const text=colorMismatchText(result,'검은 텀블러');assert.match(text!,/흰색/);
  const gate=createColorNoticeGate();assert.equal(gate.update(text,0),undefined);
  assert.equal(gate.update(text,2999),undefined);assert.equal(gate.update(text,3000),text);
  assert.equal(gate.update(text,12000),undefined);assert.equal(gate.update(text,13000),text);
  gate.update(undefined,14000);assert.equal(gate.update(text,18000),undefined);
  assert.equal(colorMismatchText({...result,detections:[{}] as never},'텀블러'),undefined);
  assert.match(colorMismatchText({...result,color_rejected:[{}]},'텀블러')!,/다른 물체/);
});
