/* Extension settings: defaults, validation and chrome.storage access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.IcsSettings = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const LOG_PREFIX = '[iCloud Signature]';

  const DEFAULT_SETTINGS = Object.freeze({
    enableFormat: true,
    enableSignature: true,
    includeInReplies: true,
    replaceNativeSignature: true,
    signatureHtml: '',
  });

  const BOOLEAN_KEYS = Object.freeze([
    'enableFormat',
    'enableSignature',
    'includeInReplies',
    'replaceNativeSignature',
  ]);

  /** Returns a fresh, fully-typed settings object; bad or missing values fall back to defaults. */
  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const booleans = Object.fromEntries(
      BOOLEAN_KEYS.map((key) => [
        key,
        typeof source[key] === 'boolean' ? source[key] : DEFAULT_SETTINGS[key],
      ]),
    );
    const signatureHtml =
      typeof source.signatureHtml === 'string' ? source.signatureHtml : DEFAULT_SETTINGS.signatureHtml;
    return { ...booleans, signatureHtml };
  }

  async function load(storage = chrome.storage.local) {
    try {
      return normalize(await storage.get(DEFAULT_SETTINGS));
    } catch (error) {
      console.error(LOG_PREFIX, 'Could not load settings, using defaults.', error);
      return normalize({});
    }
  }

  async function save(partial, storage = chrome.storage.local) {
    const current = await load(storage);
    const next = normalize({ ...current, ...partial });
    await storage.set(next);
    return next;
  }

  return { DEFAULT_SETTINGS, LOG_PREFIX, normalize, load, save };
});
