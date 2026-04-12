# PAM Rewrite — Project Plan

**Project:** [jlinoff/pam](https://github.com/jlinoff/pam)  
**Version at time of audit:** 1.2.5 (commit 75904b3, 2025-09-10)  
**Plan version:** 1.1 (full review pass: structural fixes, SIMP-004/DOC-002 linkage, about.js/print.js coverage, load.js extraction, breaking change strategy text corrected, Open Question 3 resolved)  
**Collaboration model:** Option B — file uploads per session, changes returned as files/diffs, committed by Joe

---

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Security audit and fixes | High |
| 2 | Simplify | Medium |
| 3 | Improve portability | Medium |
| 4 | Improve user flow | Medium |
| 5 | Improve documentation | Low–Medium |
| 6 | Test harness (~75% coverage) | High |

---

## Breaking Change Classification

### Definitions

| Label | Meaning |
|-------|---------|
| 🟢 **Benevolent** | Safe to ship at any time. No user action required. Existing encrypted files load and save without issue. |
| 🟡 **Benevolent with caveat** | No file format change, but alters default behavior or UX in a way users may notice. Existing files unaffected. |
| 🔴 **Breaking** | Changes the encrypted file format or key derivation. Existing encrypted files will **fail to decrypt** after this change unless a migration path is provided. Requires a file format version bump and a re-encryption workflow. |

### Breaking change strategy
The two 🔴 breaking changes (SEC-003, SEC-004) are both in `crypt.js` and both affect key derivation — they must move as a unit. Rather than a hard cutover, they are introduced via a phased three-release migration that gives users full control over when their files upgrade:

- **v1.3:** Both encrypt/decrypt paths implemented; v1 is the default; users who want v2 can opt in via Preferences
- **v1.4:** v2 becomes the default; a non-blocking dismissable banner nudges v1 file owners
- **v2.0:** v1 encrypt removed; v1 decrypt retained permanently; no existing file ever becomes unreadable

All 🟢 and 🟡 changes ship in v1.3 independently of the crypto phasing. See the Release Plan section for full detail.

---

## Consolidated Finding Impact Table

| ID | Area | Severity | Breaking? | Summary |
|----|------|----------|-----------|---------|
| SEC-001 | Security | HIGH | 🟢 Benevolent | XSS via `html` field — keep feature; disable by default; gate on prefs password; add persistent indicator |
| SEC-002 | Security | MEDIUM | 🟡 Benevolent w/ caveat | `localStorage` default for master password — change default only |
| SEC-003 | Security | MEDIUM | 🔴 Breaking | PBKDF2 iteration count too low — changing it re-derives a different key |
| SEC-004 | Security | MEDIUM | 🔴 Breaking | Salt entropy bug — fixing changes key derivation for all existing files |
| SEC-005 | Security | MEDIUM | 🟢 Benevolent | Double callback bug in `encrypt()` — logic fix, no format effect |
| SEC-006 | Security | LOW | 🟢 Benevolent | Lock password stored plaintext in prefs — document or hash it |
| SEC-007 | Security | LOW | 🟢 Benevolent | No URL protocol validation in `loadUrl()` — additive validation |
| SEC-008 | Security | INFO | 🟢 Benevolent | No CSP meta tag — additive HTML change |
| SIMP-001 | Simplify | — | 🟢 Benevolent | Split `prefs.js` into smaller modules — pure refactor |
| SIMP-002 | Simplify | — | 🟢 Benevolent | Duplicate clipboard logic — consolidation, no behavior change |
| SIMP-003 | Simplify | — | 🟢 Benevolent | Dead code in `menu.js` — removal only |
| SIMP-004 | Simplify | — | 🟢 Benevolent | `lib.js` prototype mutation pattern — document or refactor |
| SIMP-005 | Bug fix | — | 🟢 Benevolent | Missing `return` in `prefMemorablePasswordMaxWords()` — fixes silent rendering bug |
| PORT-001 | Portability | — | 🟢 Benevolent | Bootstrap bundled locally — already correct, no change needed |
| PORT-002 | Portability | — | 🟢 Benevolent | Optional single-file bundle — additive build option |
| PORT-003 | Portability | — | 🟢 Benevolent | FSAA save disabled — already handled, no change needed |
| PORT-004 | Portability | — | 🟢 Benevolent | `site.webmanifest` name fields empty — trivial one-line fix |
| UX-001 | User flow | — | 🟢 Benevolent | Password generator close UX — UI improvement only |
| UX-002 | User flow | — | 🟢 Benevolent | Delete record has no confirmation — additive confirmation step |
| UX-003 | User flow | — | 🟢 Benevolent | Preferences dialog too long — tabbed layout, no behavior change |
| UX-004 | User flow | — | 🟡 Benevolent w/ caveat | `filePassCache` default change — users relying on `local` will notice |
| DOC-001 | Docs | — | 🟢 Benevolent | Add QUICKSTART.md — additive |
| DOC-002 | Docs | — | 🟢 Benevolent | Add ARCHITECTURE.md — additive |
| DOC-003 | Docs | — | 🟢 Benevolent | Extract SECURITY.md — additive |
| DOC-004 | Docs | — | 🟢 Benevolent | JSDoc gaps — additive |
| TEST-001 | Testing | — | 🟢 Benevolent | Browser-based vanilla JS unit test runner — zero new dependencies |
| TEST-002 | Testing | — | 🟢 Benevolent | Expand existing pytest/Selenium E2E suite — zero new dependencies |

**Summary: 2 breaking changes (SEC-003, SEC-004), both in `crypt.js`, both affecting key derivation. Everything else is safe to ship without user action on existing files.**

---

## Codebase Summary

### Build system (Makefile)

Key targets:

| Target | Purpose |
|--------|---------|
| `make` / `make init` | pipenv venv, Python deps (pytest, selenium, pylint), jshint globally via npm |
| `make lint` | rg for tabs/trailing whitespace, jshint on `www/`, icon symmetry, pylint on test file |
| `make test` | lint, HTTP server on port 8081, pytest Selenium suite, kill server |
| `make web` | Produces `pam-www.tar` release artifact |
| `make app-version` | Regenerates `www/js/version.js` from git metadata |
| `make app-help` | Generates `www/help/index.html` from README.md via pandoc |
| `make run` | Starts local HTTP server for development |
| `make web-min` | (Experimental) minified single-file bundle via `minify` |

**Important for test harness design:** The existing pipeline is pipenv + pytest + Selenium. The test harness adds zero new dependencies: a standalone `tests/tests.html` browser page for unit-level logic tests, and expansion of the existing pytest/Selenium suite for E2E. Both integrate with the existing HTTP server and Makefile.

### CI/CD (`.github/workflows/main.yml`)
GitHub Actions on ubuntu-latest. Pipeline: install deps → install Chrome + ChromeDriver (dynamically matched) → checkout → `make help` → `make` → `make test` → `make web`. CI must remain green throughout the rewrite. No CI changes are required for the test harness — the new `make unit-test` target runs headless Chrome against `tests/tests.html` using the same server and ChromeDriver already present.

### Linting (`jshint.json`)
```json
{ "asi": true, "curly": true, "eqeqeq": true, "nocomma": true, "esversion": 11 }
```
`"asi": true` suppresses missing-semicolon warnings (intentional style). `esversion: 11` = ES2020. Runs on the whole `www/` directory. `tests/tests.html` is a standalone HTML file so it should not need a `.jshintignore` entry — but verify current `.jshintignore` contents before Phase 1 to be safe.

### `site.webmanifest` (PORT-004)
Both `name` and `short_name` are empty strings — breaks PWA installation. Trivial fix: set both to `"PAM"`.

### Module inventory (application JS only)

| File | Lines | Role |
|------|-------|------|
| `prefs.js` | 1167 | Preferences model and UI — largest file, most complex |
| `record.js` | 515 | Record CRUD, accordion DOM management |
| `menu.js` | 504 | Menu construction, modal dialogs, password prompt UX |
| `field.js` | 496 | Field rendering (view + edit), drag/drop |
| `lib.js` | 469 | Element prototype extensions (the `x*` chaining API) |
| `password.js` | 428 | Password generation (cryptic + memorable), file pass cache |
| `load.js` | 420 | File load, URL load, clipboard load, JSON parsing |
| `utils.js` | 358 | Shared utilities: modals, drag/drop, theme, clipboard |
| `save.js` | 262 | File save, JSON serialization, download |
| `print.js` | 195 | Print-to-new-window record report |
| `main.js` | 184 | Entry point, layout initialization |
| `raw.js` | 153 | Raw JSON edit mode |
| `crypt.js` | 151 | AES-256-CBC encrypt/decrypt via SubtleCrypto |
| `search.js` | 120 | Record search/filter |
| `about.js` | 66 | About dialog |
| `status.js` | 20 | Status bar blip messages |
| `version.js` | 7 | Build-time constants (auto-generated by make) |

### Existing tests
- **`tests/test_chrome.py`**: ~300 lines, ~10 Selenium/pytest E2E tests. UI smoke only.
- **Coverage:** Zero unit tests, zero crypto tests, zero logic tests.
- **Infrastructure:** HTTP server on port 8081, Chrome + ChromeDriver.

---

## Goal 1: Security Audit — Findings

### SEC-001 🟢 Benevolent — XSS via `html` field type (HIGH)
**Location:** `field.js:mkRecordField()`, `save.js`, `load.js`
Fields of type `html` are injected via `innerHTML` with no sanitization. In the general case this is a live XSS vector when loading files from untrusted sources.

**Resolution:** The `html` field type is an intentional feature, not a defect — its primary use case is controlled internal deployment where a security team authors PAM data and distributes it on a read-only volume to a defined cohort. HTML fields give that team the ability to include rich content (formatted notes, links, instructions) that plain text cannot express. Removing or sanitizing the feature would break this legitimate use case.

The fix is therefore architectural rather than a code patch:

1. **Default to disabled.** Out of the box, `html` fields render as escaped plain text with a small `</>` badge indicating HTML content is present but not rendered.
2. **Enable via the prefs password gate.** Add a preference: *"Allow HTML field rendering"* with an explicit risk warning. This setting is only accessible after entering the prefs password, raising the bar significantly against casual or accidental activation.
3. **Persistent visual indicator when active.** When HTML rendering is enabled, display a subtle persistent badge in the toolbar so users always know they are in a mode where HTML fields render live.
4. **Document the threat model in SECURITY.md.** Clarify when HTML rendering is safe (controlled distribution, trusted content authors, read-only volume) and when it is not (loading files from untrusted or unknown sources).

**Residual risk note:** If a PAM file is distributed with HTML rendering already enabled in its prefs block, that setting travels with the file. The mitigation protects against foreign malicious files loaded by a user who happens to have rendering enabled, but does not protect against the trusted file itself being the attack vector. This is acceptable given the stated deployment model and should be documented.

### SEC-002 🟡 Benevolent with caveat — `localStorage` stores the master file password (MEDIUM)
**Location:** `password.js:setFilePass()` / `getFilePass()`
Default `filePassCache` is `'local'`. Master password persists in localStorage indefinitely. Changing default to `'session'` does not affect any encrypted file, but users relying on auto-cache will notice.
**Fix:** Change default to `'session'`. Add risk warning for `'local'`. Document in SECURITY.md.

### SEC-003 🔴 Breaking — PBKDF2 iteration count too low (MEDIUM)
**Location:** `crypt.js`, `const numIterations = 100000`
100k PBKDF2-SHA-256 iterations was adequate in 2022; NIST SP 800-132 (2023) and OWASP now recommend ≥600k. Changing the count changes the derived key — all existing files fail to decrypt if migrated without a compatibility path.

**Resolution:** Phased migration across three releases — see Release Plan. v1.3 introduces dual implementation (v1 and v2 paths) with v1 as default; v1.4 flips the default to v2 with a gentle nudge; v2.0 removes v1 encrypt while retaining v1 decrypt permanently.

**Must be implemented together with:** SEC-004 (both affect key derivation and must move as a unit).

**Critical implementation note:** The v1 decrypt path must preserve the original 100k iteration count exactly — not a cleaned-up version. Any change to the v1 path will silently produce the wrong key for existing files.

### SEC-004 🔴 Breaking — Salt entropy bug (MEDIUM)
**Location:** `crypt.js:PBKDF2()`
Random salt (`Uint8Array`) is passed through `encoder.encode(salt)`. TextEncoder calls `.toString()` first, producing ASCII like `"0,34,211,..."` — dramatically reducing salt entropy. The buggy behavior defines every existing file's key. Fixing it changes key derivation.

**Resolution:** Same phased migration as SEC-003. v2 path uses raw bytes; v1 path preserves the TextEncoder bug exactly.

**Must be implemented together with:** SEC-003.

**Critical implementation note:** The v1 decrypt path must preserve the original buggy `encoder.encode(salt)` call verbatim. A comment should make this explicit: `// deliberately preserves the original buggy salt encoding for v1 file compatibility — do not fix`.

### SEC-005 🟢 Benevolent — Double callback bug in `encrypt()` (MEDIUM)
**Location:** `crypt.js:encrypt()`
Missing `return` statements after early-exit `callback()` calls cause double-invocation (empty plaintext / empty password edge cases). Can cause double-save.
**Fix:** Add `return` after each early-exit `callback()` call in `encrypt()` and `decrypt()`.

### SEC-006 🟢 Benevolent — Lock password stored plaintext in PAM file (LOW)
**Location:** `prefs.js`, `save.js`
`window.prefs.lockPreferencesPassword` is serialized into JSON prefs, visible to anyone with the master password. Fix is either documentation-only or SHA-256 hash before storing (backward-compatible).
**Fix:** Hash before storing; hash entered value to compare on verification. Document limitation in SECURITY.md.

### SEC-007 🟢 Benevolent — No URL protocol validation in `loadUrl()` (LOW)
**Location:** `load.js:loadUrl()`
URL via `prompt()` only checks `length > 4`. Allows `javascript:` or `data:` URIs.
**Fix:** Validate URL starts with `https://` or `http://` before fetching.

### SEC-008 🟢 Benevolent — No Content Security Policy (INFO)
No CSP meta tag in `index.html`. Bootstrap 5 doesn't use inline JS or `eval()`, so a strict `script-src 'self'` policy is achievable.
**Fix:** Add CSP meta tag to `index.html`. Test against Bootstrap runtime requirements.

---

## Goal 2: Simplification — Observations

### SIMP-001 🟢 Benevolent — `prefs.js` is doing too much (1167 lines)
Split into `prefs-model.js` (data model, enables unit testing without DOM), `prefs-ui.js` (dialog construction), `prefs-fields.js` (predefined field management).

### SIMP-002 🟢 Benevolent — Duplicate clipboard copy logic
`field.js:mkRecordFieldCopyToClipboardButton()` and `utils.js:copyTextToClipboard()` are nearly identical. Consolidate to `utils.js`.

### SIMP-003 🟢 Benevolent — Dead/experimental code in `menu.js`
`showPasswordPrompt()` and `showPasswordPromptExp7()` (~100 lines) are unreachable. Remove.

### SIMP-004 🟢 Benevolent — `lib.js` prototype mutation pattern
`enableFunctionChaining()` mutates `Element.prototype` and `HTMLDocument.prototype` globally, making unit tests harder (prototype state leaks between tests if not carefully reset). Recommend documenting rather than refactoring — a full refactor would touch every module. The documentation deliverable is a dedicated section in ARCHITECTURE.md explaining the `x*` chaining API, why global prototype mutation was chosen, and how to work around it safely in tests. See Phase 6 and DOC-002.

### SIMP-005 🟢 Benevolent — Missing `return` in `prefMemorablePasswordMaxWords()`
Builds a preference row with `xmk(...)` but never returns it. The "Memorable Password Max Words" row is silently never rendered. One-line fix.

---

## Goal 3: Portability — Observations

### PORT-001 🟢 Benevolent — Bootstrap bundled locally (no action needed)
Already correct. No CDN dependency.

### PORT-002 🟢 Benevolent — Optional single-file bundle
The existing `web-min` Makefile target with `minify` is a proof of concept. Extending it with `esbuild` or `rollup` would produce a proper single-file `pam.html` usable from `file://`. Additive.

### PORT-003 🟢 Benevolent — FSAA save disabled (no action needed)
`saveUsingPromises()` is already commented out. Anchor-link fallback works everywhere.

### PORT-004 🟢 Benevolent — `site.webmanifest` incomplete
`name` and `short_name` are both empty strings — breaks PWA installation (no app name shown).
**Fix:** Set `"name": "PAM"` and `"short_name": "PAM"`. Consider adding `"description"`.

---

## Goal 4: User Flow — Observations

### UX-001 🟢 Benevolent — Password generator close UX
Gear icon both generates passwords and toggles the panel, with a confusing separate close button (acknowledged in README). Rationalize.

### UX-002 🟢 Benevolent — Delete record has no confirmation
Single click permanently deletes. Add confirmation step or brief undo toast.

### UX-003 🟢 Benevolent — Preferences dialog navigation
Very long modal. Convert to Bootstrap nav-tabs (Search / Passwords / Miscellaneous / Record Fields / Administration).

### UX-004 🟡 Benevolent with caveat — `filePassCache` default change
Same as SEC-002. Correct from a security standpoint; users relying on auto-cache will notice the change.

---

## Goal 5: Documentation

- **DOC-001:** Add QUICKSTART.md — 5-minute getting-started guide.
- **DOC-002:** Add ARCHITECTURE.md — module structure, DOM conventions, Makefile targets, and a dedicated section on the `lib.js` `x*` prototype chaining API (SIMP-004 deliverable): what it is, why it exists, and how to safely work around it in tests.
- **DOC-003:** Extract SECURITY.md — from README, plus audit findings and v2.0 migration guide.
- **DOC-004:** Add JSDoc to `crypt.js`, `load.js`, `save.js` (modeled on `lib.js`).

---

## Goal 6: Test Harness

### Dependency policy decision
npm supply chain attacks have worsened significantly in the period leading up to this audit. The Shai-Hulud worm (Sept–Nov 2025) compromised 500–796 packages including widely-used packages like chalk and debug. By Q4 2025 Sonatype was blocking over 120,000 npm malware attacks per quarter, with 99.8% of registry malware originating from npm. GitHub's December 2025 authentication overhaul improved the situation structurally but MFA on publish remains optional and 90-day bypass tokens still exist. For a password manager where the development machine likely holds real credentials, a compromised `postinstall` script during `npm install` is a particularly bad outcome.

**Decision: zero new npm dependencies for the test harness.** All testing is built on infrastructure already present in the project.

### Current state
- 1 file, ~10 Selenium/pytest E2E tests — UI smoke only, run via `make test`
- No unit tests, no crypto tests, no coverage

### TEST-001 🟢 Benevolent — Browser-based vanilla JS unit test runner

**Approach:** A standalone `tests/tests.html` page that imports the app's ES6 modules directly and runs assertions in-browser. The existing HTTP server (port 8081) serves it. No npm, no build step, no new runtime.

**Test runner:** ~50 lines of vanilla JS embedded in `tests/tests.html`. Provides `test(name, fn)`, `assert(condition, msg)`, `assertEqual(a, b, msg)`, and a simple pass/fail summary rendered as HTML. Can be opened manually in a browser for interactive debugging, or driven headlessly by the existing ChromeDriver/Selenium infrastructure for CI.

**SubtleCrypto note:** `crypt.js` uses `window.crypto.subtle`, which requires a secure context (`https://` or `localhost`). The existing HTTP server on `localhost:8081` satisfies this — no special setup required.

**Makefile:** Add `make unit-test` target that starts the HTTP server, loads `tests/tests.html` via ChromeDriver, asserts a zero-failure result, and kills the server. This mirrors exactly how `make test` works today.

**CI:** No changes required. The existing Chrome + ChromeDriver installation in `.github/workflows/main.yml` is sufficient.

**`.jshintignore`:** `tests/tests.html` is a standalone HTML file, not a `.js` module, so jshint will not touch it. No `.jshintignore` changes needed — but verify before Phase 1.

Modules testable at unit level via `tests/tests.html`:

| Module | What to test |
|--------|-------------|
| `crypt.js` | Encrypt/decrypt round-trips (v1 baseline; v2 after format bump); wrong-password rejection; empty-input edge cases |
| `password.js` | Cryptic password length/charset; memorable password word count; `setFilePass`/`getFilePass` round-trip |
| `search.js` | Title match, field-name match, field-value match, regex, case sensitivity, no-match |
| `utils.js` | `mkid` uniqueness; `isURL`; `sortDictByKey`; `hide`/`show` DOM state |
| `load.js` | `formatTimeElapsed` pure function; JSON parse/validate logic (extracted pure functions) |
| `save.js` | `convertInternalDataToJSON` round-trip against known fixture |
| `record.js` | `findRecord`, `findRecordAfter`, `deleteRecord`, `insertRecord`, `clearRecords` |
| `prefs-model.js` | `initPrefs`, `resetPrefs`, default values (after SIMP-001 split) |
| `lib.js` | All `x*` prototype methods — `xid`, `xshow`, `xhide`, `xval`, `xappend`, etc. |
| `status.js` | `status`, `statusBlip` DOM mutations |

### TEST-002 🟢 Benevolent — Expand existing pytest/Selenium E2E suite

**Approach:** Extend `tests/test_chrome.py` with additional Selenium test cases. Zero new dependencies — pytest, Selenium, and ChromeDriver are already installed by `make init`.

**New E2E scenarios to add:**

| Scenario | Description |
|----------|-------------|
| Encrypt/save/reload/decrypt | Full round-trip — create record, set password, save file, reload, decrypt, verify record |
| Record CRUD | Create, edit, clone, delete, deactivate |
| Search | Title match, field match, regex mode, case-insensitive, no-match clears results |
| Password generator | Cryptic mode length slider; memorable mode word count; clipboard copy |
| Preferences | Field add/remove/reorder; tabbed navigation (after UX-003) |
| File cache strategies | None / session / local — verify behavior across page reload |
| Load duplicate strategies | Ignore / replace / allow |
| URL load | Load from local HTTP server URL (use existing server) |
| XSS guard | Load file with malicious `html` field; confirm no script execution (after SEC-001) |

**Makefile:** Add `make e2e-test` as an alias for the expanded Selenium run. Update `make test` to run `unit-test` first, then `e2e-test`. Keep `make test` as the single CI entry point.

### Coverage target breakdown

| Module | Unit (tests.html) | E2E (Selenium) | Target |
|--------|-------------------|----------------|--------|
| `crypt.js` | ✓ | ✓ | 90% |
| `password.js` | ✓ | ✓ | 85% |
| `search.js` | ✓ | ✓ | 85% |
| `utils.js` | ✓ | partial | 80% |
| `load.js` | ✓ | ✓ | 80% |
| `save.js` | ✓ | ✓ | 80% |
| `record.js` | ✓ | ✓ | 80% |
| `prefs.js` | partial | ✓ | 70% |
| `field.js` | partial | ✓ | 70% |
| `lib.js` | ✓ | — | 75% |
| `status.js` | ✓ | — | 75% |
| `menu.js` | — | ✓ | 65% |
| `main.js` | — | ✓ | 60% |
| `raw.js` | — | ✓ | 60% |
| `print.js` | — | ✓ | 60% |
| `about.js` | — | ✓ | 60% |
| **Overall** | | | **~75%** |

**Coverage measurement:** Browser Coverage API (`performance.measureUserAgentSpecificMemory` is unavailable in this context, but Chrome's built-in JS coverage via the CDP protocol is accessible through Selenium's `execute_cdp_cmd`). Alternatively, manual instrumentation with a simple counter per function is sufficient given the project's scale. Decision deferred to Phase 1.

### Refactoring prerequisites for testability
These are small, targeted extractions — not architectural rewrites:

1. **`load.js`:** Extract `formatTimeElapsed()` as a pure exported function (no DOM, no globals). Currently inlined.
2. **`password.js`:** Accept `prefs` as a parameter rather than reading from `window.prefs` directly, so test cases can supply controlled prefs objects without global state.
3. **`prefs.js`:** Extract data model to `prefs-model.js` (overlaps with SIMP-001) so it can be imported and tested without triggering DOM construction.
4. **`crypt.js`:** The SubtleCrypto calls work natively in localhost secure context — no mocking needed for `tests/tests.html`. The only issue is `window.isSecureContext` gating; the localhost server satisfies this.

---

## Release Plan

### File format version header (prerequisite for all three releases)

Currently a PAM encrypted file is raw ciphertext with no header or metadata. To support dual-path decryption, files must declare which encryption path was used. A short plaintext version line is prepended to the ciphertext:

- v1 files (new format): first line is `PAMv1`
- v2 files: first line is `PAMv2`
- Legacy files (no header, created by PAM ≤ 1.2.5): treated as v1 on load

Detection is a simple `startsWith` check before attempting decryption. Old PAM versions presented with a v2 file will fail to decrypt honestly (they attempt to decrypt the header bytes and produce garbage) rather than silently corrupting data — this is acceptable and documented in MIGRATION.md.

---

### Release v1.3 — Benevolent fixes + dual crypto implementation, v1 default

All 🟢 and 🟡 benevolent items ship here. Additionally:

**Crypto changes (SEC-003 + SEC-004):**
- Both encrypt/decrypt paths implemented in `crypt.js`:
  - **v1 path:** 100k iterations, TextEncoder salt encoding (bugs preserved exactly — do not fix)
  - **v2 path:** 600k iterations, raw-byte salt (correct implementation)
- File format version header added
- Legacy files (no header) are auto-detected and routed to the v1 decrypt path on load
- Default for new saves: **v1** — existing users are completely unaffected

**New preference (Preferences → Security):** *"Encryption format"*
- `v1 — Current (compatible with all PAM versions)` ← default
- `v2 — Modern (recommended; not compatible with PAM v1.2.5 and earlier)`

**No migration prompt.** Users who never visit Preferences continue exactly as before. Users who want to opt in to v2 immediately can do so.

**Unit tests:** Both v1 and v2 encrypt/decrypt round-trips covered in `tests/tests.html`. Cross-path test: a file encrypted with v1 cannot be decrypted with the v2 path and vice versa.

---

### Release v1.4 — v2 becomes the default, gentle migration nudge

**Default changes:** New files and new users default to v2. Users who have an explicit v1 setting stored in their prefs are unaffected — their stored preference is respected.

**Migration banner (non-blocking):** When a v1 file (with or without the version header) is loaded, a dismissable one-time banner appears:
> *"This file uses the v1 encryption format. You can upgrade to v2 in Preferences → Security."*

The banner is shown once per file and not repeated after dismissal. Dismissal state is tracked in `sessionStorage` by a hash of the ciphertext (not the filename, which may change).

No action is required from the user. The banner is informational only.

---

### Release v2.0 — v1 encrypt removed; v1 decrypt retained permanently

**v1 encrypt path removed.** The *"Encryption format"* preference option for v1 is removed from the UI. Users can no longer save new files in v1 format.

**v1 decrypt path retained permanently** (or at minimum for all future v2.x releases). No existing file ever becomes unreadable.

**Migration banner updated:** When a v1 file is loaded the banner now reads:
> *"This file uses the legacy v1 encryption format. Your next save will automatically upgrade it to v2."*

This is honest and unsurprising — the user has had at least one full release cycle of warning. The upgrade happens on the next normal save, requiring no extra action.

**MIGRATION.md published** explaining the full timeline, what changed technically (iteration count, salt encoding), why (security), and what users need to do (nothing, beyond saving their file once).

---

## Work Sequence (Recommended)

The general principle throughout: **write the tests first, then implement.** The failing test is the specification. The only exception is the `crypt.js` v1 regression baseline in Phase 1, which captures existing behavior before anything is changed — that test must pass immediately on first run.

### Phase 1 — Test harness foundation (Sessions 1–2)
The test harness comes first so every subsequent change has a safety net. The `crypt.js` v1 regression baseline is locked in before any crypto code is touched.

- [ ] Verify `.jshintignore` contents — confirm `tests/` does not need an entry
- [ ] Write `tests/tests.html` — vanilla JS test runner (~50 lines): `test(name, fn)`, `assert(condition, msg)`, `assertEqual(a, b, msg)`, pass/fail summary rendered as HTML
- [ ] Add `make unit-test` target to Makefile (starts server, loads `tests/tests.html` via ChromeDriver, asserts zero failures, kills server)
- [ ] Confirm CI passes with new target
- [ ] **Write `crypt.js` v1 round-trip regression baseline** — must pass immediately; locked in before any crypto code changes
- [ ] Write unit tests for pure no-DOM modules: `utils.js`, `status.js`, `lib.js` — these should all pass immediately against the existing code
- [ ] Write unit tests for `search.js`, `record.js`, `password.js` (inject prefs as parameter — small prerequisite refactor in `password.js` needed first)

### Phase 2 — Quick wins (Session 3)
Tests for each fix are written first. The fix is then implemented to make them pass.

- [ ] Write tests for SEC-005: assert that `encrypt()` callbacks fire exactly once on empty-input edge cases → implement fix (add `return` after early-exit callbacks)
- [ ] Write tests for SIMP-005: assert that the memorable password max-words preference row is present in the rendered prefs DOM → implement fix (add missing `return`)
- [ ] Write tests for SEC-007: assert that `javascript:` and `data:` URIs are rejected by `loadUrl()` → implement fix (protocol validation)
- [ ] PORT-004: update `site.webmanifest` (no test needed — trivially verified by inspection)
- [ ] Run full test suite after each fix; all tests must remain green

### Phase 3 — Core security defaults (Sessions 4–5)
- [ ] Write tests for SEC-002 / UX-004: assert that `getFilePass()` defaults to `'session'` scope when no preference is stored → implement change
- [ ] Write tests for SEC-006: assert that the stored lock password is a SHA-256 hash, not plaintext; assert that hash comparison verifies correctly → implement change
- [ ] Write tests for SEC-008: assert that `index.html` contains a CSP meta tag with the expected policy → implement change
- [ ] Extract `formatTimeElapsed()` from `load.js` as a pure exported function (prerequisite for unit testing `load.js`)
- [ ] Write unit tests for `load.js` (`formatTimeElapsed` and JSON parse/validate logic) and `save.js` (`convertInternalDataToJSON` round-trip against known fixture)

### Phase 4 — SEC-001 + E2E infrastructure (Sessions 6–7)
- [ ] Write unit tests for SEC-001: assert that `html` field type renders as escaped plain text with `</>` badge when rendering is disabled; assert that it renders as HTML when enabled → implement default-off behavior and prefs gate
- [ ] Write E2E Selenium tests for: record CRUD, search (title/field/regex/case), preferences navigation, `html` field rendering toggle
- [ ] Add `make e2e-test` target; update `make test` to run `unit-test` then `e2e-test`
- [ ] Add persistent toolbar indicator when HTML rendering is active
- [ ] Document threat model in SECURITY.md

### Phase 5 — Simplification + remaining tests (Sessions 8–10)
- [ ] Write unit tests for `prefs-model.js` (the module does not yet exist — tests define its API) → implement SIMP-001: split `prefs.js` into `prefs-model.js`, `prefs-ui.js`, `prefs-fields.js`; tests must pass against the new module
- [ ] Write tests for consolidated clipboard function in `utils.js` → implement SIMP-002: remove duplicate from `field.js`
- [ ] SIMP-003: identify dead code in `menu.js`, confirm no tests reference it, remove
- [ ] Write E2E tests for password generation, file operations, load duplicate strategies

### Phase 6 — UX + documentation (Sessions 11–12)
- [ ] Write E2E tests for UX-001 (password generator open/close/generate flow), UX-002 (delete confirmation), UX-003 (tabbed prefs navigation) → implement each in turn
- [ ] Write E2E tests for `about.js` (About dialog open/close, version display) and `print.js` (print dialog triggered, record content present) → implement any fixes surfaced
- [ ] Write unit tests for the save strategy abstraction: assert that `showSaveFilePicker` path is selected when the API is available; assert that anchor-download fallback is selected otherwise → implement save mechanism abstraction in `save.js`
- [ ] QUICKSTART.md
- [ ] ARCHITECTURE.md — including SIMP-004 deliverable: dedicated section on the `lib.js` `x*` prototype chaining API (SIMP-004 resolved here)
- [ ] SECURITY.md (incorporating SEC-001 threat model, SEC-002/006 notes, and pointers to MIGRATION.md for the crypto changes)
- [ ] JSDoc for `crypt.js`, `load.js`, `save.js`

### Phase 7 — Dual crypto + release v1.3 (Sessions 13–14)
- [ ] Write unit tests first:
  - v2 encrypt/decrypt round-trip (will fail until implemented)
  - Cross-path rejection: file encrypted with v1 cannot be decrypted with v2 path and vice versa
  - Legacy file detection: file with no header routes to v1 decrypt
  - File format version header: assert correct prefix on output of each path
- [ ] Implement file format version header (`PAMv1` / `PAMv2` prefix)
- [ ] Implement v1 encrypt/decrypt path (100k iterations, TextEncoder salt — bugs preserved exactly, commented explicitly)
- [ ] Implement v2 encrypt/decrypt path (600k iterations, raw-byte salt)
- [ ] Implement legacy file detection (no header → v1)
- [ ] Confirm original v1 regression baseline still passes against the new v1 path
- [ ] Add *"Encryption format"* preference (v1 default) to Preferences → Security
- [ ] Write E2E tests: save as v1 → reload → decrypt; save as v2 → reload → decrypt
- [ ] PORT-002: Evaluate single-file bundle
- [ ] Final coverage report, target ≥75%
- [ ] Update README, tag v1.3

### Phase 8 — v2 default + migration nudge, release v1.4 (Session 15)
- [ ] Write E2E test: load a v1 file, assert migration banner appears; dismiss it, assert it does not reappear in the same session
- [ ] Write unit test: assert that the default encryption format preference is now v2
- [ ] Flip default encryption format to v2 for new files and new users — tests must now pass
- [ ] Implement dismissable migration banner (sessionStorage tracking by ciphertext hash)
- [ ] Tag v1.4

### Phase 9 — Remove v1 encrypt, release v2.0 (Session 16)
- [ ] Write E2E test: assert that the v1 encryption format option is absent from Preferences → Security
- [ ] Write E2E test: load a v1 file, assert updated banner text ("your next save will upgrade to v2"), save, assert file is now v2
- [ ] Remove v1 encrypt path and preference option from UI — tests must now pass
- [ ] Confirm v1 decrypt path still passes all existing v1 unit and E2E tests (permanent retention)
- [ ] Write MIGRATION.md
- [ ] Tag v2.0

---

## Branching Strategy

### Approach: one branch per phase, merged to `main` when all tests pass

Each phase of work lives on its own short-lived branch. Branches are created from the tip of `main` after the previous phase has merged. This gives clean isolation between phases, a legible `git log` history, and a free CI quality gate on every push.

### Branch naming

```
phase/01-test-harness
phase/02-quick-wins
phase/03-security-defaults
phase/04-sec001-e2e
phase/05-simplification
phase/06-ux-documentation
phase/07-dual-crypto-v1.3
phase/08-v2-default-v1.4
phase/09-v1-encrypt-removal-v2.0
```

Future phases follow the same pattern: `phase/10-mobile-save`, `phase/11-credential-injection`, etc.

### Merge criterion

A branch is only merged to `main` when:
- All unit tests in `tests/tests.html` pass (via `make unit-test`)
- All E2E tests in `tests/test_chrome.py` pass (via `make e2e-test`)
- CI is green on the branch

### Merge style

Use a **merge commit** rather than squash or rebase, so the branch history is preserved and `git log --graph` tells the story of each phase clearly:

```bash
git checkout main
git merge --no-ff phase/01-test-harness
```

The `--no-ff` flag prevents fast-forward merges and ensures a merge commit is always created even when the history is linear.

### Merge commit message format

The merge commit message references the PLAN.md phase description so that `git log` is self-documenting six months later. Format:

```
Merge phase/NN-description — PLAN.md Phase N

<One paragraph summarising what the phase accomplished, key
decisions made, and anything that deviated from the plan.
Reference finding IDs where relevant: e.g. SEC-005, SIMP-001.>

All unit tests pass. All E2E tests pass. CI green.
```

Example:

```
Merge phase/01-test-harness — PLAN.md Phase 1

Established the vanilla JS test runner in tests/tests.html with
make unit-test integration. Wrote unit tests for utils.js, status.js,
lib.js, search.js, record.js, and password.js (prefs made injectable).
Locked in the crypt.js v1 round-trip regression baseline — all tests
pass against the existing implementation before any code changes.
Confirmed .jshintignore requires no additions for tests/tests.html.

All unit tests pass. All E2E tests pass. CI green.
```

### Release tagging

Release branches (Phases 7, 8, 9) are tagged on the merge commit:

```bash
git tag -a v1.3 -m "Release v1.3 — dual crypto implementation, v1 default"
git tag -a v1.4 -m "Release v1.4 — v2 encryption default, migration nudge"
git tag -a v2.0 -m "Release v2.0 — v1 encrypt removed, v1 decrypt permanent"
```

### Keeping branches short

If a phase runs longer than expected, prefer merging what is complete and opening a new branch for the remainder over sitting on a long-lived divergent branch. A phase that has grown too large is a signal to split it, not to delay the merge.

---

## Future Phases (Post-v1.3, Deferred)

These items are outside the scope of the current plan but are noted here because one has a minor architectural implication for near-term work and both inform long-term direction.

### FUTURE-001 — Mobile file save improvement

**Current state:** The anchor-element `download` approach works everywhere but is clunky on mobile. iOS Safari does not honor the `download` attribute at all — it opens the file in a new tab. Android Chrome buries the download in the notification shade. The user mental model of "a file I manage" does not map cleanly to mobile browser UX.

**Best achievable improvement:** Progressive enhancement using the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (`showSaveFilePicker` / `showOpenFilePicker`). Where supported, this gives the user a native OS file picker and allows re-opening the same file handle on subsequent visits — a much cleaner experience. Where not supported (iOS Safari, Firefox as of early 2026), fall back to the current anchor-download approach with better UX copy.

**Binding constraint:** iOS Safari does not support the File System Access API and Apple has been slow to close this gap. A fully native-quality save experience on iOS is not achievable from a web app without App Store distribution. This is a platform limitation, not a PAM limitation.

**Alternative:** PWA + Cache Storage / IndexedDB — store the encrypted file inside the PWA's own storage and re-open it automatically on next launch. This changes the mental model from "a file you manage" to "an app with its own encrypted store," which suits some users and not others.

**Architectural impact on near-term work (minor):** The save mechanism in `save.js` should be abstracted behind a single function that selects the appropriate strategy (File System Access API vs. anchor download) based on API availability. This abstraction is desirable for testability anyway and should be added in **Phase 6** alongside the other `save.js` work. The abstraction itself is a small additive change that does not affect the current plan's scope.

**Recommended sequencing:** Add the `showSaveFilePicker` progressive enhancement in Phase 6. Defer the PWA storage alternative until after v1.3 if at all.

---

### FUTURE-002 — Direct credential injection (avoiding clipboard)

**Background:** The goal is to open a target site and fill login credentials directly without the user having to copy/paste from PAM. This has been on the project's TODO list for many years and has been attempted in various forms.

**Why POST-based form submission no longer works:** Modern login flows — stepped username-then-password pages, OAuth redirects, popup authentication dialogs, app-specific passwords, 2FA interstitials, JavaScript-driven form mutation — were designed specifically to defeat automated form submission. They are now essentially universal among any site that takes security seriously. A cross-origin page cannot observe or interact with these flows in a way that handles the full range of real-world sites. This approach was viable in the early 2000s and is not viable now.

**The only approach that can handle modern login flows: a browser extension.** An extension operates at the same privilege level as the page's own JavaScript, can observe the DOM as it mutates through multi-step flows, can interact with popup windows, and can handle OAuth redirects. This is how every major password manager (1Password, Bitwarden, Dashlane) solves the problem.

**What a browser extension approach entails:**

- A separate browser extension codebase (Chrome Manifest V3, Firefox WebExtensions)
- Separate distribution: Chrome Web Store review process, Firefox Add-ons review
- Separate update cadence from the main PAM web app
- A message-passing API between PAM and the extension (likely `postMessage` or a shared extension storage channel, scoped carefully to avoid exposing credentials to arbitrary pages)
- Significant new security surface: the extension needs to receive credentials from PAM, which means defining what it is allowed to request and from which origins

**Simpler fallback — bookmarklet / fill script per record:**
A PAM record could store a URL and a small JavaScript fill snippet. A "Login" button in PAM constructs a bookmarklet from the snippet and the record's credentials and either copies it to clipboard or triggers it directly. The user pastes it into the browser address bar or clicks a pre-installed bookmarklet. This handles simple single-page forms and avoids the extension complexity, but fails on the same multi-step flows that POST-based approaches fail on — it is a partial solution only.

**Architectural impact on near-term work:** None for the bookmarklet approach. For the browser extension approach, the extension's API surface should inform how `record.js` and `field.js` expose data — it is better to design this once than to restructure after v1.3. **Decide on approach before starting extension work.**

**Recommended sequencing:** Defer until after v1.3 ships. Before starting, decide between bookmarklet (low effort, limited coverage) and browser extension (high effort, complete solution). If leaning toward an extension, revisit the `record.js` and `field.js` data exposure model before those modules are finalized in Phase 4.

---

## Session Log

| Session | Date | Work Done | Files Changed |
|---------|------|-----------|---------------|
| 0 | 2026-04-11 | Initial audit, plan created | PLAN.md |
| 1 | 2026-04-11 | Added breaking/benevolent classification, release plan | PLAN.md |
| 2 | 2026-04-11 | Full repo upload; added Makefile, CI, jshint, webmanifest findings | PLAN.md |
| 3 | 2026-04-11 | npm rejected on security grounds; test harness switched to browser-based vanilla JS runner + expanded Selenium | PLAN.md |
| 4 | 2026-04-12 | SEC-001 resolved: html field kept, disabled by default, gated on prefs password, persistent indicator added | PLAN.md |
| 5 | 2026-04-12 | Breaking crypto changes phased: v1.3 dual impl v1 default → v1.4 v2 default + nudge → v2.0 remove v1 encrypt | PLAN.md |
| 6 | 2026-04-12 | Added FUTURE-001 (mobile save) and FUTURE-002 (credential injection); Phase 6 save abstraction noted | PLAN.md |
| 7 | 2026-04-12 | Work sequence reordered: test harness moved to Phase 1; crypt.js v1 regression baseline before any crypto changes | PLAN.md |
| 8 | 2026-04-12 | TDD discipline applied: tests written before implementation in every phase throughout the work sequence | PLAN.md |
| 9 | 2026-04-12 | Branching strategy added: one branch per phase, --no-ff merge commits, message references PLAN.md phase | PLAN.md |
| 10 | 2026-04-12 | Full plan review: fixed breaking change strategy text, SIMP-004/DOC-002 linkage, about.js/print.js test coverage, load.js extraction explicitness, section ordering and heading errors | PLAN.md |

---

## Open Questions

1. ~~**XSS fix approach (SEC-001).**~~ **RESOLVED.** Keep `html` field type. Disable rendering by default. Gate on prefs password. Add persistent visual indicator when active. Document threat model in SECURITY.md.
2. **Bundling (PORT-002):** Extend `web-min` with esbuild/rollup? Both would be added as devDependencies — assess whether the npm risk is acceptable for a build-time-only tool that never runs in CI against live credentials. **Joe's call.**
3. ~~**`lib.js` refactor (SIMP-004).**~~ **RESOLVED.** Document rather than refactor. ARCHITECTURE.md (Phase 6, DOC-002) will include a dedicated section on the `x*` prototype chaining API.
4. ~~**v2.0 scope.**~~ **RESOLVED.** Phased migration across v1.3 → v1.4 → v2.0 answers this. No other breaking changes identified. See Release Plan.
5. **Coverage measurement:** Browser CDP coverage via `execute_cdp_cmd` in Selenium vs. manual instrumentation. Decide in Phase 1 once `tests/tests.html` is running.
