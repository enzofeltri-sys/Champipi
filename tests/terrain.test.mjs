import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slopeAspect, offsets } from '../site/js/terrain.js';

test('exposition : le terrain descend vers…', () => {
  assert.deepEqual(slopeAspect({ n: 480, s: 520, e: 500, o: 500 }), { slope: 27, aspect: 'N' });   // plus bas au nord
  assert.equal(slopeAspect({ n: 500, s: 500, e: 520, o: 480 }).aspect, 'O');
  assert.equal(slopeAspect({ n: 520, s: 480, e: 480, o: 520 }).aspect, 'SE');
  assert.deepEqual(slopeAspect({ n: 500, s: 501, e: 500, o: 500 }), { slope: 1, aspect: 'plat' });
  const d = offsets(43.5); assert.ok(Math.abs(d.dlat * 111320 - 40) < 0.01 && d.dlon > d.dlat);
});
