# PAM — Minimum-Disclosure Vault Queries

**Status:** proposal, not yet scoped
**Date:** 2026-09-01

## Origin

This came out of a real failure. An Apple Passwords warning disagreed
between devices, and answering the question "are these two vaults the
same?" required exporting both vaults to plaintext CSV — because a full
dump is the only egress Apple offers. The question actually needed 64
bits of information (`sort | shasum -a 256`), but the interface had no
way to produce them.

The plaintext files then had to be shredded, which on APFS with
copy-on-write and SSD wear-levelling is not something you can reliably
do. FileVault and the absence of local snapshots saved it. The whole
exposure existed because a checksum-shaped question had only a
dump-everything-shaped answer.

**Principle:** every question a user might ask of their vault should have
an answer that discloses the minimum needed to answer it. Full
disclosure should be the last resort, not the only door.

Note that PAM's situation differs from Apple's: there is no background
sync circle, so a fingerprint is not for detecting replication drift.
It is for the user who keeps PAM on a laptop and a phone, or has one
vault file in Dropbox and another in a downloads folder, and wants to
know whether they are the same vault without opening both and squinting.

---

## 1. Vault fingerprint

**Question answered:** "Is the vault on this device the same as the one
on that device?"
**Disclosed:** 64 bits.

After unlock, reduce the in-memory entry array to a canonical string and
hash it. Display as grouped hex in a corner of the vault screen.

```js
async function vaultFingerprint(entries) {
  const canonical = entries
    .map(e => [e.service, e.username, e.password].join("\u0000"))
    .sort()                                   // order must not matter
    .join("\u001E");
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].slice(0, 8)
    .map(b => b.toString(16).padStart(2, "0")).join("")
    .match(/.{4}/g).join(" ");                // "3f2a 91c4 0e88 d517"
}
```

The user compares four hex groups by eye across two devices. Same
fingerprint means same vault.

### Design decisions that need making

- **What goes in the canonical form.** Include volatile fields
  (last-viewed, access counts) and you get spurious mismatches. Exclude
  too much and you get false agreement. Suggest: entry content only.
  Show "last modified" as a separate line beside the fingerprint so a
  user can distinguish "different content" from "same content, one is
  staler."
- **Sorting is load-bearing.** It is the fix for exactly the failure
  that prompted this: two identical vaults serialised in different
  orders looked completely divergent under a line-oriented diff. A test
  must assert that shuffling the input array does not change the
  fingerprint.
- **Truncation length.** 64 bits shown. This is a comparison aid
  between two vaults the same user controls, not a security boundary —
  there is no adversary choosing vault contents to collide. If that
  assumption ever changes, revisit.
- **Unicode normalization.** Two vaults holding the same visible
  password in NFC and NFD produce different fingerprints. Probably
  correct (the bytes genuinely differ, and one will fail to
  authenticate) but it should be a deliberate decision, and the
  fingerprint display may want to flag it rather than silently
  mismatch.
- `crypto.subtle` requires a secure context. Fine for an installed PWA
  over HTTPS; would break if PAM is ever served over plain HTTP on a
  LAN. Worth knowing before relying on it.

---

## 2. Reuse count with progressive disclosure

**Question answered:** "Am I reusing any passwords?"
**Disclosed:** one integer, until the user asks for more.

```js
function reuseGroups(entries) {
  const byPassword = new Map();
  for (const e of entries) {
    const key = e.password;                   // grouping key, never displayed
    if (!byPassword.has(key)) byPassword.set(key, []);
    byPassword.get(key).push({ service: e.service, username: e.username });
  }
  return [...byPassword.values()].filter(g => g.length > 1);
}
```

Main screen shows "3 reused passwords." Clicking lists the groups by
service and username. The password is the grouping key and is never
rendered — the user learns that `github.com/joe` and `gitlab.com/joe`
share a password without PAM ever showing it.

**Why this ranks first on value.** It is the check that would have
answered the original Apple question immediately. It needs no corpus,
no network, and no privacy tradeoff. It is also the one check a
password manager can perform that a per-password checker structurally
cannot — reuse is a property of the whole set, not of any one entry.

