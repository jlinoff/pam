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

## The entropy estimate now understands words

Found while deciding whether the password generator needed a breach button.

The estimate was `length x log2(alphabet)`, which is right for a random string
and badly wrong for a passphrase. It scored `std/creature/history` at **118
bits** when three words from PAM's 9,858-word list carry about **40** — a
threefold overestimate, in the unsafe direction, for exactly the passwords PAM
generates. None of the structural checks caught it either: a passphrase has no
keyboard run, no character sequence, no repeat, and cleared the 60-bit floor on
the inflated figure.

`entropyBits()` now computes both a character estimate and a word estimate and
returns the **lower** of the two. A passphrase is both a sequence of characters
and a sequence of words, and its real strength is whichever description an
attacker will use. Only separator-delimited passwords where every part is a
dictionary word are treated as word-based; guessing at concatenated words would
understate a password that merely contains one, and a false rejection teaches
people to ignore the tool.

**The generator defaults moved with it**, because correcting the measurement
would otherwise have made PAM flag its own output as weak:

| | before | after |
|---|---|---|
| `memorablePasswordMinWords` | 3 (40 bits) | **5 (66 bits)** |
| `passwordRangeLengthDefault` | 20 | **30** |

These are coupled and cannot be changed separately: the generator adds words
until it reaches the target length, so 20 characters cannot hold five words.
Raising the length also lengthens generated cryptic passwords, from about 131
bits to 196.

If you prefer shorter memorable passwords, the README's *Memorable Password Min
Words* section gives the trade-off in full — three words falls in 96 seconds
against a fast unsalted hash, and holds for millennia against a rate-limited
login. The offline column is the one that matters, because you cannot know
which sites store passwords badly.

## Fixed: two sets of preference defaults

`prefs-model.js` exported `getDefaultPrefs()`. `prefs.js` had its own hardcoded
copy in `initPrefs()`. **The application used the second; every unit test
asserted the first.**

They had drifted since v2.3.0. `searchPasswordFieldValues` — the search-oracle
fix — `showPasswordReuseWarning` and `enablePasswordBreachCheck` were missing
from `initPrefs()` entirely, and worked only because `undefined` is falsy. The
tests asserting their defaults were checking an object the running application
never read.

`initPrefs()` now delegates to `getDefaultPrefs()`, keeping only what is
genuinely its own: the help links and the per-device `filePassCache` override.
A test compares the two and fails on any disagreement.

## Fixed: memorable passwords used a non-cryptographic generator

Found by CodeQL on the release pull request.

Cryptic passwords were generated with `crypto.getRandomValues()`. **Memorable
passwords were not** — word selection used `Math.random()`, which is not a
cryptographic generator: its internal state is recoverable from a small number
of observed outputs, and the generator shows five suggestions drawn from the
same stream.

This also undercut the entropy figures above. "Five words is 66 bits" assumes
each word is an independent uniform draw from the list; it was neither.

Both generators now use a shared `randomInt()` that draws from the CSPRNG and
rejects values that would introduce modulo bias. That bias was present in the
cryptic path too — it mapped a random byte with `% 72`, slightly favouring the
first 40 characters of the alphabet.

**If you generated a memorable password with an earlier version of PAM and it
protects something that matters, regenerate it.**

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
- **The README's table of contents is open by default.**
- **`make test PORT=8088` never worked.** The Makefile threaded `$(PORT)`
  through the server while the tests hardcoded `localhost:8081`, so a
  non-default port started a server the tests never spoke to. `PORT` now
  reaches the tests, which also lets `make test` and `make screenshots` run
  concurrently on different ports.
- The shipped example vault carried its own preferences, including
  `filePassCache: 'local'` — the weaker of the two caching strategies, and the
  one SEC-002 deliberately made non-default. Loading the examples silently
  switched you to it. Both example files now match the current defaults.

## Not in this release

- **Vault file integrity.** `decryptV2` uses AES-CBC with no authentication
  tag, so a wrong password is only detected when the padding happens to fail —
  about 255 times in 256 — and a PAM file has no tamper-evidence. Fixing it
  means AES-GCM and a v3 format with migration. Item 9.
- **A dictionary-aware entropy estimate.** Item 13.
