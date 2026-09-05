# PAM v2.3.0 Release Notes

## Summary

Three things, in descending order of how visible they are to a user.

**Password reuse detection.** A `Reused Passwords` report and a toolbar badge
showing when any stored password is used more than once. The report lists the
entries that share a password and never shows the password itself. Computed
entirely on the device — no request is made and nothing is uploaded.

**A vault fingerprint.** Two short hashes in the About dialogue, one over
active records and one over inactive, for answering "are these two vaults the
same?" without exporting either. This came out of a real failure: an Apple
Passwords warning disagreed between devices, and settling it required dumping
both vaults to plaintext CSV because a full export was the only egress on
offer. The question needed 64 bits.

**A security fix.** The search box matched against password plaintext, and
because it compiles the input as a regular expression, that made it a binary
search over stored secrets rather than a linear walk. Now behind a preference,
default off, with a toolbar warning when enabled.

Underneath those, the documentation is now generated: 49 of PAM's 51 help
screenshots are captured by `make screenshots`, and `make check-images`
verifies that the README and the harness agree. Several images had been stale
since 2023.

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
same records.

The About dialogue publishes **two** fingerprints, partitioned by `active`:

```
Fingerprint (active)    3f2a 91c4 0e88 d517
Fingerprint (inactive)  b7c1 4e02 aa39 6d85
```

The inactive line appears only when there are inactive records. With none,
nothing sits outside the active view and the line would be noise; when it does
appear, its presence is itself the signal that something is there.

Partitioning rather than nesting, because the two hashes are then independent
facts. Matching active lines with differing inactive lines tells you your live
credentials are in sync and the difference is confined to archived records. A
single hash over both would say only that something changed, and a single hash
over the active records alone would be worse: device A with three active and
two inactive records, and device B with the same three active and none of the
inactive, would report as identical — and the user would never learn that two
records they deliberately kept (they deactivated rather than deleted them) are
missing from B. There is a test for exactly that scenario.

A 64-bit digest reveals no titles, no fields and no count, so publishing the
inactive line does not surface the records themselves. It only makes their
absence detectable.

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

### The INACTIVE display marker

`record.js` prefixes a deactivated record's accordion title with
`<small>*INACTIVE*</small>&nbsp;`, and `convertInternalDataToJSON()` copies
that innerHTML verbatim — so the marker is part of every title string these
functions see, and it reached the reuse dialogue as literal escaped text.

`stripInactiveMarker()` removes it. The dialogue draws an `INACTIVE` badge
from the record's `active` flag instead, so the distinction is still visible.

Rendering the title as HTML would have been the shorter fix and the wrong one:
titles are user-controlled, and treating a user-controlled string as markup is
exactly what PAM refuses to do by default for field values
(`allowHtmlFieldRendering`). A new dialogue should not quietly opt out of that.

The strip is anchored, so a title that merely mentions the text mid-string is
left alone. It also applies to the fingerprint, which is now independent of the
marker: `active` already records whether a record is deactivated, and the title
need not encode it a second time.

`reuseGroups()` members gained an `active` field so callers can draw the label
themselves.

### Inactive records and the reuse report

The reuse report honours `hideInactiveRecords`. An inactive record is a
retired credential: a collision with one is not something to act on, and
reporting it would be noise that teaches people to ignore the badge. The
dialogue states when records have been excluded, since an absence is the
hardest thing for a user to notice.

The fingerprints are deliberately not filtered this way. The report is a view;
the fingerprint is an identity, and one whose meaning silently depends on a
setting cannot do the job it exists for. Note also that `hideInactiveRecords`
is stored inside the vault file, so a filtered fingerprint would not be a
function of the vault's contents at all.

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

One pre-existing test changed. `searchRecordFieldValues=true: matches on field
value` searched for `ghp_abc123` to prove value search worked — but that is the
value of GitHub's `token` field, which is password-typed and is now excluded.
The test used a secret to demonstrate a general capability, so it no longer
demonstrates anything about value search. It now searches for `jlinoff`,
GitHub's username, and a companion test asserts that `ghp_abc123` is *not*
found. The behaviour change is recorded in the suite where a reader would
look for it, not only in the new one.

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

---

## UI: reuse badge, duplicates dialogue, fingerprint in About

`www/js/vault-ui.js` holds everything that touches the DOM, so `vault.js`
stays pure and unit-testable with plain object literals.

### Reuse badge

A `⚠ REUSED: n` badge in the toolbar, alongside the existing `⚠ HTML ON` and
`⚠ PASS: LOCAL` indicators and using the same show/hide mechanism. It is
hidden when the count is zero, so a clean vault costs no screen space at all
— the common case adds nothing to the display. Clicking it opens the
duplicates dialogue.

### Duplicates dialogue

Reachable from the badge and from a `Reused Passwords` menu entry, since the
badge is hidden most of the time and a feature you can only reach when
something is wrong is hard to discover.

