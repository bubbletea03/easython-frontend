import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint, projectBox, fingerGuidance } from '../src/sceneGeometry.ts';
import { updateTracks } from '../src/detectionTracks.ts';

test('full unmirrored server frame projects to cover-cropped mobile viewport', () => {
  const source = {x:0,y:0,width:1920,height:1080}, screen = {x:0,y:0,width:390,height:844};
  assert.deepEqual(projectPoint({x:.5,y:.5},source,screen),{x:195,y:422});
  assert.deepEqual(projectBox({x:0,y:0,width:1,height:1},source,screen),screen);
  assert.equal(projectBox({x:0,y:.2,width:.05,height:.2},source,screen).width,0);
  const point = projectPoint({x:.51,y:.5},source,screen);
  assert.ok(point.x>195); // rear camera and capture are both unmirrored
});
test('slow backend sampling keeps identity; reordered detections do not swap tracks', () => {
  let next=0; const id=()=>next++;
  const box = (x: number) => ({label:'컵',score:.9,x,y:.2,width:.2,height:.3});
  const initial=updateTracks([],[box(.1),box(.6)],0,id,3000);
  const nextFrame=updateTracks(initial,[box(.61),box(.11)],1000,id,3000);
  assert.deepEqual(nextFrame.map(t=>t.id),[1,0]);
  const gap=updateTracks(nextFrame,[],1500,id,3000);
  assert.ok(gap.every(t=>t.missing));
  assert.equal(updateTracks(gap,[],5000,id,3000).length,0);
});
test('screen overlap does not claim actual physical contact', () => {
  const guidance = fingerGuidance({x:150,y:150},{x:100,y:100,width:100,height:100},{x:0,y:0,width:390,height:844});
  assert.equal(guidance.fraction,0); assert.match(guidance.text,/화면에서 겹쳐/);
  assert.doesNotMatch(guidance.text,/잡았|접촉|성공/);
});
