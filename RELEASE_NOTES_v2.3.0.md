# PAM v2.3.0 Release Notes

## Summary

Adds `www/js/vault.js`, a module of minimum-disclosure queries over the vault:
a short fingerprint for comparing two vaults, and password reuse detection.
Both answer their question with the least information that suffices, and
neither needs a network, a corpus, or any privacy tradeoff.

This release contains the logic and its tests. UI wiring is not yet included.

---

## Why

Answering "are the password stores on these two devices the same?" in Apple's
Passwords app required exporting both vaults to plaintext CSV, because a full
dump was the only egress on offer. The question needed sixty-four bits — a
`sort | shasum` over the exports settled it — but there was no way to get them
without first creating the least safe artifact in the whole exercise, on disk,
and then trying to erase it from a copy-on-write filesystem where erasure is
not really available.

The principle this release starts on: every question a user might ask of their
vault should have an answer that discloses the minimum needed to answer it.
Full disclosure stays available, but as the last resort rather than the only
door.

See `PROPOSAL.md` for the remaining items.

---

## New: `www/js/vault.js`

All four functions are pure, taking the records array that
`convertInternalDataToJSON()` produces. They never touch the DOM, so they are
tested with plain object literals rather than accordion fixtures.

### `vaultFingerprint(records)` → `Promise<string>`

Sixty-four bits of SHA-256 over a canonical form, rendered as four hex groups
(`3f2a 91c4 0e88 d517`). Two devices showing the same four groups hold the
same vault.

Sorting is load-bearing: records and fields are ordered by content before
hashing, so two identical vaults serialised differently agree. That is the
specific failure this exists to prevent — an order-sensitive comparison
reports a difference that is not there.

The canonical form is JSON-encoded rather than delimiter-joined. An earlier
draft joined values with a separator character, which meant a value containing
that character could make two different vaults hash identically: the value
`u:v` in a field named `p` against the value `v` in a field named `p:u`. JSON
quoting and escaping removes the boundary a value could forge.

`created` is excluded. `convertInternalDataToJSON()` stamps the current time
into any record lacking one, so a fingerprint covering it would change on
every call. The question is "same content?", not "same content and same save
history?". `title`, `active`, and every field's name, type and value are
included.

### `reuseGroups(records)` → `Array`

Groups of entries that share a password, reported as `{title, name}` pairs.
The password is the grouping key and is never returned, so the UI can say that
two entries collide without displaying the secret they collide on.

Reuse is a property of a **(record, field) pair**, not of a record. A record
may hold several password fields, and two fields within one record can collide
with each other. This differs from the sketch in `PROPOSAL.md`, which assumed
one password per entry.

### `reuseCount(records)` → `number`

The headline figure. Counts fields rather than groups: three entries sharing
one password is three passwords to change, not one.

### `canonicalizeRecords(records)` → `string`

Exported for testing and for any future vault diff.

---

## Tests

Thirty-three tests in `www/tests/tests.html`, in the existing vanilla-JS
harness. No new dependencies.

Every one was mutation-tested — the implementation was deliberately broken in
eight ways and each break was confirmed to fail the suite. Two of those checks
were worth the trouble:

- Removing either sort is caught. Without that, the tests could pass while the
  feature failed at the only thing it is for.
- Returning the password from `reuseGroups` is caught, so the non-disclosure
  property is enforced rather than merely intended.

An earlier version of the delimiter test was **vacuous**: it hardcoded the
separator the implementation happened to use, so it passed even when the
separator was changed to a forgeable one. It was checking that one specific
character was absent, not that boundaries could not be faked. The current test
is separator-agnostic, trying ten candidates, and it was what surfaced the
collision described above.

---

---

## Fixed: search matched against password plaintext

`search.js` matched the value-search regex against `data-fld-raw-value`, which
holds the plaintext of `password` fields. With `searchRecordFieldValues`
enabled, that made the search box a **password oracle**. The password never
appears on screen, but the filter results and the record count answer a yes/no
question about it on every keystroke, with nothing written to the screen, the
clipboard, or a log.

`searchRecords()` compiles its input with `new RegExp()`, so this is a binary
search rather than a linear walk. `^[n-z]` halves the remaining possibilities
in a single query, `^..x` probes a specific position, and `.{12}` yields the
length outright. A password that would take thousands of guesses one character
at a time falls in a few dozen queries. Brief access to an unlocked vault is
enough.

The existing code had `let type = element.getAttribute('data-fld-type')` sitting
unused above the comment "how should passwords be managed? using the raw
value", so the hazard had been noticed and the fix left unfinished. `unused` is
off in `jshint.json`, so nothing flagged the dangling variable.

Password-typed fields are now excluded from value search unless the new
`searchPasswordFieldValues` preference is enabled. It defaults to false, sits on
the Administration tab beside the other two security settings, and raises a
**⚠ PW SEARCH** toolbar badge while active — matching the existing treatment of
`allowHtmlFieldRendering` and `filePassCache`.

Exclusion keys off the field **type**, not the field name, so a password stored
in a field named `token` is still protected. There is a test for exactly that.

Seven tests cover this, including the regex probes an attacker would actually
use. They come in mirrored pairs: one asserting the probes cannot select on
password content with the preference off, and one asserting they *can* with it
on. The second exists because a negative test alone can pass for the wrong
reason — and it did. The probe `^[a-m]ecret1` cannot match `secret1`, since
`s` is not in `a-m`, so it was matching nothing and proving nothing. Only the
mirror test caught it.

Four mutations were checked against the real module: reinstating the oracle,
ignoring the preference, keying off the field name instead of the type, and
breaking non-password value search. Each fails the suite.

To find which record uses a password you already know, use the reuse dialog
rather than the search box.

### Note on the retired-address use case

Finding every record that references a retired email is already supported:
enable `searchRecordFieldValues` and type the address. It is off by default,
which is why it is easy to miss. That is a search problem — known value, find
the records — and it stays in search. Reuse detection is the opposite shape:
unknown values, find the collisions among them. It cannot be a search, because
you would have to know the password already and would be typing a live secret
into the search box.

---

## Not in this release

- UI wiring for the fingerprint (About dialog) and the reuse badge and dialog
- The `showPasswordReuseWarning` preference
- Vault diff, which is blocked on records having a durable identifier;
  today "same entry" can only be inferred from title plus field names, which
  breaks as soon as either is edited
- Breach checking
- Export tiering