Entries are listed by record title and field name. The shared password is the
grouping key and is never rendered: you learn that two entries collide
without being shown the secret they collide on. There is a test asserting the
dialogue's text does not contain the password.

### `showPasswordReuseWarning`

Defaults to true, on the Administration tab. It suppresses the **badge only**
— the check still runs and the count is still available, so there is no state
in which PAM knows a password is reused and has no way to tell you.

Note this is a new category for PAM: the two existing badges cannot be
dismissed, only fixed. This one can be silenced.

### `refreshVaultStats()` and coalescing

Every path that adds, edits, clones or deletes a record already funnels
through `setNumRecords()`, so that is the single hook rather than six
scattered call sites. `clearRecords()` bypasses it and is hooked separately,
as is the end of a file load.

The refresh is **coalesced**, not immediate. Loading a file calls
`insertRecord()` once per record and each of those calls `setNumRecords()`;
walking the whole accordion each time would be quadratic. Repeated requests
in the same tick collapse into one.

The fingerprint is asynchronous (`crypto.subtle`) while the About dialogue is
built synchronously, so About reads a cached value and is updated in place
when the hash arrives. If `crypto.subtle` is unavailable — it requires a
secure context — About says the fingerprint is unavailable rather than
showing a stale or empty value.

### Import cycle

`record.js -> vault-ui.js -> save.js -> record.js`. ES modules tolerate this
because every binding is used at call time rather than during module
evaluation, and it was verified by loading the graph rather than assumed. If
that ever becomes fragile, the fix is to move `convertInternalDataToJSON()`
out of `save.js` into a module of its own.

### Tests

Ten unit tests for the badge, the dialogue and the preference default. Two
e2e tests.

The e2e reuse test is **mirrored on purpose**. The example records contain no
reused passwords, so a test that only loaded them and checked the badge was
hidden would pass whether or not the feature works — an empty list is also
what a broken implementation returns. It therefore establishes the clean
baseline, then creates two records sharing a password through the New Record
dialogue, and asserts the badge appears and the dialogue names both entries.
Going through the UI rather than injecting DOM state means the
`insertRecord -> setNumRecords -> scheduleVaultStatsRefresh` path is actually
exercised.

`example.txt` was deliberately left alone. It is user-facing documentation,
and seeding it with a reused password to make a test convenient would teach
the wrong thing in the one file new users read.

The `Reused Passwords` entry sits after `Save File`, among the utilities,
rather than second in the list. About, Preferences, New Record, Clear
Records, Load File and Save File therefore keep their existing positions,
which is worth protecting: those are the items people reach for without
looking.

Two pre-existing e2e assertions changed. Both `choose_menu_option()` and
`test_pam_setup()` assert a hard menu-item count, raised from 8 to 9. They
are independent assertions of the same fact and have to move together; the
second was missed on the first pass because only the helper was searched.

`test_pam_setup()` also asserted the menu contents one index at a time, with
a comment explaining that index 6 was reserved for Print. That is now a
single ordered comparison against the full expected list: a mismatch reports
the whole menu rather than one item, and inserting an entry is one edit
rather than five renumberings.

The comparison reads `textContent` rather than Selenium's `.text`. Print
carries Bootstrap's `d-none` unless `enablePrinting` is set, and Selenium
reports `''` for the text of a non-displayed element — which is why the
original check skipped that index rather than asserting on it. Reading
`textContent` covers the whole menu including entries that are currently
hidden, so the assertion is stronger than the one it replaced.

---

---

## Screenshot automation

`tests/screenshots.py`, run via `make screenshots`. `SHOT=<substring>` limits
the set while iterating; a full pass is 49 captures in about five minutes.

The README is the in-app help — `make app-help` renders it into
`www/help/index.html` — so a stale screenshot is stale help, not just a stale
doc. And they were stale: `pam-about-custom.png` showed **Version 1.1.2,
Bootstrap 5.3.0-alpha1 and a commit from March 2023**. Others showed seven
example records and a record count that no longer matched.

**49 of 51 images are now generated.** Two are maintained by hand and say why
in the tooling: the hand-drawn file-flow diagram, which illustrates
architecture rather than UI state, and a record field mid-drag, which Selenium
cannot reliably produce.

The Administration preferences tab had **never been documented at all**,
despite holding four security-relevant settings.

### Determinism

Rendering is not reproducible across machines — font hinting, DPI and the
Chrome version all affect the bytes — so one machine regenerates and files are
written only when the bytes actually change. Two consecutive runs should report
every image as `same`; a single run cannot distinguish a correct capture from
one that differs every time.

Six sources of churn were found that way, each producing a plausible-looking
image:

- generated passwords, fixed by seeding the RNG **in the browser session only**
  — `www/js/password.js` ships unchanged and carries no test hook
- a blinking text caret in a focused input
- scroll position in a field whose content overflows
- creation timestamps on newly saved records
- the printed report's `Printed:` line, at minute resolution
- a viewport size left behind by the previous capture

### Guards

