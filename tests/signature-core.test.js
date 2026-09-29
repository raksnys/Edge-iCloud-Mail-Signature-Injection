const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const core = require('../src/content/signature-core.js');

const SIGNATURE = '<div>--</div><div><b>Dovydas Test</b></div><div><a href="https://raksnys.lt">raksnys.lt</a></div>';
const OPTIONS = { includeInReplies: true, replaceNativeSignature: true };

function editor(bodyHtml) {
  const { document } = new JSDOM(
    `<body><div contenteditable="true" id="root">${bodyHtml}</div>` +
      '<div contenteditable="true" style="position:fixed; top:0; right:100%; width:1px; height:1px;"></div></body>',
  ).window;
  return { document, root: document.getElementById('root') };
}

const childSummary = (root) =>
  Array.from(root.children).map((el) => (el.className || el.tagName.toLowerCase()) + ':' + el.textContent.trim());

test('sanitizeSignature strips scripts, handlers and javascript: URLs but keeps formatting', () => {
  const { document } = new JSDOM('').window;
  const html =
    '<b onclick="x()">Hi</b><script>alert(1)</script><a href=" javascript:alert(1)">bad</a>' +
    '<a href="https://ok.example">ok</a><img src="data:image/png;base64,AAAA"><img src="data:text/html,x">' +
    '<iframe srcdoc="x"></iframe><span style="color:red">red</span>';
  const holder = document.createElement('div');
  holder.appendChild(core.sanitizeSignature(html, document));

  assert.equal(holder.querySelector('script'), null);
  assert.equal(holder.querySelector('iframe'), null);
  assert.equal(holder.querySelector('b').hasAttribute('onclick'), false);
  const [bad, ok] = holder.querySelectorAll('a');
  assert.equal(bad.hasAttribute('href'), false);
  assert.equal(ok.getAttribute('href'), 'https://ok.example');
  const [pngImg, htmlImg] = holder.querySelectorAll('img');
  assert.equal(pngImg.getAttribute('src'), 'data:image/png;base64,AAAA');
  assert.equal(htmlImg.hasAttribute('src'), false);
  assert.equal(holder.querySelector('span').getAttribute('style'), 'color:red');
});

test('sanitizeSignature tolerates non-string input', () => {
  const { document } = new JSDOM('').window;
  assert.equal(core.sanitizeSignature(undefined, document).childNodes.length, 0);
});

test('findEditorRoot picks the Squire root, not nested or fixed helper editables', () => {
  const { document, root } = editor('<span contenteditable="false">mention</span>');
  assert.equal(core.findEditorRoot(document), root);
  assert.equal(core.isEditable(root), true);
  root.setAttribute('contenteditable', 'false');
  assert.equal(core.isEditable(root), false);
  assert.equal(core.findEditorRoot(document), null);
});

test('findEditorRoot skips a paste helper positioned by a stylesheet even when it comes first', () => {
  const { document } = new JSDOM(
    '<style>.helper{position:fixed}</style><div class="helper" contenteditable="true"></div>' +
      '<div id="root" contenteditable="true"></div>',
  ).window;
  assert.equal(core.findEditorRoot(document).id, 'root');
});

test('sanitizeSignature drops svg and math', () => {
  const { document } = new JSDOM('').window;
  const holder = document.createElement('div');
  holder.appendChild(core.sanitizeSignature('<svg><animate attributeName="href" values="javascript:x"/></svg><math></math>ok', document));
  assert.equal(holder.innerHTML, 'ok');
});

test('findEditorRoot returns null without an editor', () => {
  const { document } = new JSDOM('<p>nothing</p>').window;
  assert.equal(core.findEditorRoot(document), null);
});

test('new message: signature goes after the writing line with a blank line between', () => {
  const { root } = editor('<div><br></div>');
  assert.equal(core.insertSignature(root, SIGNATURE, OPTIONS), 'inserted');
  assert.deepEqual(childSummary(root), ['div:', 'div:', `${core.SIGNATURE_CLASS}:--Dovydas Testraksnys.lt`]);
});

test('completely empty editor still gets a line to type on', () => {
  const { root } = editor('');
  core.insertSignature(root, SIGNATURE, OPTIONS);
  assert.deepEqual(childSummary(root).length, 3);
  assert.equal(root.lastElementChild.className, core.SIGNATURE_CLASS);
});

