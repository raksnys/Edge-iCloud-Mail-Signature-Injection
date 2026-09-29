/* Settings page: edit the signature HTML, preview it, and save to chrome.storage. */
(async function () {
  'use strict';

  const BOOLEAN_FIELDS = ['enableFormat', 'enableSignature', 'includeInReplies', 'replaceNativeSignature'];
  const STATUS_CLEAR_MS = 2500;

  const $ = (id) => document.getElementById(id);
  const signatureInput = $('signatureHtml');
  const preview = $('preview');
  const status = $('status');
  let statusTimer = null;

  function showStatus(message, kind) {
    clearTimeout(statusTimer);
    status.textContent = message;
    status.className = kind;
    statusTimer = setTimeout(() => { status.textContent = ''; }, STATUS_CLEAR_MS);
  }

  // Preview exactly what gets inserted into the email (sanitized), in a script-less sandbox.
  function renderPreview() {
    const holder = document.createElement('div');
    holder.appendChild(IcsSignatureCore.sanitizeSignature(signatureInput.value, document));
    preview.srcdoc = `<!doctype html><meta charset="utf-8"><body style="font:14px -apple-system,'Segoe UI',sans-serif;margin:12px">${holder.innerHTML}</body>`;
  }

  function readForm() {
    const booleans = Object.fromEntries(BOOLEAN_FIELDS.map((key) => [key, $(key).checked]));
    return { ...booleans, signatureHtml: signatureInput.value };
  }

  function fillForm(settings) {
    BOOLEAN_FIELDS.forEach((key) => { $(key).checked = settings[key]; });
    signatureInput.value = settings.signatureHtml;
    renderPreview();
  }

  async function onSave() {
    try {
      fillForm(await IcsSettings.save(readForm()));
      showStatus('Saved. Reload the iCloud Mail tab to apply.', 'ok');
    } catch (error) {
      console.error(IcsSettings.LOG_PREFIX, 'Saving settings failed.', error);
      showStatus(`Could not save: ${error.message}`, 'error');
    }
  }

  signatureInput.addEventListener('input', renderPreview);
  $('save').addEventListener('click', onSave);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onSave();
    }
  });

  fillForm(await IcsSettings.load());
})();
