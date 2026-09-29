/* DOM logic for placing an HTML signature inside iCloud Mail's Squire editor. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.IcsSignatureCore = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const SIGNATURE_CLASS = 'ics-signature';
  // Second marker: iCloud's sanitizer keeps data-* attributes even if it drops classes.
  const SIGNATURE_DATA_ATTR = 'data-ics-signature';
  const SIGNATURE_SELECTOR = `.${SIGNATURE_CLASS}, [${SIGNATURE_DATA_ATTR}]`;
  // iCloud's own (plain-text) signature block, see removeSignature() in mail2-rte.
  const NATIVE_SIGNATURE_SELECTOR = '.x-apple-signature';
  const BLOCKED_TAGS = Object.freeze([
    'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta',
    'base', 'form', 'input', 'button', 'textarea', 'select', 'noscript', 'template', 'svg', 'math',
  ]);
  const URL_ATTRIBUTES = Object.freeze(['href', 'src', 'action', 'formaction', 'xlink:href', 'background', 'poster']);
  const UNSAFE_URL = /^(javascript|vbscript|data):/i;
  const SAFE_IMAGE_DATA_URL = /^data:image\/(png|gif|jpe?g|webp);base64,/i;
  // "On 1 Jan 2026, at 10:00, Someone wrote:" -- the line right above a quote.
  const ATTRIBUTION_LINE = /:\s*$/;
  const MIN_TEXT_MATCH_LENGTH = 8;

  function isUnsafeUrl(tagName, attrName, value) {
    const compact = value.replace(/[\u0000- ]/g, '');
    if (!UNSAFE_URL.test(compact)) return false;
    return !(tagName === 'IMG' && attrName === 'src' && SAFE_IMAGE_DATA_URL.test(compact));
  }

  function cleanAttributes(el) {
    Array.from(el.attributes).forEach(({ name, value }) => {
      const lower = name.toLowerCase();
      const isHandler = lower.startsWith('on') || lower === 'srcdoc';
      if (isHandler || (URL_ATTRIBUTES.includes(lower) && isUnsafeUrl(el.tagName, lower, value))) {
        el.removeAttribute(name);
      }
    });
  }

  /** Parses signature HTML inertly and returns a cleaned fragment owned by targetDoc. */
  function sanitizeSignature(html, targetDoc) {
    const scratch = targetDoc.implementation.createHTMLDocument('');
    scratch.body.innerHTML = typeof html === 'string' ? html : '';
    scratch.body.querySelectorAll(BLOCKED_TAGS.join(',')).forEach((el) => el.remove());
    scratch.body.querySelectorAll('*').forEach(cleanAttributes);
    const fragment = targetDoc.createDocumentFragment();
    Array.from(scratch.body.childNodes).forEach((node) => fragment.appendChild(targetDoc.importNode(node, true)));
    return fragment;
  }

  function hasVisibleContent(node) {
    return node.textContent.trim() !== '' || Boolean(node.querySelector && node.querySelector('img'));
  }

  const normalizeText = (text) => text.replace(/\s+/g, ' ').trim();

  function isPasteHelper(el) {
    const view = el.ownerDocument.defaultView;
    return view.getComputedStyle(el).position === 'fixed';
  }

  /** The Squire root: top-most editable element, skipping Squire's 1px fixed paste helper. */
  function findEditorRoot(doc) {
    return (
      Array.from(doc.querySelectorAll('[contenteditable="true"]')).find(
        (el) => !(el.parentElement && el.parentElement.closest('[contenteditable="true"]')) && !isPasteHelper(el),
      ) || null
    );
  }

  function isEditable(root) {
    return root.getAttribute('contenteditable') === 'true';
  }

  function isOutsideQuote(el) {
    return !el.closest('blockquote');
  }

  function findNativeSignatures(root) {
    return Array.from(root.querySelectorAll(NATIVE_SIGNATURE_SELECTOR)).filter(isOutsideQuote);
  }

  /** What the user is writing, i.e. everything except quoted messages. */
  function unquotedContent(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('blockquote').forEach((el) => el.remove());
    return clone;
  }

  const imageSources = (node) =>
    Array.from(node.querySelectorAll('img[src]')).map((img) => img.getAttribute('src'));

  /** True if the signature is already in the message (marker, or same text / images outside quotes). */
  function hasSignature(root, signature) {
    if (root.querySelector(SIGNATURE_SELECTOR)) return true;
    const unquoted = unquotedContent(root);
    const needle = normalizeText(signature.textContent);
    if (needle.length >= MIN_TEXT_MATCH_LENGTH) return normalizeText(unquoted.textContent).includes(needle);
    const wanted = imageSources(signature);
    const existing = new Set(imageSources(unquoted));
    return wanted.length > 0 && wanted.every((src) => existing.has(src));
  }

  function hasNativeSignature(root) {
    return findNativeSignatures(root).length > 0;
  }

  function isReply(root) {
    return Boolean(root.querySelector('blockquote'));
  }

  function topLevelAncestor(root, el) {
    let current = el;
    while (current.parentNode && current.parentNode !== root) current = current.parentNode;
    return current;
  }

  /** Node to insert the signature before; null means "append at the end". */
  function findInsertionAnchor(root) {
    const [native] = findNativeSignatures(root);
    if (native) return topLevelAncestor(root, native);
    const quote = root.querySelector('blockquote');
    if (!quote) return null;
    const container = topLevelAncestor(root, quote);
    const previous = container.previousElementSibling;
    const hasAttribution = previous && !previous.querySelector('blockquote') && ATTRIBUTION_LINE.test(previous.textContent.trim());
    return hasAttribution ? previous : container;
  }

  function createEmptyLine(doc) {
    const line = doc.createElement('div');
    line.appendChild(doc.createElement('br'));
    return line;
  }

  function createSignatureBlock(doc, content) {
    const block = doc.createElement('div');
    block.className = SIGNATURE_CLASS;
    block.setAttribute(SIGNATURE_DATA_ATTR, '');
    block.appendChild(content);
    return block;
  }

  /**
   * Inserts the signature into the editor root.
   * Returns 'inserted' | 'present' | 'skipped-reply' | 'empty'.
   */
  function insertSignature(root, signatureHtml, options) {
    const doc = root.ownerDocument;
    const content = sanitizeSignature(signatureHtml, doc);
    if (!hasVisibleContent(content)) return 'empty';
    // Checked before touching iCloud's signature, so a skipped reply keeps it.
    if (isReply(root) && !options.includeInReplies) return 'skipped-reply';
    if (options.replaceNativeSignature) findNativeSignatures(root).forEach((el) => el.remove());
    if (hasSignature(root, content)) return 'present';

    const anchor = findInsertionAnchor(root);
    const writingLine = root.firstElementChild ? [] : [createEmptyLine(doc)];
    const trailing = anchor ? [createEmptyLine(doc)] : [];
    const nodes = [...writingLine, createEmptyLine(doc), createSignatureBlock(doc, content), ...trailing];
    nodes.forEach((node) => root.insertBefore(node, anchor));
    return 'inserted';
  }

  return {
    SIGNATURE_CLASS,
    SIGNATURE_SELECTOR,
    sanitizeSignature,
    hasNativeSignature,
    hasVisibleContent,
    findEditorRoot,
    isEditable,
    hasSignature,
    isReply,
    findInsertionAnchor,
    insertSignature,
  };
});
