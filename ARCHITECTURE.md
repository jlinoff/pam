# PAM Architecture

This document describes the structure of the PAM codebase for contributors.

---

## Overview

PAM is a single-page web application written in vanilla JavaScript using ES modules. There is no build step, no bundler, and no npm runtime dependencies. The browser loads `www/index.html`, which pulls in `main.js` as an ES module, which in turn imports everything else.

```
www/
├── index.html          # entry point — loads main.js
├── js/                 # ES modules
├── css/                # bootstrap + custom styles
├── font/               # bootstrap icons
├── icons/              # SVG icons (black and blue variants)
├── help/               # generated help page (from README.md via pandoc)
└── examples/           # example PAM files for new users to practice with
```

---

## Module map

Each module has a single responsibility. The diagram below shows which modules import which (arrows point from importer to importee).

```
main.js
├── lib.js              (x* prototype chaining API)
├── utils.js            (shared helpers: icon, clog, hide, show, clipboard, theme)
├── status.js           (status bar messages)
├── prefs.js            (preferences model + UI)
│   ├── prefs-model.js  (pure data: getDefaultPrefs, VALID_FIELD_TYPES, hashPrefsPassword)
│   ├── field.js        (record field rendering + editing)
│   ├── save.js         (file save)
│   ├── load.js         (file load)
│   └── main.js         ← circular (updateHtmlRenderingIndicator)
├── menu.js             (menu construction + dialog orchestration)
│   ├── prefs.js
│   ├── field.js
│   ├── save.js
│   └── load.js
├── search.js           (search/filter logic)
├── password.js         (password generation + file-pass caching)
├── about.js            (About dialog)
├── print.js            (print records)
├── raw.js              (raw JSON edit mode)
└── en_words.js         (word list for memorable passwords)
```

**Note on the circular dependency:** `prefs.js` imports `updateHtmlRenderingIndicator` from `main.js`, and `main.js` imports from `prefs.js`. This works because ES modules handle circular imports by providing the already-evaluated exports at the point of use. The reference will be resolved in a future phase by moving `updateHtmlRenderingIndicator` out of `main.js`.

---

## The `x*` prototype chaining API (`lib.js`)

`lib.js` extends `HTMLDocument` and `Element` with convenience methods prefixed with `x`. They are installed by calling `enableFunctionChaining()` once at startup in `main.js`.

The pattern exists because the native DOM API is verbose and does not support method chaining. Compare:

```javascript
// Native DOM — 7 statements, no chaining
const btn = document.createElement('button')
btn.classList.add('btn', 'btn-primary')
btn.id = 'save-btn'
btn.setAttribute('type', 'button')
btn.setAttribute('title', 'save the record')
btn.addEventListener('click', handler)
parent.appendChild(btn)

// x* API — one expression
xmk('button')
    .xClass('btn', 'btn-primary')
    .xId('save-btn')
    .xAttrs({ type: 'button', title: 'save the record' })
    .xAddEventListener('click', handler)
    .xAppendToParent(parent)
```

### Full API reference

| Method | Description |
|--------|-------------|
| `xmk(tag)` | Create a new element. Shorthand for `document.createElement`. |
| `.xClass(...names)` | Add one or more CSS classes. |
| `.xRemoveClass(...names)` | Remove one or more CSS classes. |
| `.xId(id)` | Set the element id. |
| `.xAttr(name, value)` | Set a single attribute. |
| `.xAttrs({key: value, ...})` | Set multiple attributes at once. |
| `.xAttrNS(ns, name, value)` | Set a namespaced attribute. |
| `.xAttrIfTrue(name, value, flag)` | Set attribute only if `flag` is truthy. |
| `.xStyle({prop: value, ...})` | Set multiple inline styles at once. |
| `.xInnerHTML(html)` | Set `innerHTML`. |
| `.xInnerText(text)` | Set `innerText`. |
| `.xTextContent(text)` | Set `textContent`. |
| `.xTooltip(text)` | Set the `title` attribute (browser tooltip). |
| `.xAddEventListener(event, fn)` | Add an event listener. |
| `.xAppend(...children)` | Append one or more children. (`xAppendChild` is an alias.) |
| `.xPrepend(...children)` | Prepend one or more children. (`xPrependChild` is an alias.) |
| `.xAppendToParent(parent)` | Append this element to a given parent. |
| `.xRemoveChildren()` | Remove all child nodes. |
| `.xGet(selector)` | `querySelector` scoped to this element. |
| `.xGetN(selector)` | `querySelectorAll` scoped to this element (returns array). |
| `.xGetNthParent(n)` | Walk up n levels and return that ancestor. |
| `.xGetParentWithClass(...classes)` | Walk up until an ancestor with the given class(es) is found. |
| `.xGetParentOfType(...tags)` | Walk up until an ancestor of the given tag type is found. |

