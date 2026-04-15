# PAM v2.0 Release Notes

## Summary

PAM 2.0 fixes two weaknesses in the v1 encryption format and introduces a new
file format (v2) that is written automatically on every save. No user action is
required to migrate — load your existing file and save it once.

---

## Security fixes

### Salt entropy bug (v1)
The v1 key derivation passed random salt bytes through `TextEncoder.encode()`,
which first called `.toString()` on the byte array, producing an ASCII string
like `"0,34,211,96,..."` instead of raw bytes. This significantly reduced the
effective entropy of the salt. v2 uses the raw salt bytes directly.

### Low PBKDF2 iteration count (v1)
v1 used 100,000 PBKDF2-SHA-256 iterations. NIST SP 800-132 (2023) and OWASP
currently recommend ≥ 600,000 for password-based key derivation. v2 uses
600,000 iterations.

---

## New file format (v2)

v2 files are prefixed with `PAMv2:` followed by Base64-encoded
`[16-byte salt][16-byte IV][ciphertext]`. The prefix enables unambiguous
format detection — no heuristics required.

PAM 2.0 always writes v2. There is no preference or format selector.

---

## Backward compatibility

**All v1 files remain readable in PAM 2.0 and all future versions.** The v1
decrypt path is permanently retained. Upgrading PAM will never make an
existing file unreadable.

v2 files require PAM 2.0 or later. Older versions will report a decryption
failure on v2 files — this is expected. Use `git checkout v1.3.0 && make run`
to access the last pre-2.0 release if needed.

---

## Migration

See [MIGRATION.md](./MIGRATION.md) for full details. Short version: load your
file in PAM 2.0 and save it once. Done.
