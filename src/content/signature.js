/* Runs inside iCloud's compose editor iframe (www-mail.icloud-sandbox.com): adds the signature. */
(async function () {
  'use strict';

  if (window === window.top) return;

  const { LOG_PREFIX } = IcsSettings;
  const EDITOR_TIMEOUT_MS = 30000;
  const POLL_MS = 250;
  const SETTLE_MS = 400;
  // iCloud loads reply/draft content via setHTML() after the editor mounts,
  // which wipes the body. Until the user starts typing we put the signature back.
  const GUARD_MS = 20000;
  const GUARD_THROTTLE_MS = 100;
  const USER_EDIT_EVENTS = ['keydown', 'beforeinput', 'paste', 'drop', 'cut'];

  const settings = await IcsSettings.load();
  if (!settings.enableSignature || settings.signatureHtml.trim() === '') return;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function currentRoot() {
    const root = IcsSignatureCore.findEditorRoot(document);
    return root && IcsSignatureCore.isEditable(root) ? root : null;
  }

  async function waitForEditor() {
    const deadline = Date.now() + EDITOR_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const root = currentRoot();
      if (root) return root;
      await wait(POLL_MS);
    }
    return null;
  }

  function apply() {
    const root = currentRoot();
    if (!root) return;
    const result = IcsSignatureCore.insertSignature(root, settings.signatureHtml, settings);
    if (result === 'inserted') {
      root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    }
  }

  if (!(await waitForEditor())) return;
  await wait(SETTLE_MS);

  let userEdited = false;
  USER_EDIT_EVENTS.forEach((type) =>
    document.addEventListener(type, (event) => { if (event.isTrusted) userEdited = true; }, { capture: true }),
  );

  const safeApply = () => {
    try {
      apply();
    } catch (error) {
      console.error(LOG_PREFIX, 'Signature injection failed.', error);
    }
  };

  safeApply();

  // Re-apply when iCloud wiped our block or added its own signature late.
  function needsApply(root) {
    const missing = !root.querySelector(IcsSignatureCore.SIGNATURE_SELECTOR);
    const nativeToReplace = settings.replaceNativeSignature && IcsSignatureCore.hasNativeSignature(root);
    return missing || nativeToReplace;
  }

  let checkScheduled = false;
  function check() {
    checkScheduled = false;
    const root = currentRoot();
    if (root && needsApply(root)) safeApply();
  }

  const guard = new MutationObserver(() => {
    if (userEdited) {
      guard.disconnect();
      return;
    }
    if (checkScheduled) return;
    checkScheduled = true;
    setTimeout(check, GUARD_THROTTLE_MS);
  });
  guard.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => guard.disconnect(), GUARD_MS);
})();
