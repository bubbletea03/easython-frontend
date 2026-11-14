import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoGripGate } from '../src/autoGrip.ts';
const item = (id: number, lastSeen: number, missing = false) => ({ id, lastSeen, missing, label: '컵', score: .9, x: .1, y: .1, width: .3, height: .4 });
test('requests once after three seconds of continuously refreshed detection', () => {
  const gate = createAutoGripGate();
  for (let t = 0; t < 3000; t += 750) assert.equal(gate.update(item(1, t), t, true), false);
  assert.equal(gate.update(item(1, 3000), 3000, true), true);
  assert.equal(gate.update(item(1, 6000), 6000, true), false);
});
test('lost, switched and stale detections cannot complete the previous countdown', () => {
  const gate = createAutoGripGate();
  gate.update(item(1, 0), 0, true);
  gate.update(item(1, 750), 750, true);
  gate.update(item(1, 1500, true), 1500, true);
  assert.equal(gate.update(item(1, 3000), 3000, true), false);
  assert.equal(gate.update(item(2, 4000), 4000, true), false);
  assert.equal(gate.update(item(2, 4000), 7100, true), false);
});
test('disabled or paused sessions restart continuity; manual requests suppress automatic duplicates', () => {
  const gate = createAutoGripGate();
  gate.update(item(1, 0), 0, true);
  gate.update(item(1, 1500), 1500, false);
  assert.equal(gate.update(item(1, 3000), 3000, true), false);
  gate.mark(1);
  for (let t = 3750; t <= 6000; t += 750) assert.equal(gate.update(item(1, t), t, true), false);
  gate.reset();
  for (let t = 6000; t < 9000; t += 750) gate.update(item(1, t), t, true);
  assert.equal(gate.update(item(1, 9000), 9000, true), true);
});
