# PAM v2.4.0 Release Notes

## Summary

Adds **password breach checking** against the
[Have I Been Pwned](https://haveibeenpwned.com/) corpus, together with local
checks for structurally weak passwords. Both are reachable from a new
`Breached Passwords` report, from any password field, from the record editor,
and from the password generator.

This is the first release in which PAM contacts anything at all. That is the
consequential part, and most of the work went into making it honest: the
feature is **off by default**, it announces itself with a toolbar badge, the
single host it may reach is named in the Content-Security-Policy where you can
check it, and a lookup that fails is reported as *could not check* rather than
as a clean result.

## Why the failure case got most of the attention

PAM is a progressive web app. Being offline is a normal state, not an error.

A breach checker that silently reports "no problems found" when it could not
reach the corpus is worse than no breach checker, because it converts an
absence of information into an assurance. There are three outcomes, and the
third is not a verdict on the same axis as the other two — it is the program
reporting that it failed to reach one:

| Outcome | Meaning |
|---|---|
| **⚠ BREACHED** | found in the corpus; it is published, change it |
| **⚠ WEAK** | not in the corpus, but the local checks objected |
| **could not check** | the lookup failed; **nothing was learned** |

Sixteen tests were written against the failure paths before a single line of
the success path: unreachable host, HTTP error, an HTML error page from a
proxy, an empty body, a whitespace-only body, one malformed line among valid
ones, a body that cannot be read, a response of the wrong shape, and an empty
password. Every one asserts `CANNOT_DETERMINE`.

## What is sent, and what is not

The range API's k-anonymity model. PAM sends the first five characters of a
password's SHA-1 hash — twenty bits — and receives every hash in the corpus
beginning with that prefix, typically around eight hundred of them. The
comparison happens in the browser.

Five hex characters divide the corpus into about a million buckets, so the
server learns only that someone asked about one of the several hundred entries
sharing that prefix, or about some password not in the corpus at all, which it
cannot distinguish from the first case. The password, its full hash, the record
it belongs to, and the rest of the vault are never transmitted.

Checking a whole vault sends one request per **distinct** password: a password
used by three records costs one request, not three. Requests are serialised
with a short pause — a burst of hundreds from one address is impolite, and a
weaker privacy property than the same requests spread out, since it links them
in time. A real vault of 220 distinct passwords took 37 seconds. **Cancel**
stops the run, and so does closing the report.

Nothing is sent by opening the report. The requests begin when you press
**Check**.

## The Content-Security-Policy trade

`connect-src` now permits `api.pwnedpasswords.com`. Before this, there was no
`connect-src` directive at all: it inherited `default-src 'self'`, and the
policy made a stronger statement than any sentence in this document could —
that the page **could not** contact anyone, verifiable by reading one line.

It now says something weaker but still useful: PAM cannot contact anyone
**else**. The unit tests assert the exact contents of `connect-src`, so adding
a host requires deliberately deleting an assertion that says why not. Widening
that directive is how a local-only application stops being one, a host at a
time, each addition reasonable on its own.

The policy permits that host whether or not the preference is enabled. A
`<meta>` policy is fixed when the page is parsed and cannot be rewritten from
JavaScript, and multiple policies compose by intersection — every policy
present must permit a request — so a second one could only tighten the first.
Both rules exist so injected script cannot widen a page's policy; the
consequence is that PAM cannot narrow it conditionally either.

That property does real work here. Even if an attacker achieved script
execution, `connect-src` still confines outbound traffic to PAM's own origin
plus one named host — they could read the vault in memory and have nowhere to
send it.

## Being absent from a breach corpus is a low bar

`Summer2026` is in no corpus worth the name and is still a bad password, so
PAM applies checks that need no network: keyboard runs, character sequences, a
character repeated four or more times, an embedded year, a rough entropy floor
of 60 bits, and a minimum length of 12.

These run whether or not the corpus is reachable. **A structurally weak
password is rejected even when the lookup fails** — those checks need no
network, so being offline is no reason to withhold an objection that can be
made locally.

They are deliberately conservative. The risk with structural checks is not
missing a weak password; it is rejecting a good one, which teaches people to
ignore the tool. A test runs every password from the example vault and the
generator through them and requires zero false rejects.

## Where you can check a password

- **`Breached Passwords`** in the menu — the whole vault, with progress and a
  cancel button. Always present; with the feature off it explains what would
  be sent and what would not, so the disclosure appears when you are deciding.
- **Any password field** in a record.
- **The record editor**, beside the generator button. The most useful of the
  four: the last moment before a password is adopted. The result clears as soon
  as you edit the value, since it would otherwise describe a password you no
  longer have.
- **The password generator**, beside each suggestion.

The generator button exists for the **memorable** passwords specifically. A
20-character cryptic password carries about 130 bits of entropy and will not be
in a corpus; three words from PAM's 9,858-word list carries about 40. PAM's
local entropy estimate cannot tell the difference — it measures length and
character variety, not dictionary structure — so for word-based passwords the
corpus is the only check capable of objecting.

## The reports are actionable

Both reports let you act on a finding rather than only read it. In a vault of a
few hundred entries, locating the records a report names is most of the work.

- In **Reused Passwords**, clicking a group's heading selects that group's
  records in the main window and closes the report.
- In **Breached Passwords**, clicking an entry's title selects that record.

The search box is populated with the pattern rather than filtered behind your
back — an unexplained filtered list is worse than an odd-looking search term,
and the existing clear button undoes it. Titles are escaped before the pattern
is built, so a record called `Bank (old)` selects itself rather than something
unexpected, and the pattern is anchored so `Google` does not also bring in
`Google Cloud`.

## Known limitation

The entropy estimate scores `std/creature/history` at 118 bits when the true
figure is about 40, because it has no notion of dictionary words. None of the
structural checks catch word-based weakness either. This is why
`MIN_ENTROPY_BITS` is not exposed as a preference: against a threefold
estimator error, tuning a threshold between 60 and 80 would be false precision.
Recorded in `PROPOSAL.md` as item 13.

## Also in this release

- **Fixed:** deactivating a record left it in the reuse report. The toggle
  refreshed the display but never recomputed the vault statistics, because
  every other refresh site fires on a change of record *count*. The
  fingerprints were stale for the same reason.
- **Fixed:** two unit-test suites ran without gating the build. `finalize()`
  was called per-runner rather than once at the end of the chain, so the last
  two suites rendered their results while the totals reflected the state before
  they ran — their failures would have been visible and still passed. The
  vault-fingerprint suite was in that position for all of v2.3.0.
- **`make check-images`** now verifies every image the README references, not
  only the `pam-*.png` captures, and runs as part of `make lint`.
- The Menu section of the README claimed seven menu entries when there were
  ten, and neither `Reused Passwords` nor `Breached Passwords` appeared in the
  table of contents.

## Not in this release

- **Vault file integrity.** `decryptV2` uses AES-CBC with no authentication
  tag, so a wrong password is only detected when the padding happens to fail —
  about 255 times in 256 — and a PAM file has no tamper-evidence. Fixing it
  means AES-GCM and a v3 format with migration. Item 9.
- **A dictionary-aware entropy estimate.** Item 13.
