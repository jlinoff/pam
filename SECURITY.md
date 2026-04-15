# PAM Security Model

This document describes the security model for PAM, the known risks, and the mitigations in place.

---

## Threat model

PAM is a client-side web application. All encryption and decryption happens in the browser using the Web Crypto API (`SubtleCrypto`). No data is ever sent to a server. The encrypted file is stored locally by the user.

The primary threat vectors are:

1. **Compromise of the encrypted file** — an attacker obtains the `.pam` file and attempts to brute-force the master password offline.
2. **XSS via malicious file content** — a user is tricked into loading a PAM file from an untrusted source that contains malicious HTML in an `html`-type field.
3. **Master password exposure** — the master password is cached in browser storage and exposed via XSS, a compromised extension, or physical access to the device.

---

## SEC-001 — HTML field rendering

PAM supports an `html` field type that allows rich content (formatted notes, links, instructions). This is an intentional feature designed for controlled internal deployments where a security team authors PAM data and distributes it on a read-only volume to a defined cohort.

**Risk:** If a user loads a PAM file from an untrusted source, `html` fields could contain malicious scripts (XSS).

**Mitigation:**
- HTML field rendering is **disabled by default**. Fields of type `html` render as escaped plain text with a `</>` badge.
- HTML rendering can only be enabled in **Preferences → Security → Allow HTML Field Rendering**, which is accessible only after unlocking preferences with the prefs password.
- When HTML rendering is enabled, a persistent **⚠ HTML ON** warning badge is shown in the toolbar so users always know they are in a mode where HTML fields render live.

**When is it safe to enable?**
- The PAM file was authored by a trusted party (e.g. your own security team).
- The file is distributed on a read-only volume and cannot be modified by end users.
- You are not loading PAM files from untrusted URLs.

**Residual risk:** A PAM file distributed with HTML rendering already enabled in its prefs block carries that setting with it. The mitigation protects against *foreign* malicious files, not against the trusted file itself being compromised.

---

## SEC-002 — Master password caching

The master file password can be cached in browser storage to avoid re-entry on every save/load. The cache strategy is controlled in **Preferences → Security → filePass Cache Strategy**.

**Options:**
- `session` (default) — password is cached for the current browser session only and cleared when the tab is closed.
- `local` — password persists in `localStorage` indefinitely across sessions. **Use with caution.**
- `global` — password is held in memory only (lost on page reload).
- `none` — password is never cached.

**Recommendation:** Use `session` (the default) unless you have a specific reason to use `local`. The `local` option is a convenience feature that reduces security — only enable it on a trusted, personal device.

---

## SEC-003 / SEC-004 — Encryption format (v1 vs v2)

PAM v1.x uses AES-256-CBC with PBKDF2-SHA-256 key derivation. The v1 implementation has two known weaknesses:

1. **Low iteration count** (100,000) — NIST SP 800-132 (2023) and OWASP now recommend ≥ 600,000 iterations.
2. **Salt entropy bug** — the random salt bytes are passed through `TextEncoder.encode()` which calls `.toString()` first, producing an ASCII string like `"0,34,211,..."` instead of raw bytes, dramatically reducing salt entropy.

Both bugs define the key derivation for all existing v1 files. Fixing them requires a new file format (v2).

**Migration:** v2 format support is planned for PAM v1.3. The migration is non-breaking — v1 files can always be decrypted; users choose when to re-save in v2 format. See `MIGRATION.md` (published with v2.0).

---

## SEC-006 — Preferences lock password

The preferences lock password (`lockPreferencesPassword`) is stored as **plaintext** in the PAM file's prefs block.

**This is intentional.** The prefs lock is a convenience feature whose sole purpose is to prevent casual or accidental modification of preferences in a shared deployment. It is not a cryptographic boundary.

The entire PAM file — including the prefs block and `lockPreferencesPassword` — is encrypted with the master password (AES-256-CBC). An attacker who has the master password can read everything. Hashing `lockPreferencesPassword` would add no security benefit in this threat model, and would silently break existing files where the value was stored as plaintext.

**Threat model:** The prefs lock protects against an authorised user (who has the master password) accidentally changing deployment-managed settings. It does not protect against a determined attacker.

---

## SEC-007 — URL load validation

The **Load → URL** feature only accepts `https://` and `http://` URLs. `javascript:`, `data:`, `ftp:`, and other URI schemes are rejected to prevent protocol-based injection attacks.

---

## SEC-008 — Content Security Policy

PAM sets a `Content-Security-Policy` meta tag in `index.html`:

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net;
style-src 'self';
img-src 'self' data:;
font-src 'self'
```

This prevents loading of scripts, styles, and resources from untrusted origins. The `cdn.jsdelivr.net` exception covers the DOMPurify library used for HTML sanitization.

---

## Reporting security issues

This is an open-source personal password manager. If you find a security issue please open a GitHub issue at [jlinoff/pam](https://github.com/jlinoff/pam).