Consider hashing the grouping key rather than using the raw password,
so the reuse map can be computed and held without raw secrets in a
second data structure.

---

## 3. Vault diff

**Question answered:** "What differs between these two vaults?"
**Disclosed:** service and username of differing entries. Never secrets.

Given a second vault file and its passphrase, report:

- entries only in A
- entries only in B
- entries in both whose passwords differ (report *that* they differ,
  never the values)

This is the operation performed by hand with two plaintext CSVs. Inside
PAM no plaintext needs to touch storage.

### Prerequisite

This is the one with real edge cases and should not be scheduled with
the others:

- **Stable entry identity.** If entries have no durable ID, "same
  entry" has to be inferred from service plus username, which breaks
  when either is edited. Adding a durable ID is likely a schema
  migration and is a prerequisite, not part of this feature.
- **Cross-version crypto.** Two files may be at different crypto
  versions given the encryptV2 work. Diff must handle a v1 file against
  a v2 file.
- Entries matching on service but not username, and vice versa.

---

## 4. Breach check

**Question answered:** "Has this password appeared in a known breach?"
**Disclosed:** a 20-bit hash prefix.

Port the discipline already worked out in `pwcheck.py`:

- k-anonymity range query; the full hash never leaves the device
- check every distinct Unicode normalization form, not just the one
  entered (macOS hands out NFC in some contexts and NFD in others; the
  same visible password hashes two ways)
- **three-state result**: found / not found / *could not check*

### The critical requirement

PAM is a PWA and offline is a normal state. A user who is offline must
never see "no problems found." Every failure path — no network, HTTP
error, malformed response, empty body — must resolve to "unknown,"
never to "clean."

Under the existing TDD phases, **write the failure tests first**: assert
that an unreachable API, a 502 HTML error page, and an empty response
body each produce "unknown" rather than a pass. In the shell version of
this tool that exact bug appeared three separate times, in three
different disguises, and each time it looked like a working program.

Optional, lower priority: near-variant checking (a password absent from
the corpus whose base form appears 50,000 times is not safe). Costs one
extra range query per variant.

---

## 5. Export tiering

**The actual lesson of the incident.**

Today the industry offers one export: everything, in the clear. Offer
three:

| Tier | Contents | Use case |
|---|---|---|
| Fingerprint | 64 bits | "Are these the same vault?" |
| Metadata | service + username, no secrets | audit, inventory, diff, "what do I have accounts with?" |
| Full | everything | genuine migration to another manager |

Most reasons people export are satisfied by the first two tiers. Each
one satisfied is a plaintext dump that never gets created.

If full export stays, consider emitting FIDO CXF rather than CSV. CXF
became a FIDO Proposed Standard in August 2025 and CXP (which wraps the
transfer in HPKE) has shipped on iOS and Android; Apple, Google,
Microsoft, 1Password, Bitwarden and Dashlane are all contributors.
Supporting it would let PAM interoperate without ever producing a
plaintext file.

---

## Suggested order

1. **Fingerprint** — small, self-contained, pure function over an
   existing array
2. **Reuse count** — highest value, same shape, no dependencies
3. **Export tiering** — mostly UI over data structures items 1 and 2
   already produce
4. **Breach check** — port from `pwcheck.py`, failure tests first
5. **Vault diff** — blocked on stable entry IDs; schedule separately

Items 1, 2 and 3 are pure functions over the decrypted entry array. No
mocking, no network, no new crypto — they fit the existing TDD setup
directly.

---

## Open questions

- Does the current schema have a durable per-entry ID? (Gates item 3.)
- Should the fingerprint cover passwords, or only service/username?
  Content-only means an edited password changes the fingerprint, which
  is probably what a user wants but should be confirmed.
- Should reuse detection normalize before comparing, so that a password
  stored in NFC and the same password in NFD count as reuse? Argument
  for: they are the same password to the user. Argument against: they
  are different bytes and will behave differently at a login form.
- Is there a case for a "vault health" summary combining items 2 and 4
  into one screen, or does that re-introduce the dump-everything
  pattern in a new shape?
