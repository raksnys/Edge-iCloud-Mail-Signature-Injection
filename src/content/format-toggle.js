/* Runs on www.icloud.com: turns "Format message" on once for every compose window. */
(async function () {
  'use strict';

  const { LOG_PREFIX } = IcsSettings;
  const SCAN_THROTTLE_MS = 150;

  const settings = await IcsSettings.load();
  if (!settings.enableFormat) return;

  // toggle element -> compose key it was last handled for. If the user turns
  // formatting off again we leave it off until a new compose window opens.
  const handled = new WeakMap();
  let scanScheduled = false;

  async function handle(toggle) {
    const key = IcsFormatCore.composeKey(toggle);
    if (handled.get(toggle) === key) return;
    handled.set(toggle, key);
    if (IcsFormatCore.isPressed(toggle)) return;
    const pressed = await IcsFormatCore.activateToggle(toggle);
    if (!pressed) console.warn(LOG_PREFIX, 'Could not switch on "Format message".');
  }

  function scan() {
    scanScheduled = false;
    IcsFormatCore.findFormatToggles(document).forEach((toggle) => {
      handle(toggle).catch((error) => console.error(LOG_PREFIX, 'Format toggle failed.', error));
    });
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(scan, SCAN_THROTTLE_MS);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scan();
})();
