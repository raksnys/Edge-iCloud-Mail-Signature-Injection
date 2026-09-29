# iCloud Mail Format & Signature (Edge extension)

On icloud.com/mail, every new compose window gets:

1. **Format message** switched on (once per compose window; if you turn it off yourself it stays off).
2. **Your HTML signature** added to the body: below your writing line on new messages, and above the
   quoted text (and the "On …, X wrote:" line) on replies/forwards.

## Install (unpacked)

1. `edge://extensions` → turn on **Developer mode**.
2. **Load unpacked** → pick this folder.
3. The settings page opens. Paste your signature HTML, check the preview, **Save** (or Ctrl+S).
   Click the toolbar icon to open settings again.
4. Reload the iCloud Mail tab.

## How it works

| File | Runs in | Job |
|---|---|---|
| `src/content/format-toggle.js` + `format-core.js` | `www.icloud.com` | Finds `ui-toggle-button[aria-label="Format message"]` (or, in other languages, the only toggle in `.compose-action-toolbar`) and clicks it when `aria-pressed="false"`. |
| `src/content/signature.js` + `signature-core.js` | the editor iframe `www-mail.icloud-sandbox.com/applications/mail2-rte/…` | Finds iCloud's Squire editor (`[contenteditable="true"]`) and inserts `<div class="ics-signature">…</div>`. |
| `src/options/*` | settings page | Edit/preview the signature, stored in `chrome.storage.local`. |

Details worth knowing:

- iCloud fills reply and draft bodies **after** the editor appears, which wipes the editor. For 20 s,
  or until you first type, the script puts the signature back if it disappears.
- It won't add a second copy. It checks for its own block (`.ics-signature` / `data-ics-signature`), and also
  for your signature's text (or images, for image-only signatures) outside quoted messages, so reopened
  drafts don't get another one. The same 20 s check also removes an iCloud signature that shows up late.
- **Replace iCloud's built-in signature** (on by default) removes iCloud's own `.x-apple-signature` block so
  you don't end up with two. You can also just clear the signature in iCloud Mail → Settings → Composing.
- The signature HTML is sanitized before insertion: scripts, forms, iframes, `on*` handlers and
  `javascript:`/`data:` URLs are removed. Base64 `data:image/*` images are allowed.
- Images: prefer `https://` URLs. Base64 images work but make every email bigger.

## Development

```sh
npm install
npm test          # node:test + jsdom
npm run coverage
npm run package   # builds icloud-mail-signature.zip
```

If iCloud changes its markup, the selectors to update are in `src/content/format-core.js`
(`FORMAT_LABELS`, `TOOLBAR_SELECTOR`) and `src/content/signature-core.js` (`findEditorRoot`,
`NATIVE_SIGNATURE_SELECTOR`). Both content scripts log with the `[iCloud Signature]` prefix.
