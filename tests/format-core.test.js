const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const core = require('../src/content/format-core.js');

// Trimmed-down copy of iCloud's compose markup.
function compose({ label = 'Format message', pressed = 'false', frameId = 'frame-1' } = {}) {
  const { document } = new JSDOM(`
    <div class="compose-pane">
      <div class="compose-action-toolbar">
        <ui-button title="Undo"></ui-button>
        <div><ui-toggle-button title="${label}" aria-label="${label}" aria-pressed="${pressed}"></ui-toggle-button></div>
      </div>
      <iframe id="${frameId}"></iframe>
    </div>`).window;
  return { document, toggle: document.querySelector('ui-toggle-button') };
}

const flip = (el) => el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));

test('finds the toggle by its English label', () => {
  const { document, toggle } = compose();
  assert.deepEqual(core.findFormatToggles(document), [toggle]);
});

test('finds the toggle by toolbar position in other locales', () => {
  const { document, toggle } = compose({ label: 'Formatuoti laišką' });
  assert.deepEqual(core.findFormatToggles(document), [toggle]);
});

test('positional fallback is not used when a labelled toggle exists', () => {
  const { document, toggle } = compose();
  const other = new JSDOM('<div class="compose-action-toolbar"><ui-toggle-button title="Other"></ui-toggle-button></div>')
    .window.document.body.firstElementChild;
  document.body.appendChild(document.importNode(other, true));
  assert.deepEqual(core.findFormatToggles(document), [toggle]);
});

test('ignores toolbars with several toggle buttons when no label matches', () => {
  const { document } = compose({ label: 'Other' });
  const extra = document.createElement('ui-toggle-button');
  document.querySelector('.compose-action-toolbar').appendChild(extra);
  assert.deepEqual(core.findFormatToggles(document), []);
});

test('isPressed reads aria-pressed', () => {
  assert.equal(core.isPressed(compose({ pressed: 'true' }).toggle), true);
  assert.equal(core.isPressed(compose().toggle), false);
});

test('composeKey is the compose editor iframe id', () => {
  assert.equal(core.composeKey(compose({ frameId: 'abc' }).toggle), 'abc');
  const { document } = new JSDOM('<ui-toggle-button></ui-toggle-button>').window;
  assert.equal(core.composeKey(document.querySelector('ui-toggle-button')), '');
});

test('activateToggle does nothing when already on', async () => {
  const { toggle } = compose({ pressed: 'true' });
  let clicks = 0;
  toggle.addEventListener('click', () => clicks++);
  assert.equal(await core.activateToggle(toggle, { verifyDelayMs: 0 }), true);
  assert.equal(clicks, 0);
});

test('activateToggle turns it on with a click', async () => {
  const { toggle } = compose();
  let pointerEvents = 0;
  toggle.addEventListener('click', () => flip(toggle));
  toggle.addEventListener('mousedown', () => pointerEvents++);
  assert.equal(await core.activateToggle(toggle, { verifyDelayMs: 0 }), true);
  assert.equal(pointerEvents, 0);
});

test('activateToggle falls back to pointer events when click is ignored', async () => {
  const { toggle } = compose();
  toggle.addEventListener('mouseup', () => flip(toggle));
  assert.equal(await core.activateToggle(toggle, { verifyDelayMs: 0 }), true);
});

test('activateToggle reports failure when nothing works', async () => {
  const { toggle } = compose();
  assert.equal(await core.activateToggle(toggle, { verifyDelayMs: 0 }), false);
});
