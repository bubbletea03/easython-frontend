import test from 'node:test';
import assert from 'node:assert/strict';
import { isHandOnlyPerson } from '../src/handObjectFilter.ts';
const hand = Array.from({length:21}, (_,i) => ({x:.3 + (i % 5) * .04, y:.4 + Math.floor(i / 5) * .04}));
const handBox = {label:'사람',score:.9,x:.28,y:.38,width:.2,height:.2};
test('rejects a person box tightly matching a tracked hand', () => {
  assert.equal(isHandOnlyPerson(handBox,[hand]),true);
});
test('keeps full people even when they contain tracked hands', () => {
  assert.equal(isHandOnlyPerson({...handBox,x:.1,y:.05,width:.8,height:.9},[hand]),false);
});
test('keeps objects, people away from hands, and detections without reliable hands', () => {
  assert.equal(isHandOnlyPerson({...handBox,label:'컵'},[hand]),false);
  assert.equal(isHandOnlyPerson({...handBox,x:.7},[hand]),false);
  assert.equal(isHandOnlyPerson(handBox,[]),false);
  assert.equal(isHandOnlyPerson(handBox,[[{x:.3,y:.4}]]),false);
});
