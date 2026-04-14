# PAM Encryption Migration Guide

## Overview

PAM 1.3 introduces a new encryption format (v2) that fixes two weaknesses in the
original format (v1). This document explains what changed, the practical risk, how
to migrate, and what happens if you don't.

---

## What changed

### v1 weaknesses (PAM < 1.3)

Two bugs in the v1 key derivation reduce the cost of a brute-force attack:

**1. Salt entropy bug.** The random salt bytes were passed through
`TextEncoder.encode()`, which calls `.toString()` on the array first. This
produces an ASCII string like `"0,34,211,96,..."` instead of raw bytes. A
16-byte random salt theoretically has 128 bits of entropy; after this
transformation the effective entropy is dramatically lower.

**2. Low PBKDF2 iteration count.** v1 uses 100,000 iterations.
NIST SP 800-132 (2023) and OWASP currently recommend ≥ 600,000 iterations
for PBKDF2-SHA-256 used in password hashing.

### v2 improvements (PAM 1.3+)

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
issues and change your password immediately.**

The right response to the v1 weaknesses is to migrate when convenient —
not to panic.

---

## How to migrate

Migration is a single save operation:

1. Open PAM 1.3 or later
2. Load your existing file (enter your master password — v1 files decrypt fine)
3. Go to **Preferences → Security → Encryption Format** and select **v2**
4. Click **Save File** (enter your master password again)

Your file is now saved in v2 format. The old v1 file is unchanged on disk until
you overwrite it.

---

## Backward compatibility

**v1 files are readable by PAM 1.3 forever.** The v1 decrypt path is permanently
retained. You will never be unable to open an existing file because you upgraded PAM.

**v2 files require PAM 1.3 or later.** If you need to open a v2 file with an
older version of PAM, use `git checkout v1.2.5 && make run` to run the last v1
release locally.

**The default remains v1 in PAM 1.3.** New saves use v1 unless you explicitly
switch to v2 in Preferences. The default will flip to v2 in PAM 1.4.

---

## Timeline

| Version | Change |
|---------|--------|
| PAM 1.3 | v2 format available; v1 is still the default for new saves |
| PAM 1.4 | v2 becomes the default; v1 files show a migration nudge on load |
| PAM 2.0 | v1 encrypt path removed; v1 decrypt path retained permanently |