test('reply: signature goes above the attribution line and the quote', () => {
  const { root } = editor(
    '<div><br></div><div>On 1 Jan 2026, at 10:00, Someone wrote:</div><blockquote><div>old</div></blockquote>',
  );
  core.insertSignature(root, SIGNATURE, OPTIONS);
  const summary = childSummary(root);
  assert.equal(summary[2], `${core.SIGNATURE_CLASS}:--Dovydas Testraksnys.lt`);
  assert.equal(summary[4], 'div:On 1 Jan 2026, at 10:00, Someone wrote:');
  assert.equal(summary[5], 'blockquote:old');
});

test('reply without attribution line: signature goes before the quote container', () => {
  const { root } = editor('<div><br></div><div><div>hello</div><blockquote>old</blockquote></div>');
  core.insertSignature(root, SIGNATURE, OPTIONS);
  assert.equal(root.children[2].className, core.SIGNATURE_CLASS);
  assert.ok(root.children[4].querySelector('blockquote'));
});

test('replies are skipped when includeInReplies is off', () => {
  const { root } = editor('<div><br></div><blockquote>old</blockquote>');
  const result = core.insertSignature(root, SIGNATURE, { ...OPTIONS, includeInReplies: false });
  assert.equal(result, 'skipped-reply');
  assert.equal(root.querySelector(`.${core.SIGNATURE_CLASS}`), null);
});

test('a skipped reply keeps iCloud\'s own signature', () => {
  const { root } = editor('<div><br></div><div class="x-apple-signature">Sent from iCloud</div><blockquote>old</blockquote>');
  core.insertSignature(root, SIGNATURE, { ...OPTIONS, includeInReplies: false });
  assert.equal(core.hasNativeSignature(root), true);
});

test('iCloud native signature is replaced by default', () => {
  const { root } = editor('<div><br></div><div class="x-apple-signature">Sent from iCloud</div>');
  core.insertSignature(root, SIGNATURE, OPTIONS);
  assert.equal(root.querySelector('.x-apple-signature'), null);
  assert.ok(root.querySelector(`.${core.SIGNATURE_CLASS}`));
});

test('native signature is kept and ours goes before it when replacement is off', () => {
  const { root } = editor('<div><br></div><div class="x-apple-signature">Sent from iCloud</div>');
  core.insertSignature(root, SIGNATURE, { ...OPTIONS, replaceNativeSignature: false });
  const sig = root.querySelector(`.${core.SIGNATURE_CLASS}`);
  assert.ok(sig.compareDocumentPosition(root.querySelector('.x-apple-signature')) & 4);
});

test('native signature inside a quote is never touched', () => {
  const { root } = editor('<div><br></div><blockquote><div class="x-apple-signature">theirs</div></blockquote>');
  core.insertSignature(root, SIGNATURE, OPTIONS);
  assert.ok(root.querySelector('blockquote .x-apple-signature'));
});

test('does not insert twice (marker class)', () => {
  const { root } = editor('<div><br></div>');
  core.insertSignature(root, SIGNATURE, OPTIONS);
  assert.equal(core.insertSignature(root, SIGNATURE, OPTIONS), 'present');
  assert.equal(root.querySelectorAll(`.${core.SIGNATURE_CLASS}`).length, 1);
});

test('data attribute alone marks the signature as present (class stripped by iCloud)', () => {
  const { root } = editor('<div><br></div><div data-ics-signature="">x</div>');
  assert.equal(core.insertSignature(root, SIGNATURE, OPTIONS), 'present');
});

test('image-only signature is not duplicated in a reopened draft', () => {
  const logo = '<img src="https://x.example/logo.png">';
  const { root } = editor(`<div>hi</div><div>${logo}</div>`);
  assert.equal(core.insertSignature(root, logo, OPTIONS), 'present');
});

test('does not insert when the signature text is already in a draft (class stripped)', () => {
  const { root } = editor('<div>hi</div><div>--</div><div><b>Dovydas Test</b></div><div>raksnys.lt</div>');
  assert.equal(core.insertSignature(root, SIGNATURE, OPTIONS), 'present');
});

test('quoted copy of my own signature does not count as present', () => {
  const { root } = editor('<div><br></div><blockquote><div>--</div><div>Dovydas Test</div><div>raksnys.lt</div></blockquote>');
  assert.equal(core.insertSignature(root, SIGNATURE, OPTIONS), 'inserted');
});

test('empty or whitespace-only signature is not inserted; image-only signature is', () => {
  const { root } = editor('<div><br></div>');
  assert.equal(core.insertSignature(root, '  <div> </div> ', OPTIONS), 'empty');
  assert.equal(core.insertSignature(root, '<img src="https://x.example/logo.png">', OPTIONS), 'inserted');
});
