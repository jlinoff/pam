# PAM v2.5.0 Release Notes

Adds a **file integrity check**. Every saved file now carries a digest of its
contents, verified on load. Nothing about the file format changes: older
versions of PAM read v2.5.0 files normally, and v2.5.0 reads older files
normally.

Also adds `make check-toc`, which verifies the README's contents page against
its actual headings — and found nine security-relevant preferences that were
documented but unreachable from it.

## Why

PAM encrypts with AES-CBC, which protects confidentiality and nothing else.
There is no authentication tag, so a modified file decrypts to modified content
and nothing reports it.

In practice most damage was caught anyway, because garbled data fails to parse
as JSON. Measured over 400 random bit-flips in a real encrypted vault: 33 were
caught by padding, 357 by the JSON parser, none got through.

**Random flips are not the threat.** An attacker does not corrupt bytes at
random; they corrupt a *value*, where the change stays syntactically valid. In
a trial confined to the end of a vault holding a long note field, **15 tampered
files decrypted and parsed as valid JSON** — and would have loaded silently as
a valid vault with altered content. The digest caught every one.

That is the gap this closes.

## What it does

A SHA-256 digest of the records and preferences is written into the encrypted
payload as `meta.integrity`. On load, PAM recomputes it and compares **before
applying anything** — content or preferences.

- **A file that fails the check is not loaded.** PAM reports that it has been
  modified since it was saved.
- **If the check cannot run**, PAM says so and still does not load the file. A
  failure to verify is not a verification, and an unverified vault should not
  be applied silently.
- **Files saved before v2.5.0 have no digest.** That is noted in the console
  and the file loads normally. A missing digest is not treated as tampering.

## What it does not do

- **It is not authenticated encryption.** The digest is checked after
  decrypting, not before. AES-GCM remains the correct fix and needs a format
  change; it is tracked as item 9b in `PROPOSAL.md`.
- **It is unkeyed and stored inside the file**, so anyone able to rewrite the
  file could remove the field to silence the check.
- **It does not detect rollback.** Replacing your vault with a genuine older
  copy passes, because that copy's digest was correct when written. No
  authentication scheme in the file detects this — it needs state kept
  outside. Keep backups somewhere an attacker cannot reach.

## A wrong password now says so

Previously, entering the wrong password had a roughly 1-in-256 chance of
reporting **"invalid record format"** — blaming the file rather than the
password. That happened when PKCS#7 padding accidentally validated and the
resulting garbage reached the JSON parser.

The message now names both possibilities, because at that point they genuinely
cannot be told apart.

To be precise about what changed: a wrong password was already *detected*
almost every time. What was wrong was the diagnosis.

## The documentation is now structurally checked

`make check-toc` is new, and runs as part of `make lint`.

PAM already verified that every link in the README **resolves**. That cannot
catch a link to the *wrong* section, because it resolves perfectly well. Adding
one section for the integrity check exposed how far the contents page had
drifted, and the new check found **twenty-two problems** on its first run:

- **Nine Administration preferences were missing from the contents page
  entirely** — including `Allow HTML Field Rendering`, `Search Password Field
  Values` and `Enable Password Breach Check`, which are the three that change
  PAM's security posture.
- **Three more were filed under the wrong section**, and `Administration
  Preferences` had no entry at all despite its five siblings having one.
- **Two headings were written at the wrong level**, which silently *terminated*
  the Administration Preferences section and left the three preferences after
  them structurally attached to a breach-check subsection.
- **`Hide Inactive Records` was documented twice**, in two places, with
  different wording.

All fixed, and the check reports MISSING, WRONG PARENT, DUPLICATE and STALE
entries so it cannot drift again unnoticed.

**The security content is also reorganised.** *Security Considerations* held
eleven subsections and every one was a threat PAM cannot control. The two
things PAM actually does — the Content-Security-Policy and the new file
integrity check — sat outside it at the top level. They are now inside it,
under *What PAM does*, with the threats under *Threats to be aware of*. Every
existing link still resolves, since anchors follow heading text rather than
depth. It needs no browser and takes about
a second.

**`make check-links` is new too**, and checks the 31 external URLs in the
documentation. Eight were stale — five MDN paths, `draw.io`, `pytest.org`, and
a NIST guidance link whose domain had changed hands entirely. Every one still
worked through a redirect, which is why nothing had ever reported them. All are
now updated, and the NIST citation points at NIST rather than at a corporate
blog. It is not part of `make lint`, since it needs network access.

The README also now documents the test and check targets, including
`make test-one TEST_NAME=<name>` for running a single test with the server
started for you.

## Plaintext export is now documented

Saving with an **empty password** writes unencrypted JSON. That has been true
for years and was never written down. It is PAM's full-fidelity export: every
record, every field, every preference, readable and editable with `jq` or any
text editor, and loadable straight back in.

It is now documented under **Save File → Plaintext export**, with the warning it
needs — the file is protected by nothing, so treat it like the passwords
themselves and delete it when you are done.

> **Known issue in this release, fixed in v2.5.1.** v2.5.0 writes an integrity
> digest to plaintext saves as well as encrypted ones, so a plaintext export
> that you edit will be refused on load. See `RELEASE_NOTES_v2.5.1.md`. The
> workaround on v2.5.0 is `jq 'del(.meta.integrity)'` before loading.

## Also in this release

- **`form-action 'self'` added to the Content-Security-Policy.** Unlike most
  directives, `form-action` does not fall back to `default-src`, so its absence
  was silent. Without it, a form in injected markup could post to any origin —
  the one exfiltration channel the rest of the policy left open. A unit test
  now pins it.
- **SEC-001 in `SECURITY.md` corrected.** It named a Preferences tab that does
  not exist, claimed the HTML rendering preference could only be set through
  the Preferences dialogue when a loaded file can also set it, and described a
  script-execution risk that the v2.4.0 CSP had already made unreachable. It
  now describes the live risk, which is content injection.
