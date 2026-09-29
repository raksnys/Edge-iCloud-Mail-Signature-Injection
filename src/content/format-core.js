/* Finds and switches on iCloud Mail's "Format message" toggle. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.IcsFormatCore = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // English label from the compose toolbar. Other locales fall back to the
  // toolbar position (the only toggle button in .compose-action-toolbar).
  const FORMAT_LABELS = Object.freeze(['Format message']);
  const TOGGLE_TAG = 'ui-toggle-button';
  const TOOLBAR_SELECTOR = '.compose-action-toolbar';
  const VERIFY_DELAY_MS = 600;

  function hasFormatLabel(el) {
    return FORMAT_LABELS.includes(el.getAttribute('aria-label')) || FORMAT_LABELS.includes(el.getAttribute('title'));
  }

  function findFormatToggles(doc) {
    const labelled = Array.from(doc.querySelectorAll(TOGGLE_TAG)).filter(hasFormatLabel);
    if (labelled.length > 0) return labelled;
    return Array.from(doc.querySelectorAll(TOOLBAR_SELECTOR))
      .map((toolbar) => toolbar.querySelectorAll(TOGGLE_TAG))
      .filter((toggles) => toggles.length === 1)
      .map((toggles) => toggles[0]);
  }

  function isPressed(el) {
    return el.getAttribute('aria-pressed') === 'true';
  }

  /** Stable per-compose key: each compose window gets its own editor iframe. */
  function composeKey(toggle) {
    const pane = toggle.closest('.compose-pane');
    const frame = pane && pane.querySelector('iframe');
    return (frame && frame.id) || '';
  }

  function dispatchPointerSequence(el) {
    const view = el.ownerDocument.defaultView;
    const PointerCtor = view.PointerEvent || view.MouseEvent;
    const init = { bubbles: true, cancelable: true, composed: true, view, button: 0 };
    el.dispatchEvent(new PointerCtor('pointerdown', init));
    el.dispatchEvent(new view.MouseEvent('mousedown', init));
    el.dispatchEvent(new PointerCtor('pointerup', init));
    el.dispatchEvent(new view.MouseEvent('mouseup', init));
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Clicks the toggle; if the app ignored a synthetic click, retries once with
   * pointer/mouse events (no click, so a late-updating click handler can't double-toggle).
   * Resolves to whether the toggle ended up pressed.
   */
  async function activateToggle(el, { verifyDelayMs = VERIFY_DELAY_MS } = {}) {
    if (isPressed(el)) return true;
    el.click();
    await wait(verifyDelayMs);
    if (isPressed(el)) return true;
    dispatchPointerSequence(el);
    await wait(verifyDelayMs);
    return isPressed(el);
  }

  return { FORMAT_LABELS, findFormatToggles, isPressed, composeKey, activateToggle };
});