Each capture checks the thing that would otherwise fail silently: zero-size
elements, truncation (by comparing the PNG's own header height against the
element), whether a stubbed value was actually replaced, and whether the state
a shot claims to show is present. `pam-status-msg.png` was captured with **no
status message** for several runs — every guard passed, the element was real
and correctly cropped, and it was only caught because it came out
byte-identical to another image.

### Prose instead of arrows

Ten images carried red arrows and captions. Those cannot be scripted, so the
help text was rewritten to name each control and where it sits — which is
better documentation regardless: prose is searchable, translatable, and
survives a re-capture.

Every one of the ten turned out to be a picture the README already had, with an
annotation doing the work a sentence should have done. `pam-create-new-record`
and `pam-new-record-menu` were the same image; both are now `pam-menu.png`.
`pam-change-field-name`, the most heavily annotated in the set, was
`pam-fld-name-edit-on.png`. Twelve files were deleted as duplicates.

## New: `tests/check_images.py`

`make check-images` verifies that the README and the harness agree. It compares
filenames only — no browser, no server, no rendering — so unlike
`make screenshots-check` it gives the same answer on any machine.

That distinction matters. Byte-comparing screenshots is a change detector for
the one machine that regenerates them; anywhere else every image reads as
stale, and a check that fires spuriously is one you learn to ignore.

It reports images referenced but not captured, captured but never referenced (a
documentation gap), files that are neither, several names holding identical
bytes, and in-page links pointing at no heading. The first run found nine
broken anchors and three copies of one picture.

**It runs as part of `make lint`**, and therefore as part of `make test`.
Documentation is a first-order part of the build rather than something checked
afterwards: a dead anchor or a stale image reference is invisible in a Markdown
preview and in the rendered help page, so nothing else would ever catch it.

## Example records

`www/examples/example.txt` gained two records, taking it from seven to nine:

- **Instagram**, sharing Facebook's password exactly. Without a real
  collision the demo vault never triggers the reuse report and a new user
  never discovers the feature exists.
- **Toys-R-Us**, deactivated. Demonstrates Hide Inactive Records, and gives
  the About dialogue a second fingerprint line — a case that previously had no
  screenshot anywhere.

Both carry a note explaining why they are there, so the demo vault reads as
deliberate rather than careless.

### Consequences

Changing shared fixture data broke three counts and two tests:

- `test_chrome.py` asserted seven example records; now nine. All nine are in
  the DOM — the inactive one is hidden, not absent.
- The README said "example with seven records".
- The screenshot stub hardcoded "Loaded 7 active and 0 inactive records".
- **`test_print_cover_record_count` was comparing unlike things.** It counted
  `accordion-button` elements against what the printed report says, and
  `genRecordsDocument()` counts *visible* records. Those were the same number
  while every record was active; with a deactivated record the accordion holds
  nine and the report covers eight. The test now filters `d-none` the same way
  print does.
- **`test_reuse_badge_and_dialog` used the example records as its clean
  baseline**, which stopped being clean. The baseline is an empty vault now:
  Clear Records, assert the badge is hidden, then load the examples and assert
  it appears naming Facebook and Instagram. Still mirrored, and the positive
  case comes from real data rather than records the test builds itself.

The last two are the same failure in two places: a negative assertion whose
premise quietly disappeared. Those keep passing when what they depend on stops
being true, which is what makes them the fragile ones.

## Documentation

Beyond the regenerated images, the help text changed where it had drifted from
the code:

- **A `Reused Passwords` section**, and **Reason 10: Duplicate Password
  Checking** in the reasons-to-use-PAM list.
- **The Layout section** rewritten so the prose names each region and the
  controls in it, replacing an annotated figure — and gaining a table of the
  four toolbar warning badges, which had never been documented together.
- **The Expanded View section** rewritten the same way, naming the clipboard
  icon, the eye icon and the three record buttons.
- **The comparison table** claimed PAM lost to Bitwarden and 1Password on
  "breached, weak, and reused" passwords. Reuse had quietly stopped being true.
  It is now two rows: reuse detection as a tie on capability and a PAM win on
  disclosure, breach alerts as a straight loss.
- **Nine broken internal links** fixed, including one section that was
  referenced but had never been written.
- Field names in the Facebook examples said `url`; the example data says
  `website`. The field-adding control was called the "New Record" menu; it is
  labelled **New Field**.

## Not in this release

- **Breach checking.** Designed and scoped in `PROPOSAL.md`, deliberately held
  for v2.4.0. It requires relaxing the Content-Security-Policy to permit
  `api.pwnedpasswords.com`, which changes PAM's local-only guarantee from
  "cannot phone home, verifiably" to "can only phone HIBP, and does not unless
  asked". That is a change a user should see as a release headline rather than
  as a footnote under a reuse feature.
- **Vault diff**, blocked on records having a durable identifier; today "same
  entry" can only be inferred from title plus field names, which breaks as soon
  as either is edited.
- **Export tiering** — fingerprint, metadata and full — which is the actual
  lesson of the origin story above.
