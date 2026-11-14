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
  assert.equal(overlap.title,'위치가 맞아요');
  assert.equal(overlap.detail,'아직 닿지 않았다면 손을 조금 더 뻗어 보세요.');
  assert.doesNotMatch(overlap.title,/잡으세요|잡았어요/);
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
