import test from 'node:test';
import assert from 'node:assert/strict';
import { readDescription } from '../src/apiCore.ts';
import { createAutoGripGate } from '../src/autoGrip.ts';

test('generic cautions never become warnings or spoken description sentences', () => {
  for (const hazard of [undefined, null, 'screen', 'safe']) {
    const result = readDescription({hazard, safety:'Handle carefully', grasp:'Hold here', comment:'An object'});
    assert.equal(result.safety, undefined);
    assert.deepEqual(result.sentences, ['Hold here', 'An object']);
  }
  for (const hazard of ['hot','spill','edge','broken','sharp']) {
    assert.equal(readDescription({hazard,safety:'Visible danger'}).safety,'Visible danger');
  }
});

test('automatic explanation stays consumed across track changes until session reset', () => {
  const gate = createAutoGripGate();
  const item = (id: number, t: number) => ({id,lastSeen:t,missing:false,label:'cup',score:1,x:0,y:0,width:1,height:1});
  for (let t=0;t<=3000;t+=1000) assert.equal(gate.update(item(1,t),t,true),t===3000);
  for (let t=4000;t<=8000;t+=1000) assert.equal(gate.update(item(2,t),t,true),false);
  gate.reset();
  for (let t=9000;t<=12000;t+=1000) assert.equal(gate.update(item(2,t),t,true),t===12000);
});