All methods return `this` to enable chaining, except `xGet`, `xGetN`, and the parent-traversal methods which return the found element(s).

---

## Data model

### Records and fields

The in-memory data model lives entirely in the DOM. There is no separate JavaScript data store. Each record is a Bootstrap accordion item:

```
.accordion-item
  .accordion-button              ← title; x-active attribute tracks active/inactive state
  .accordion-collapse
    .accordion-body
      .row  (one per field)
        .x-fld-name              ← field name (div)
        .x-fld-value             ← field value (div); carries data-fld-type and
                                   data-fld-raw-value attributes
```

When saving, `convertInternalDataToJSON()` in `save.js` walks this DOM structure and serialises it to JSON. When loading, `load.js` reconstructs the DOM from the JSON.

### Field types

Defined in `prefs-model.js` as `VALID_FIELD_TYPES`:

| Type | How it renders |
|------|----------------|
| `text` | Plain text |
| `password` | Masked (`****`), with show/hide and generate buttons |
| `url` | Clickable link |
| `email` | Plain text |
| `phone` | Plain text |
| `datetime-local` | Plain text |
| `time` | Plain text |
| `textarea` | Monospace pre-formatted block |
| `html` | Escaped text with `</>` badge by default; live HTML when `allowHtmlFieldRendering` is enabled (see `SECURITY.md` SEC-001) |

### Preferences

Preferences are stored in `window.prefs`, initialised by `initPrefs()` in `prefs.js` using `getDefaultPrefs()` from `prefs-model.js`. When a file is saved, `window.prefs` is serialised into the JSON alongside the records. When a file is loaded, the saved prefs overwrite `window.prefs`.

The defaults are the canonical reference for what preferences exist and what their safe values are. See `prefs-model.js:getDefaultPrefs()`.

---

## File format

PAM files are UTF-8 text. Without a master password they are plain JSON. With a password the JSON is encrypted with AES-256-CBC, PBKDF2-SHA-256 key derivation, and Base64-encoded.

**v1 format (current):** Base64 ciphertext stored directly. The first character `{` distinguishes plaintext from ciphertext (Base64 output never starts with `{`).

**v2 format (planned, v1.3):** Will use a `PAMv2` header prefix and a corrected key-derivation implementation. See `SECURITY.md` SEC-003/SEC-004 for the v1 weaknesses.

---

## Save mechanism

`save.js` provides two save paths, dispatched by `saveCallback()`:

**Anchor download** (active): creates a hidden `<a download>` element with a `data:` URI and programmatically clicks it. Works reliably across all browsers including mobile.

**File System Access API** (`showSaveFilePicker`): shows a native save dialog. More user-friendly but not yet reliable on mobile browsers. Implemented in `saveUsingPromises()` and available but currently disabled in `saveCallback()`.

---

## Testing

### Unit tests

`www/tests/tests.html` is a vanilla JS test runner that imports modules directly and runs in the browser. It is driven by `tests/test_unit.py` (Selenium + ChromeDriver).

```bash
make unit-test
```

### End-to-end tests

`tests/test_chrome.py` drives the full app in headless Chrome via Selenium.

```bash
make e2e-test
```

### Both

```bash
make test   # lint + unit + e2e
```

---

## Conventions

**No build step.** All JS is plain ES modules served directly.

**No new npm runtime dependencies.** The Shai-Hulud supply chain incident (Sept–Nov 2025, 500–796 packages compromised) established this as a hard constraint for all phases.

**pylint 10.00/10** on all Python files, enforced by `make lint`.

**jshint clean** on all JS files under `www/`, enforced by `make lint`.

**TDD throughout.** Tests are written before implementations in every phase. A failing test documents the intended behaviour; a passing test locks it in.

**One branch per phase.** Branches are named `phase/NN-description`. Merges to `main` use `--no-ff`.

---

## Development process

The v1.3 security and simplification rewrite (phases 0–9, April 2026) was
conducted as a structured pair-programming collaboration with
[Claude](https://claude.ai) (Anthropic). Claude produced diffs, tests, and
documentation; Joe Linoff reviewed every diff, ran every test, caught design
issues, and made all architectural decisions. The code and the judgement are
Joe's — Claude was the fast typist who knew a lot of things.

The methodology throughout: one branch per phase, tests written before
implementations, pre-registered hypotheses for any speculative work, and a
living `PLAN.md` tracking decisions and rationale. See `PLAN.md` for the full
session log.
