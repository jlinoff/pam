# PAM Encryption Migration Guide

## Overview

PAM 2.0 introduces a new encryption format (v2) that fixes two weaknesses in the
original format (v1). This document explains what changed, the practical risk, how
migration works, and what happens if you use an older version of PAM.

---

## What changed

### v1 weaknesses (PAM < 2.0)

Two bugs in the v1 key derivation reduce the cost of a brute-force attack:

**1. Salt entropy bug.** The random salt bytes were passed through
`TextEncoder.encode()`, which calls `.toString()` on the array first. This
produces an ASCII string like `"0,34,211,96,..."` instead of raw bytes. A
16-byte random salt theoretically has 128 bits of entropy; after this
transformation the effective entropy is dramatically lower because the output
is constrained to decimal digit characters and commas.

**2. Low PBKDF2 iteration count.** v1 uses 100,000 iterations.
NIST SP 800-132 (2023) and OWASP currently recommend ≥ 600,000 iterations
for PBKDF2-SHA-256 used in password hashing.

### v2 improvements (PAM 2.0+)

- Salt is used as raw bytes — no TextEncoder transformation
- 600,000 PBKDF2-SHA-256 iterations
- Files are prefixed with `PAMv2:` for unambiguous format detection

---

## Practical risk assessment

**If your master password is strong (≥ 16 random characters or a memorable
passphrase of equivalent entropy), your v1 files are not immediately
exploitable in practice.** The weaknesses reduce the cost of a brute-force
attack but do not make a strong password trivially breakable. An attacker
would still need to:

1. Obtain your encrypted `.pam` file
2. Mount a sustained offline brute-force attack with significant compute resources

**If your master password is weak (short, dictionary word, predictable), you
should treat your v1 files as potentially compromised regardless of these
issues and change your password immediately after migrating.**

The right response to the v1 weaknesses is to migrate when convenient —
not to panic.

---

## How to migrate

Migration is automatic and requires no user action beyond a normal save:

1. Open PAM 2.0 or later
2. Load your existing file (enter your master password — v1 files decrypt fine)
3. Click **Save File** (enter your master password)

Your file is now saved in v2 format. PAM 2.0 always writes v2 — there is no
preference to change and no format selection required.

---

## Backward compatibility

**v1 files are readable by PAM 2.0 forever.** The v1 decrypt path is permanently
retained in all future versions. You will never be unable to open an existing
file because you upgraded PAM.

**v2 files require PAM 2.0 or later.** If you need to open a v2 file with an
older version of PAM (e.g. 1.3.0 or earlier), use
`git checkout v1.3.0 && make run` to run the last pre-2.0 release locally.
The older version will report a decryption failure when it encounters the
`PAMv2:` prefix — this is expected and not a sign of file corruption.

---

## Timeline

| Version | Change |
|---------|--------|
| PAM < 2.0 | v1 format only. 100k PBKDF2 iterations, salt entropy bug. |
| PAM 2.0 | v2 format always written on save. v1 files always readable. |
| PAM 2.1 | v1 encrypt path removed from code (≥ 1 year post-2.0). v1 decrypt retained permanently. |
