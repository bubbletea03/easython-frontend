import test from 'node:test';
import assert from 'node:assert/strict';
import { gridAlignment } from '../src/phoneGuidance.ts';
import { deriveScene } from '../src/sceneUI.ts';

test('only the central cell of the visible 3x3 grid permits reaching', () => {
  for (const [x,y,direction] of [[.1,.1,'left'],[.5,.1,'up'],[.9,.1,'right'],[.1,.5,'left'],[.5,.5,undefined],[.9,.5,'right'],[.1,.9,'left'],[.5,.9,'down'],[.9,.9,'right']] as const) {
    assert.equal(gridAlignment(x,y),direction);
  }
  assert.equal(gridAlignment(1/3,1/3),undefined);
  assert.equal(gridAlignment(2/3,2/3),undefined);
  assert.equal(gridAlignment(.5,.32),'up');
  assert.equal(gridAlignment(.5,.68),'down');
});

test('a visible hand outside the center cell cannot start hand guidance or a reach prompt', () => {
  const input = {listening:false,busy:false,running:true,cameraReady:true,cameraError:false,message:'',outcome:'searching' as const,targetLabel:'cup',found:true,lost:false,guiding:true,timedOut:false,direction:'left' as const};
  const outside = deriveScene({...input,centered:false});
  assert.equal(outside.state,'found');
  assert.match(outside.title,/폰을/);
  assert.equal(outside.detail,undefined);
  assert.equal(deriveScene({...input,centered:true}).state,'guiding');
  assert.match(deriveScene({...input,guiding:false,centered:true}).detail!,/손을 뻗어/);
});
