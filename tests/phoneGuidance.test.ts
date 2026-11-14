import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneLossNoticeGate, handOccludesTarget, lostDirection, phoneEdgeDirection } from '../src/phoneGuidance.ts';

test('central last positions do not choose alternating left and right turns', () => {
  for (const x of [.35,.49,.5,.51,.65]) assert.equal(lostDirection(x), undefined);
  assert.equal(lostDirection(.34),'left');assert.equal(lostDirection(.66),'right');
});

test('phone alignment is restricted to the outer fifteen percent', () => {
  for (const x of [.15,.3,.5,.7,.85]) assert.equal(phoneEdgeDirection(x),undefined);
  assert.equal(phoneEdgeDirection(.14),'left');assert.equal(phoneEdgeDirection(.86),'right');
});

test('hand occlusion uses retained target position and normalized viewport distance', () => {
  const target={x:500,y:500}, viewport={width:1000,height:1000};
  assert.equal(handOccludesTarget({x:600,y:600},target,viewport),true);
  assert.equal(handOccludesTarget({x:700,y:700},target,viewport),false);
  assert.equal(handOccludesTarget(undefined,target,viewport),false);
});

test('lost notices wait two seconds and share a six second cooldown across flicker and direction changes', () => {
  const gate=createPhoneLossNoticeGate();
  assert.equal(gate.update(1000,'left',1000,true,false),undefined);
  assert.equal(gate.update(2000,'left',2000,true,false),undefined);
  assert.match(gate.update(2100,undefined,2100,true,false)!,/^폰을 천천히 돌려/);
  gate.update(0,'right',3000,false,true);
  assert.equal(gate.update(2100,'right',5100,true,false),undefined);
  assert.match(gate.update(5100,'right',8100,true,false)!,/오른쪽/);
});

test('occlusion, speech, and inactive sessions suppress notices; research happens once after ten seconds', () => {
  const gate=createPhoneLossNoticeGate();
  assert.equal(gate.update(5000,'left',5000,false,false),undefined);
  assert.match(gate.update(10000,'left',10000,true,false)!,/물건을 놓쳤어요/);
  assert.equal(gate.update(20000,'right',20000,true,false),undefined);
  gate.update(0,undefined,21000,false,true);
  assert.match(gate.update(10000,undefined,31000,true,false)!,/물건을 놓쳤어요/);
  gate.reset();
  assert.match(gate.update(2100,'left',32100,true,false)!,/왼쪽/);
});
