import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveScene, screenDirection } from '../src/sceneUI.ts';
const idle = { listening:false,busy:false,running:false,cameraReady:true,cameraError:false,message:'',outcome:'idle' as const,
  targetLabel:'컵',found:false,lost:false,guiding:false,timedOut:false };
test('idle has no working state; listening and processing are distinct', () => {
  assert.equal(deriveScene(idle).state,'idle');
  assert.equal(deriveScene({...idle,listening:true}).state,'listening');
  assert.equal(deriveScene({...idle,busy:true}).state,'processing');
});
test('search, found, guiding and lost use real scene data', () => {
  assert.equal(deriveScene({...idle,running:true}).state,'searching');
  assert.equal(deriveScene({...idle,running:true,found:true}).state,'found');
  const guide=deriveScene({...idle,running:true,found:true,guiding:true,direction:'left'});
  assert.equal(guide.title,'왼쪽으로');
  const overlap=deriveScene({...idle,running:true,found:true,guiding:true});
  assert.equal(overlap.state,'guiding');
  assert.equal(overlap.title,'거기예요. 그대로 쭉 뻗어 잡으세요');
  assert.match(overlap.detail!,/버튼을 누르고 잡았어/);
  assert.doesNotMatch(overlap.title,/잡았어요|잡으셨/);
  assert.equal(deriveScene({...idle,running:true,lost:true,lostSide:'right'}).lostSide,'right');
});
test('real safety overrides normal guidance and camera failure stays explicit', () => {
  assert.equal(deriveScene({...idle,running:true,found:true,safety:'뜨거워요'}).state,'warning');
  assert.equal(deriveScene({...idle,cameraError:true}).state,'error');
  assert.equal(deriveScene({...idle,outcome:'unknown'}).state,'unknown');
  assert.equal(deriveScene({...idle,outcome:'done'}).state,'done');
});
test('dominant screen direction does not infer metric distance', () => {
  assert.equal(screenDirection(100,-20),'right'); assert.equal(screenDirection(-10,-80),'up');
  assert.equal(screenDirection(5,4),undefined);
});

test('hand vertical guidance uses forward and toward the body, while phone alignment stays screen-relative', () => {
  const found = {...idle,running:true,found:true,centered:true,guiding:true};
  assert.equal(deriveScene({...found,direction:'up'}).title,'앞으로');
  assert.equal(deriveScene({...found,direction:'down'}).title,'몸 쪽으로');
  assert.doesNotMatch(deriveScene({...found,centered:false,direction:'up'}).title,/위쪽|아래쪽/);
});

test('locked hand guidance ignores the center cell, but an unknown sharp handle blocks all hand directions',()=>{
  const found={...idle,running:true,found:true,guiding:true,centered:false,handPhase:true,direction:'left' as const};
  assert.equal(deriveScene(found).state,'guiding');
  const waiting=deriveScene({...found,waitingHandle:true});
  assert.equal(waiting.state,'found');assert.equal(waiting.title,'손잡이를 확인하고 있어요');assert.equal(waiting.direction,undefined);
  assert.equal(deriveScene({...found,safety:'멈추세요. 칼날 쪽이에요.'}).state,'warning');
});
