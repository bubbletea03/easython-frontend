import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLargestHand } from '../src/primaryHand.ts';

const hand = (width: number, height: number) => Array.from({length:21}, (_, i) => ({
  x: .1 + (i % 5) / 4 * width, y: .1 + Math.floor(i / 5) / 4 * height, z: 0,
}));

test('keeps only the largest hand regardless of detector ordering', () => {
  const small = hand(.1, .1), large = hand(.4, .3), wide = hand(.5, .1);
  for (const hands of [[small, large, wide], [large, wide, small]]) {
    const selected = selectLargestHand(hands);
    assert.equal(selected.length, 1);
    assert.equal(selected[0], large);
    assert.equal(hands.length, 3);
  }
});

test('empty, incomplete, invalid and zero-area hands are ignored', () => {
  const valid = hand(.2, .2);
  const invalid = hand(.5, .5); invalid[8].x = NaN;
  assert.deepEqual(selectLargestHand([]), []);
  assert.deepEqual(selectLargestHand([[], valid.slice(0, 8), invalid, hand(0, 0)]), []);
  assert.deepEqual(selectLargestHand([invalid, valid]), [valid]);
});

test('ties keep one hand and a subsequent frame can select a different largest hand', () => {
  const first = hand(.2, .2), second = hand(.2, .2);
  assert.equal(selectLargestHand([first, second])[0], first);
  assert.equal(selectLargestHand([first, hand(.4, .4)])[0]?.[20].y, .5);
  assert.deepEqual(selectLargestHand([]), []);
});
