import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canShareImage, shareImage } from './captureShare.js';

test('image sharing uses the system share only when the file and gesture are allowed', async () => {
  const file = { name: 'temple.png' };
  let shared;
  const nav = { canShare: (d) => d.files[0] === file, share: async (d) => { shared = d; }, userActivation: { isActive: true } };
  assert.equal(await shareImage(file, nav), 'shared');
  assert.deepEqual(shared.files, [file]);
  nav.userActivation.isActive = false;
  shared = null;
  assert.equal(await shareImage(file, nav), 'activation-required');
  assert.equal(shared, null);
  assert.equal(canShareImage(file, { share() {}, canShare() { throw Error('unsupported'); } }), false);
});

test('cancelling or failing the system share does not report a save', async () => {
  const file = {};
  const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error(), { name: 'AbortError' }); } };
  assert.equal(await shareImage(file, nav), 'cancelled');
  nav.share = async () => { throw new Error('blocked'); };
  assert.equal(await shareImage(file, nav), 'unavailable');
  assert.equal(await shareImage(file, {}), 'unavailable');
});
