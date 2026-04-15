# PAM v1.3.0 Release Notes

## Summary

PAM 1.3.0 is a UX and security improvement release. It introduces tabbed
preferences navigation, delete confirmation, a validated number field type,
several security hardening measures, and a significant expansion of the test
suite. No file format changes — all v1 files remain fully compatible.

---

## UX improvements

### Tabbed preferences dialog (UX-003)
The preferences dialog is now organized into five tabs: Search, Passwords,
Miscellaneous, Record Fields, and Administration. Previously a single long
scrolling modal, the tabbed layout makes preferences significantly easier to
navigate — especially on mobile.

### Delete record confirmation (UX-002)
Deleting a record now requires confirmation. A dialog prompts
`Delete record "title"? This cannot be undone.` — Cancel leaves the record
intact, OK removes it permanently.

### Number field validation
The `number` field type now validates input on save. Non-numeric values are
rejected with a clear error message.

---

## Security hardening

- **SEC-001:** HTML field rendering is disabled by default. Must be explicitly
  enabled in Administration preferences.
- **SEC-002/UX-004:** File password cache defaults to `session` scope
  (previously `global`).
- **SEC-007:** URL field values are validated against an allowlist of safe
  protocols.
- **SEC-008:** Content Security Policy meta tag added to `index.html`.

---

## Bug fixes

- **BUG-001:** `enablePrinting` and `enableSaveFile` were broken by a NodeList
  vs HTMLCollection regression — fixed in `print.js`, `save.js`, `menu.js`,
  and `main.js`.
- **Mobile:** Print and Save File menu items now correctly hidden on mobile
  when disabled — Bootstrap dropdown CSS classes are re-applied on every menu
  open via a `show.bs.dropdown` listener.

---

## Documentation

New documents added: `QUICKSTART.md`, `ARCHITECTURE.md`, `HISTORY.md`,
`SECURITY.md`. The `make app-help` target generates HTML versions with
navigation links.

---

## Tests

- Unit tests: 191 (up from 113)
- E2E tests: 22 (up from 16)
- Coverage map added to `PLAN.md`

---

## Compatibility

No file format changes. All files saved with earlier versions of PAM open
normally in 1.3.0.
