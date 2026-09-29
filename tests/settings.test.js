const { test } = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../src/shared/settings.js');

function memoryStorage(initial = {}) {
  let data = { ...initial };
  return {
    async get(defaults) { return { ...defaults, ...data }; },
    async set(values) { data = { ...data, ...values }; },
    dump: () => data,
  };
}

test('normalize fills defaults and rejects wrong types', () => {
  assert.deepEqual(settings.normalize(null), { ...settings.DEFAULT_SETTINGS });
  const result = settings.normalize({ enableFormat: 'yes', includeInReplies: false, signatureHtml: 42, extra: 1 });
  assert.equal(result.enableFormat, true);
  assert.equal(result.includeInReplies, false);
  assert.equal(result.signatureHtml, '');
  assert.equal('extra' in result, false);
});

test('load returns stored values', async () => {
  const loaded = await settings.load(memoryStorage({ signatureHtml: '<b>x</b>', enableFormat: false }));
  assert.equal(loaded.signatureHtml, '<b>x</b>');
  assert.equal(loaded.enableFormat, false);
});

test('load falls back to defaults when storage throws', async (t) => {
  t.mock.method(console, 'error', () => {});
  const broken = { get: async () => { throw new Error('boom'); } };
  assert.deepEqual(await settings.load(broken), { ...settings.DEFAULT_SETTINGS });
  assert.equal(console.error.mock.callCount(), 1);
});

test('save merges, validates and persists', async () => {
  const storage = memoryStorage({ enableFormat: false });
  const saved = await settings.save({ signatureHtml: '<i>sig</i>', includeInReplies: 'nope' }, storage);
  assert.equal(saved.enableFormat, false);
  assert.equal(saved.signatureHtml, '<i>sig</i>');
  assert.equal(saved.includeInReplies, true);
  assert.deepEqual(storage.dump(), saved);
});
