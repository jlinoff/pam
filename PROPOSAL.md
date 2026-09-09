# PAM — Minimum-Disclosure Vault Queries

**Working document.** Items move out of here as they land; anything still
listed is either unbuilt or has open questions against it.

**Date:** 2026-09-01, updated 2026-09-03

---

## Origin

This came out of a real failure. An Apple Passwords warning disagreed between
devices, and answering the question "are these two vaults the same?" required
exporting both vaults to plaintext CSV — because a full dump was the only
egress on offer. The question needed 64 bits (`sort | shasum -a 256`), but the
interface had no way to produce them.

The plaintext files then had to be shredded, which on APFS with copy-on-write
and SSD wear-levelling is not something you can reliably do. FileVault and the
absence of local snapshots saved it. The whole exposure existed because a
checksum-shaped question had only a dump-everything-shaped answer.

**Principle:** every question a user might ask of their vault should have an
answer that discloses the minimum needed to answer it. Full disclosure should
be the last resort, not the only door.

---

## Status

**v2.4.0 is released.** Items 5, 6, 10, 11, 12 and 13 shipped in it.

**v2.4.1 is a security release** on top of it, covering item 16 — CodeQL found
that memorable passwords were generated with `Math.random()`. That work also
turned up two adjacent defects: the strength checks rejected valid passwords
about 2.6% of the time, and the in-record generator ignored the length
preference. Neither was introduced by v2.4.0; both were exposed by it.

Items 7, 8, 9, 14, 15, 17 and 18 remain open or deferred. Two of them have a
cheap non-breaking path that was not obvious when they were raised: **9a**
(tamper evidence via a hash in `meta`) and **18** (stable CXF identifiers via
salted title hashes). Both exploit the same property — older versions ignore
keys they do not recognise.

**9a is done** — see item 9. What follows was written before that and is kept
because the reasoning still applies to what remains.

**The one high-priority item was 9a:** a PAM vault has no tamper evidence and no
reliable wrong-password check, which is a real defect in a security tool. 9a
closes both with a content hash in `meta`, needs no format change, and could
ship in any release.

**9b is no longer assumed to follow.** The breaking format change was reviewed
and accepted while this document claimed 9a was a stopgap and AES-GCM the
correct end state. On reassessment that overstated the gap: 9a detects tampering
essentially completely, and 9b's remaining advantages are narrow in PAM's threat
model. The acceptance stands if 9b is built, with its two conditions, but 9b
should now prove itself necessary **after** 9a exists rather than being
scheduled ahead of it. See the reassessment in item 9.

Nothing else on this list is urgent.

Item numbers are stable identifiers, not priorities: an item keeps its number
for the life of the document so cross-references hold. Sections appear in
numeric order. A low number means the item was raised early, nothing more.

Every section heading ends with its state, using the same vocabulary as the
table above — `RELEASED in vX`, `OPEN`, `DEFERRED` or `IDEA`. The heading and
the table row must agree; if they disagree, one of them was not updated when
the item moved.

| Item | State |
|---|---|
| 1–4 | **released in v2.3.0** — see `RELEASE_NOTES_v2.3.0.md` |
| 5. Password breach check | **released in v2.4.0** |
| 6. README pass | **released in v2.4.0** — including SECURITY.md, which claimed "No data is ever sent to a server" |
| 7. Vault diff | deferred, **not blocked** — works today without record IDs; they add rename detection |
| 8. Export tiering | deferred |
| 9. Vault file integrity | **9a RELEASED in v2.5.0** — SHA-256 of records and prefs in `meta.integrity`, no format change; catches the targeted tampering that `JSON.parse` lets through. **9b DEFERRED to v3.0** — AES-GCM; breaking change accepted *if built*, small marginal benefit over 9a. Neither addresses rollback |
| 10. Test suites ran without gating | **released in v2.4.0** — finalize() ran per-runner, so two suites reported but did not count |
| 11. Actionable reports | **released in v2.4.0** — click-through from both reports |
| 12. Per-field breach button | **released in v2.4.0** — on password fields, edit rows, and the standalone generator (documented under item 5, no separate section) |
| 13. Entropy estimate ignores dictionary words | **released in v2.4.0** — estimator is dictionary-aware; generator defaults raised to match |
| 14. Loaded files apply security preferences | **OPEN**, below 9a — a shared file can silently weaken settings. Not an XSS path: the CSP blocks it. Fix is to confirm only when a file *weakens* the posture, so admin hardening still applies silently. Separately: `form-action 'self'` **added**, and SEC-001 corrected |
| 15. Vault merge | idea — extends item 7; needs durable IDs because it writes, and can use inactive records as undo |
| 16. CodeQL findings | **RELEASED in v2.4.1** — memorable passwords used Math.random(); now CSPRNG with no modulo bias. Also: pattern checks rejected valid passwords, and the in-record generator ignored the length preference |
| 17. Describe rather than judge | idea — the expository checks assert a 60-bit floor they cannot justify; and memorable passwords are about typeability, not memorability |
| 18. FIDO CXF interoperability | idea — `CustomFields` fits PAM's model; salted title hashes give stable `Item.id`s with **no format change**, so this need not wait for v3.0 |
| 19. `make check-toc` | **RELEASED in v2.5.0** — verifies the contents page against the document's headings; found 22 problems on first run, including nine security-relevant preferences missing entirely |
| 20. `make check-links` | **RELEASED in v2.5.0** — checks the 31 external URLs; found 8 stale on first run, all of them still working via redirects. Not in `lint`: needs network |

---

## Shipped in v2.3.0

Items 1 to 4 are released and their reasoning now lives in
`RELEASE_NOTES_v2.3.0.md`, which is the durable record. Summarised here only so
this document still reads in order:

1. **Vault fingerprint** — two hashes in About, partitioned by `active`, so a
   mismatch says *where* two vaults differ rather than only that they do.
2. **Reuse detection** — a report and a toolbar badge, computed locally.
   Reuse is a property of a (record, field) pair, not a record.
3. **Search password oracle** — unplanned, found while building the first two.
   `searchRecords()` matched a user-supplied regular expression against
   password plaintext, making the search box a binary search over stored
   secrets. Now behind `searchPasswordFieldValues`, default off.
4. **Screenshot automation** — 49 of 51 help images generated by
   `make screenshots`, with `make check-images` verifying that the README and
   the harness agree, wired into `lint`.

## 5. Password breach check — RELEASED in v2.4.0

Checks stored passwords against the Have I Been Pwned corpus using the
k-anonymity range API: a 20-bit prefix of the SHA-1 goes over the network and
the comparison happens locally. The password itself never leaves the device.

### Status: CSP and documentation are DONE

Landed first, together, deliberately: the moment `connect-src` permits HIBP,
"no server traffic after page load" is false, and a commit where the policy and
the claims disagree is one where the README lies.

- `www/index.html` — `connect-src 'self' https://api.pwnedpasswords.com`, with
  the rationale in an HTML comment beside it.
- Four unit tests pin the policy, including one asserting `connect-src`
  contains **exactly** those two entries. Adding a host now requires deleting
  an assertion that says why not.
- `README.md` — a new **Content-Security-Policy** section, a new **Enable
  Password Breach Check** preference section, and the two comparison-table
  claims qualified. The absolute "PAM never sends any outbound data" in the
  security section is now accurate: nothing by default, one named host when the
  preference is on.

Two parsing bugs in the new tests, both found by running the parse rather than
trusting it. The first matched `connect-src` inside the **HTML comment** I had
just written explaining the change. The second used
`content=["\']([^"\']*)["\']`, which stops at the first single quote inside
the policy — and every CSP contains `'self'`, so it extracted `default-src `.
Both would have passed as green tests measuring nothing.

Still to build: the preference itself, the toolbar badge, the verdict logic,
the network call and the two dialogues.

### The CSP trade — decided with eyes open

`index.html` currently sets `default-src 'self'` with no `connect-src`
directive, so `connect-src` falls back to `default-src` and **a fetch to
api.pwnedpasswords.com is blocked by policy**. Breach checking cannot work
without relaxing it to:

```
connect-src 'self' https://api.pwnedpasswords.com
```

This matters because the CSP is what makes PAM's local-only claim
*structurally verifiable* rather than a promise. A user can read one meta tag
today and know the app cannot contact anyone.

**The preference does not restore that,** and it cannot — the reason is worth
stating properly, because "CSP is static" undersells it.

Two independent obstacles:

1. **A meta CSP is only honoured during parsing.** Insert one later from
   JavaScript and the browser discards it. So the obvious approach — write the
   policy when the preference is read — does not work at all.

2. **Policies compose by intersection, never union.** When a document carries
   more than one policy, a request must be permitted by *every* one of them.
   Adding a policy can therefore only tighten, never relax. Even if late
   injection worked, a second policy naming the HIBP host would not help: the
   original `default-src 'self'` would still block the request, and the
   effective permission stays the stricter of the two.

That second property is deliberate. If a page could loosen its own CSP at
runtime, any injected script could do the same and the policy would guarantee
nothing. The mechanism that stops an attacker widening the policy is the same
one that stops PAM narrowing it conditionally.

So the toggle controls whether PAM makes the request, not whether it could.

**The corollary runs the other way, and is worth remembering.** Because
policies only ever tighten, enforcement *is* possible in the restrictive
direction. A service worker intercepting `fetch` could block requests to the
HIBP host whenever the preference is off, which would restore something close
to the old guarantee — enforced rather than promised. The cost is that PAM has
no service worker, and adding one to a PWA that deliberately has no
offline-cache story is a real change with its own failure modes. Recorded as an
option, not a plan.

So the guarantee changes from *"cannot phone home, verifiably"* to *"can only
phone HIBP, and does not unless asked."* Still stronger than any competitor
offers. Accepted deliberately — and the README claims change with it, because a
security claim that is true by default but false when configured is worse than
a weaker accurate one.

### Decisions

- **Preference:** `enablePasswordBreachCheck`, default `false`, on the
  **Administration** tab. That tab already holds the settings that change
  security posture and carry a warning badge (`allowHtmlFieldRendering`,
  `filePassCacheStrategy`, `searchPasswordFieldValues`); enabling network
  egress belongs with them. The Password tab is about how passwords are
  *generated*.
- **Toolbar badge** when enabled, matching `HTML ON` / `PASS: LOCAL` /
  `PW SEARCH`.
- **Its own dialogue**, behind its own menu entry — not a section appended to
  the `Reused Passwords` report. The two answer different questions and one
  needs the network while the other does not.
- **Menu entry `Breached Passwords`**, matching the `Reused Passwords` idiom.
  **Always visible.** When the preference is off it opens a dialogue explaining
  the trade-off with a link to Preferences, rather than disappearing. Hiding it
  would be the stronger privacy stance, but then the only path to the feature
  is reading the README; keeping it puts the disclosure at the moment someone
  is deciding, keeps the menu stable for the e2e assertions, and means the
  screenshot set does not depend on preference state.
- **Per-field check.** A button on password fields, present only when the
  preference is enabled, checking that one password.
- **Honours `hideInactiveRecords`**, same reasoning as the reuse report.
- **No cache.** The corpus is updated periodically, so a password that is
  ACCEPT today can be REJECT tonight with no change on the user's side. A
  cached ACCEPT is a claim about the past presented as a claim about the
  present. Re-check every time.
- **Reachability first.** Probe before walking the vault, so an offline user
  gets one clear answer rather than N failures.
- **Throttled.** One request per password; a 200-record vault is 200 requests.
  Serialised with a delay — up to about five seconds is acceptable provided
  progress is shown. A correlated burst from one IP is also a weaker privacy
  property than a single lookup, and hammering HIBP is impolite. The disclosure
  text should say that checking the vault sends one request per password.

### Verdict logic — ported from `pwcheck.py`

Not corpus-only. The full three-state verdict comes over:

```
ACCEPT             nothing objected; caveats may qualify it
REJECT             in the corpus, or structurally weak
CANNOT DETERMINE   a lookup failed, so no conclusion was reached
```

REJECT also fires on structural weakness (keyboard runs, sequences, repeats,
embedded years) and on an entropy floor — both local, both needing no network.
Without them, ACCEPT reduces to "not in the corpus", which is a floor rather
than a verdict: `Summer2026` is in no breach corpus worth the name and is still
a bad password.

`CANNOT DETERMINE` is deliberately **not** a third verdict on the same axis. It
is the program reporting that it failed to reach one. Reporting it as ACCEPT is
the fail-open bug; reporting it as REJECT would reject good passwords whenever
the user is offline and teach them to ignore the tool.

### Status: failure handling DONE

`www/js/breach.js` and sixteen tests, written before any success path.

The network is **injected** rather than imported, so every failure mode is
exercised without one: unreachable host, HTTP error, HTML error page from a
proxy, empty body, whitespace-only body, one malformed line among valid ones,
a body that cannot be read, a response object of the wrong shape, and an empty
password. Each asserts `CANNOT_DETERMINE`.

Two design points worth keeping:

- **One bad line condemns the whole body.** A partially valid response is not
  one we can reason about — the entry we care about may be in the part we could
  not read.
- **A count of zero is padding, not a hit.** `Add-Padding` mixes synthetic
  zero-count entries in so the response length reveals nothing, and our own
  suffix can legitimately appear among them. Treating that as a match would
  report a breach that did not happen.

The module imports nothing. `clog()` reads `window.prefs`, so it throws when
preferences are not yet initialised — on the error path, which is the one place
a secondary failure is least welcome. Every failure returns its reason to the
caller instead. The test harness found this by being the first caller without
prefs set up.

**Seven mutations, each caught.** One was not, at first: deleting the HTTP
status check left all sixteen tests green, because the 503 fake returned an
undefined body and the *parser* rejected it. The test was passing on a
different guard than the one it named. It now serves a valid range body with
the error status, so only the status check can save it.

### Status: structural checks and the verdict DONE

Five local checks, no network: keyboard runs (rows forwards and backwards),
character sequences by code point, a character repeated four or more times,
an embedded plausible year, and a rough entropy floor of 60 bits. Plus a
minimum length of 12.

The risk with structural checks is not missing a weak password — it is
rejecting a good one, which teaches people to ignore the tool. So each is
deliberately conservative, and a test runs the eleven real passwords from
`www/examples/example.txt` and the generator through them: **zero false
rejects**, including the memorable passwords, which were the ones most likely
to trip the sequence check. Seven weak passwords are each rejected with a
specific reason.

`verdictFor()` combines corpus and structure, and the ordering is the part
worth reading:

1. A corpus hit is REJECT — the password is published, nothing else matters.
2. **Structural weakness is REJECT even when the corpus is unreachable.**
   These checks need no network, so being offline is no reason to withhold an
   objection that can be made locally.
3. Only then does a failed lookup become UNDETERMINED, and it says what
   failed.
4. ACCEPT means every check that could run did run and none objected.

Step 2 is the one that is easy to get wrong: an implementation that returns
UNDETERMINED as soon as the network fails would stay silent about
`Summer2026` whenever the user is offline.

### Status: preference and badge DONE

- `enablePasswordBreachCheck`, default **false**, on the Administration tab
  with the other settings that change security posture.
- A `⚠ BREACH CHECK` toolbar badge while it is on, matching the existing
  badges. This one marks a different kind of thing from the others — they mark
  a weaker local posture, this marks that PAM may talk to a third party — but
  it is shown for the same reason: a setting that changes what PAM does with
  your data should never be invisible.
- `updateBreachCheckIndicator()` is called at startup, after a preferences
  save, and after a file load, because a loaded file carries preferences too.

One test needed isolating. `window.prefs` is a single shared mutable object
and dozens of suites set keys on it directly, so by the time a late suite runs
it is not the default shape any more. `menuPrefsDlg()` reads
`predefinedRecordFields` through `Object.entries()`, which threw
`Cannot convert undefined or null to object`. The test now builds the dialogue
from a fresh `getDefaultPrefs()` and restores the old object in a `finally`.

Worth noting the jsdom check I ran beforehand passed, because it set fresh
prefs before calling. The harness differed from the real page in exactly the
way that mattered — the real page has accumulated state from 350 preceding
tests.

The badge test is an **e2e** test, not a unit test. `main.js` cannot be
imported by `tests.html` — it registers `window.onload` and pulls in `menu.js`,
`raw.js` and `about.js` — and the three existing indicator suites work around
that by replicating the logic inline, which tests the copy rather than the
function. Adding a fourth instance of that pattern seemed worse than putting
the test where the real function runs.

### Status: menu entry and dialogue DONE

`www/js/breach-ui.js`, with two bodies:

- **Disabled** — what most users will see, since the preference is off by
  default. It leads with "nothing has been sent", explains what is and is not
  transmitted, states the cost honestly (a request is made, an IP is visible,
  one request per distinct password), and names where to turn it on. This is a
  disclosure placed at the moment someone is deciding, which was the argument
  for keeping the menu entry visible rather than hiding it.
- **Ready** — shown when enabled, before any check runs. It states how many
  requests a check would send and says plainly that **nothing has been sent
  yet**. The request happens when the user presses Check, not when they open
  the report: a dialogue that phoned home because you looked at it would be a
  surprise, and the point of the preference is that PAM does not contact
  anyone unasked.

`passwordsToCheck()` deduplicates by value, so a password used by three
entries costs one request rather than three while still reporting all three
entries. It honours `hideInactiveRecords` for the same reason the reuse report
does.

Both menu assertions moved from 9 to 10 — `choose_menu_option`'s hard count and
`test_pam_setup`'s ordered list. They are independent assertions of the same
fact and the second was missed on the first pass in v2.3.0, so both were
changed together this time. The example-record count, also 9, was left alone.

### Status: the check runs — Check button, progress, Cancel

The previous stage shipped a dialogue whose text said "Press **Check** to
start" beside a dialogue that had only a Close button. The tests asserted the
*text* said the right thing and never asked whether the control it named
existed. Prose describing a capability that is not there, one layer below the
README doing the same.

Now built:

- **A reachability probe before the run.** One request to a known prefix. An
  offline user is told once, immediately, rather than watching several hundred
  identical failures accumulate. Verified by counting calls: exactly one.
- **Serialised requests with a 120ms delay.** A burst of hundreds from one
  address is impolite, and a weaker privacy property than the same requests
  spread out, since it links them in time.
- **Progress and Cancel.** A real vault turned out to be 220 distinct
  passwords, which is about a minute of wall time — the five seconds discussed
  earlier was wrong by an order of magnitude. Long enough that starting a run
  and being unable to stop it would be a poor bargain.
- **Three outcomes kept distinct in the output.** Breached passwords are
  listed with reasons; passwords that could not be checked get their own
  heading saying *nothing was learned about these*; and the clean case says so
  only when every check actually ran. Collapsing the second into the third is
  the failure this feature exists to avoid.

The test that matters most is `a mid-run failure is undetermined, never clean`:
the probe succeeds, then the network dies. Its first version used `'a'` and
`'b'` as passwords, which are structurally weak — so the verdict was REJECT on
structural grounds and the test passed without exercising what it named. It now
uses two structurally clean passwords, checked as such, so the corpus is the
only variable.

## 6. README pass — RELEASED in v2.4.0

Large, and it covers everything above. The README is the in-app help, so this
is a user-facing defect until done.

- The reuse report, its preference, and the `Reused Passwords` dialogue
- The fingerprint rows in About, and what the two lines mean
- `searchPasswordFieldValues` and the search behaviour change, with the oracle
  explained in the security section
- The whole breach-check feature and the CSP trade
- **The local-only claims.** "Fully local — no server traffic after page load"
  and "Offline use: Full — no dependency on external service" become false once
  breach checking is enabled. They need qualifying, not deleting.
- **Reason 11: Breached Passwords Detection** — a "reasons to use PAM" section
  parallel to Reason 10. **Write it when the feature lands, not before.** The
  README would otherwise claim a capability PAM does not have, which is the
  same failure as leaving the local-only claim in place after breach checking
  arrives, just in the other direction.

- **The comparison table row** on audit/breach alerts. It currently says PAM
  loses because it "cannot alert you when third-party sites are breached" and
  cites 1Password flagging "breached, weak, and reused" passwords. PAM now does
  reuse and will do breach; the row needs splitting rather than editing.
  **Done for reuse:** the row is now two — "Reused password detection" (a tie
  on capability, a PAM win on disclosure, since the same answer is computed
  without anything leaving the device) and "Breach alerts" (still a PAM loss).
  The breach row changes when the feature ships.
### The README is currently AHEAD of the code

`#### Enable Password Breach Check` was written when the CSP changed, because a
policy naming an external host with no explanation would have been worse than a
section describing a feature that was not finished. That was the right call,
but the consequence is that the README describes, in the present tense,
behaviour nothing yet performs: the module can look a password up, the
preference toggles a badge, and **no code path calls `checkPassword()`**. A
user who enables the preference today gets a badge and nothing else.

This is the same failure as writing Reason 11 early, which was deliberately
held — just in the direction I was not watching for.

**Before this branch merges, re-read that section against the built feature and
check each claim is true of what exists rather than of what was designed:**

- "typically several hundred" hashes returned — verify against real responses.
- The `Add-Padding` claim: confirm the header is actually sent and that the
  response length genuinely does not vary with it.
- Anything the section implies about when requests happen, which depends on
  choices the report has not made yet — per password, throttled, on demand.
- "A ⚠ BREACH CHECK warning badge will appear in the toolbar while this is
  active" — true today, but check it still is after the report lands.

The same re-read applies to the **Content-Security-Policy** section and the two
qualified comparison-table rows.

### The Menu subsection was counting wrong

Under **Menu and Search Section → Menu**, the README said *"there are seven menu
options"* and listed seven. There are ten. It was missing Reused Passwords,
Breached Passwords and Print, along with the "Click or tap on…" paragraph each
entry has.

`Reused Passwords` and `Print` were already absent before this branch, so that
text was wrong in the v2.3.0 release too. **The prose stated a count**, which is
the kind of claim that goes stale silently — nothing checks a number written in
a sentence against the code that produces the thing being counted.

The `pam-menu.png` capture beside it shows the real menu, so once the
screenshots are regenerated the picture and the prose will finally agree.

Now nine listed, with Print described separately as the conditional entry it
is. The icons were cross-checked against `menu.js` rather than assumed: `files`
for Reused Passwords, `key` for Breached Passwords, `printer` for Print.

### The navigation lagged the sections

Both `Reused Passwords` and `Breached Passwords` had full sections written, and
neither appeared in the table of contents or in the Menu Functions index. The
prose existed; there was no route to it except scrolling or following a
cross-reference from elsewhere.

Reused Passwords shipped in **v2.3.0** in that state, so it went a whole
release with a section nobody could navigate to.

Nothing catches this. `check-images` verifies that every link resolves, which
is the opposite direction — it finds links pointing at nothing, not sections
nothing points at. A "section with no inbound link" check would be a natural
companion, though headings legitimately reachable only by scrolling exist too,
so it would need judgement rather than a hard rule.

Audited the rest: all twelve Menu Functions subsections are now in both.

### Status: README pass DONE

**Corrections to what was already written.** The preference section was drafted
when the CSP changed, before the feature existed, and it over-claimed:

- *"the server learns that someone asked about one of roughly 850,000 possible
  passwords"* was **wrong**. Five hex characters divide the corpus into about a
  million buckets, so a prefix is shared by roughly **eight hundred** corpus
  entries — 847M/1,048,576. The 850,000 figure had no basis.
- *"one request per password"* is now *one request per **distinct** password*,
  since the report deduplicates by value.
- *"typically several hundred"* hashes returned checks out at about 808 on
  average; sharpened to "around eight hundred".

**What was missing entirely.** The section described only the corpus lookup and
said nothing about the local structural checks, which is half of what the
feature does — a reader would have thought ACCEPT meant "not published". Now
documented, along with the could-not-check outcome, that nothing is sent until
Check is pressed, and the per-field button.

**Added:** a `Breached Passwords` report section with a table of the three
labels, **Reason 11**, and two replacement comparison rows. The old breach row
claimed PAM simply loses; it is now split into breach checking (close, and PAM
sends less) and unsolicited alerts (PAM loses, and the row says so).

**A gap in the tooling, found by nearly falling into it.** `check-images`
tracked only the 51 `pam-*.png` captures, but the README embeds 69 images —
the rest are icons from `www/icons/`. A reference to an icon that does not
exist renders as a broken image and nothing would have caught it. It now checks
every `www/` image reference. Verified by removing `shield-check.svg` and
watching it fail.

`shield-check.svg` was added to `www/icons/black/` and derived into
`www/icons/blue/` the way `update-blue-icons` does, keeping the black/blue
listing invariant that `lint` asserts.

### Screenshots — what this feature invalidates

`make screenshots` must be re-run, and two new captures added to
`tests/screenshots.py`. `make check-images` will refuse to pass until the
README and the harness agree, so the list below is a checklist rather than a
thing to remember.

**Already stale, right now:**

- `pam-prefs-administration.png` — `enablePasswordBreachCheck` was added to
  that tab. The image went out of date the moment the preference landed, and
  nothing flags that, because the filename has not changed. This is the failure
  mode `check-images` cannot catch: a captured image whose *content* is stale
  is indistinguishable from a current one until it is regenerated.

**Stale once the menu entry lands:**

- `pam-menu.png` — gains `Breached Passwords`, which also changes its height.
- `pam-prefs-enable-printing-menu.png` — the same menu with Print showing.

**New captures — added to `tests/screenshots.py`, awaiting a run:**

- `pam-breached-passwords-disabled.png` — the report with the preference off.
  The more important of the two: it is the state almost every reader will meet,
  and where the trade-off is explained at the moment someone is deciding.
- `pam-breached-passwords.png` — the report with the preference on, captured
  **before Check is pressed**. Neither shot makes a network request; the
  disabled one cannot, and the enabled one is photographed at the point where
  the request count is stated and nothing has gone out. A screenshot has no
  business sending several hundred requests, and this is also the honest
  picture of what opening the report does.

No capture for the per-field shield button. Every shot runs with the preference
off, so photographing it would mean setting the preference purely for the
picture; the README describes it in prose instead.

**Also affected, outside the images:**

- `test_pam_setup` asserts the menu contents as an ordered list and
  `choose_menu_option` asserts a hard count of 9. Both move to 10, and they are
  independent assertions of the same fact — the second was missed on the first
  pass in v2.3.0 because only the helper was searched.

The per-field button needs no new capture: every shot runs with the preference
off, and the button is hidden in that state.

---

## 7. Vault diff — DEFERRED, not blocked

**Question:** "What differs between these two vaults?"
**Discloses:** titles and field names of differing entries. Never secrets.

Given a second vault file and its passphrase, report entries only in A, only in
B, and entries in both whose passwords differ (report *that* they differ, never
the values).

### Not blocked — degraded

This was recorded as "blocked on durable entry identity". That is too strong,
and it kept the item unscheduled for no good reason.

**Nothing here depends on item 9 (file integrity).** Items 7 and 9 are paired
in the v3.0 plan for migration economics — each schema migration reopens the
lockout window, so doing both at once costs users one disruption instead of
two. That is a scheduling argument, not a dependency. Vault diff does not need
authenticated encryption any more than any other comparison of two JSON
documents does.

**Cross-version crypto is not a constraint either.** `decrypt()` already
dispatches on the `PAMv2:` prefix, so each file's format is detected
independently, and once decrypted both are records with the same schema. A v1
vault and a v2 vault can be compared today. Restricting a first version to
matching formats would be a reasonable simplification, not a necessity.

**Durable entry identity buys rename detection, and nothing else.** Without an
ID, match records by title after canonicalisation — `canonicalizeRecords()`
already exists from the fingerprint work — and compare field sets and password
presence. That is a working, useful diff. What it cannot do is tell a rename
from a delete plus an add, so editing a title reports as a credential lost and
a credential gained. For a password manager that is the alarming direction to
be wrong in, but it is a quality-of-result problem, not an impossibility.

Even that is softenable without a schema change, the way `git diff -M` does it:
match by title first, then pair the leftovers by similarity — an identical
password value, or an identical field set — and report those as probable
renames. Less certain than an ID, and considerably better than nothing.

**So this could ship before v3.0.** The remaining genuine wrinkle is entries
matching on title but not field set, and vice versa, which is a presentation
question rather than a blocker.

## 8. Export tiering — DEFERRED

The actual lesson of the origin story. Today the industry offers one export:
everything, in the clear. Offer three:

| Tier | Contents | Use case |
|---|---|---|
| Fingerprint | 64 bits | "Are these the same vault?" |
| Metadata | titles + field names, no secrets | audit, inventory, diff |
| Full | everything | migration to another manager |

Most reasons people export are satisfied by the first two. Each one satisfied is
a plaintext dump that never gets created.

If full export stays, consider emitting FIDO CXF rather than CSV. CXF became a
FIDO Proposed Standard in August 2025 and CXP (which wraps the transfer in HPKE)
has shipped on iOS and Android; Apple, Google, Microsoft, 1Password, Bitwarden
and Dashlane are all contributors.

---

## 9. Vault file integrity — 9a RELEASED in v2.5.0, 9b DEFERRED and reassessed

**Read the split below before the warning.** This item has two halves, and only
the second one breaks anything:

- **9a — tamper evidence.** A hash inside `meta`. No format change, no
  migration, backward compatible. **Implemented in v2.5.0** on
  `feat/vault-file-integrity`.
- **9b — authenticated encryption.** AES-GCM. Breaks the file format, and the
  warning below applies to it in full. **Reassessed:** 9a already detects
  tampering essentially completely, so 9b is no longer treated as a necessary
  sequel. See the reassessment below.

> ## ⚠ 9b IS A BREAKING CHANGE TO THE FILE FORMAT
>
> This warning applies to **9b only**. 9a changes nothing about the envelope
> and older versions read those files normally.
>
> **9b rewrites PAM data files in a format that no earlier version of
> PAM can open.** It is not a code change with a compatibility note attached;
> it changes the user's own data.
>
> Concretely, for a user who does nothing wrong:
>
> - A vault saved on an updated device **cannot be opened** on any device still
>   running an older PAM. For a file kept in iCloud, Dropbox or Drive — which
>   the README recommends — the first save from one device locks out every
>   other one until they are all updated.
> - **There is no going back.** Once a vault has been re-saved, downgrading
>   PAM makes it unreadable. A user who hits any problem in the new version,
>   crypto-related or not, cannot simply revert.
> - A shared file becomes unreadable to whoever it was shared with until they
>   update too.
> - A backup taken after the upgrade cannot be restored on an older install.
>
> ### Decision: the breaking change is accepted
>
> Reviewed and agreed. The caution above was argued from the general case —
> native apps, store review, users waiting to update. PAM is not that, and two
> properties change the calculus:
>
> - **`v1` to `v2` was already a forced migration and caused no disruption.**
>   `save.js` calls `encryptV2()` unconditionally; there is no v1 write path.
>   Every existing vault was rewritten on its next save. The precedent is
>   direct, not analogous.
> - **A PWA updates itself.** Served from a URL, an installed PAM picks up the
>   new version on next load. The window in which one device lags is short and
>   self-closing, unlike a native app waiting on store review.
> - **`git clone <tag>` is a real fallback here**, because PAM has no build
>   step. Clone the v2.4.1 tag, open `index.html`, read the file. That covers
>   the isolated-environment case properly.
>
> And this is a security tool. An unauthenticated vault format is a genuine
> defect, and shipping the fix matters more than sparing users one migration.
>
> **Scope note added on reassessment.** This decision removes the *format
> change* as an objection; it does not by itself establish that 9b is needed.
> The reassessment below concludes 9a detects tampering essentially completely
> and that 9b's marginal benefit here is small. So: if 9b is built, the breaking
> change is accepted on these terms — but build 9a first and let 9b earn its
> place.
>
> **Two conditions attach to that acceptance:**
>
> 1. **The v1 and v2 read paths are never removed.** A v3 PAM must open every
>    file PAM has ever written. This is what makes a forced write-format change
>    safe, it costs almost nothing to keep, and it is exactly the sort of thing
>    a later cleanup deletes because "nobody uses v1 any more". They do.
> 2. **The migration must announce itself.** With the writer unconditional, a
>    v2 vault becomes v3 on the next save with no notice. A one-time message —
>    *"this vault has been upgraded to the v3 format; older versions of PAM can
>    no longer open it"* — costs nothing and turns a silent one-way door into an
>    informed one. The v1 to v2 migration went smoothly; that should be
>    repeatable rather than fortunate.
>
> **Requirements before 9b ships, not optional extras:**
>
> - The release notes must lead with this, not mention it.
> - _PAM_ should warn in the application at the moment it is about to write the
>   new format for the first time, and say what will stop working.
> - Update every device before saving from any of them.
> - Keep a copy of the vault in the old format, outside the sync folder, until
>   every device is confirmed working.
> - A staged migration — one release that **reads** the new format before a
>   later one writes it — remains the most conservative option, but is not
>   required given the decision above. If it is skipped, conditions 1 and 2
>   carry the weight instead.
>
> The major version number is the signal, but a version number is not a
> warning. Users upgrade without reading, and the first symptom otherwise is a
> vault that will not open on the device they happen to be holding.
>
> **If 9b is built, carry the durable record identifier in the same migration.**
> Not because anything here depends on it — it is simply the other outstanding
> schema change (see Open questions, and item 7), it is equally breaking, and
> every format migration reopens the lockout window described above. One
> migration that adds authentication *and* record IDs costs users one
> disruption; two migrations cost them two.
>
> **Note the conditional.** Since the reassessment below, 9b is no longer
> assumed to happen. If it does not, the record identifier needs its own
> justification and its own migration — it cannot be scheduled as a passenger
> on a journey that may never be made. Item 18 shows CXF export does not need
> it; items 7 and 15 do.

Found while investigating a flaky unit test, and worth recording even though it
is not part of the breach work.

`decryptV2()` uses **AES-CBC with no authentication tag**, and does not
validate what comes out — it calls back with whatever bytes `decrypt()`
produces. Two consequences:

**A wrong password is not reliably detected.** Rejection depends on the garbage
final block failing PKCS#7 padding validation, which random bytes pass about
once in 256. When that happens the caller receives garbage, and the failure
surfaces downstream as `invalid record format!` from `JSON.parse` rather than
as a password error. Roughly one wrong-password load in 256 gives a confusing
message. Annoying, not dangerous.

**The vault file has no integrity protection.** This is the part that matters.
CBC without a MAC is malleable: someone who can write to a PAM file can flip
bits in the plaintext without detection. The README recommends storing PAM
files in iCloud, Dropbox or Google Drive and sharing them between devices —
exactly the settings where a file may be modified by something other than PAM.
Confidentiality holds; tamper-evidence does not.

The fix is AES-GCM, which authenticates as it decrypts, so a wrong password or
a modified file fails cleanly every time.

### The split in detail

Item 18 showed that a stable identifier could be had without touching the file
format, because unknown `prefs` keys are ignored by older versions. The same
applies here. `loadFileContent()` reads only `meta['date-saved']`, `prefs` and
`records`; every other key is ignored.

**9a — tamper evidence, no format change. IMPLEMENTED in v2.5.0.** A SHA-256
digest of records and prefs is written to `meta.integrity` before encrypting.
On load, PAM decrypts, parses, recomputes and compares before applying
anything.

**Two claims in the original write-up were wrong, and implementing it exposed
both.**

**Wrong claim 1: "a reliable wrong-password check".** A wrong password was
already detected almost always. PKCS#7 padding rejects it about 255 times in
256, and the once it passes, `JSON.parse` rejects the garbage — measured at
40/40 across trials. What was actually broken was the **message**: that last
case reported *"invalid record format"*, blaming the file rather than the
password. 9a improves the diagnosis, not the detection. The load path now says
both causes are possible, since from that point they are indistinguishable.

**Wrong claim 2: "flipped ciphertext bits fail the hash".** Mostly they fail
`JSON.parse` first. Measured over 400 random bit-flips:

| Caught by | Count |
|---|---|
| AES-CBC padding | 33 |
| `JSON.parse` | 357 |
| **the digest alone** | **10** |
| undetected | 0 |

On that figure 9a looks close to redundant, and an honest write-up has to
report it.

**But random flips are the wrong model.** An attacker does not flip bits at
random; they flip inside a *value*, where corruption stays syntactically valid.
A trial confined to the final blocks of a vault holding a 600-character note
produced **15 tampered files that decrypted and parsed as valid JSON**. The
digest caught all 15. Without it, every one would have loaded silently as a
valid vault with corrupted content.

That is the case 9a exists for, and it is invisible in the random-flip number.

**Backward compatibility.** Older versions ignore `meta.integrity` and read the
file normally. A file *without* a digest reports `INTEGRITY_ABSENT` and loads
without complaint — treating a missing digest as tampering would reject every
vault written before v2.5.0.

**Two bugs found by the e2e suite, one of them mine.**

*Mine:* the verification was written as
`verifyIntegrity(json).then(result => { …; applyLoadedContent(json) }).catch(…)`.
That puts `applyLoadedContent` inside the same catch, so **any** error raised
while loading is reported as an integrity failure. It surfaced as a date-parsing
`RangeError` announced to the user as *"this file has been modified since it was
saved"* — wrong, and alarming in the worst way for a security feature. Fixed by
using the two-argument `.then(onOk, onErr)` so the rejection handler covers
verification only, and applying the content in a separate link of the chain.

*Pre-existing:* `meta['date-saved']` is not guaranteed — it is absent from
hand-written files and fixtures. `new Date(undefined)` gives an Invalid Date,
and `thenDate.toISOString()` throws `RangeError: Invalid time value`. **That
threw before this release too.** It went unnoticed because it happens after the
records are inserted, so the load looks successful and the browser swallows the
exception. Only wrapping the call in a catch made it visible. Both the date
handling and the About line are now guarded.

Worth noting the shape: a defensive `catch` that is too broad does not just fail
to help, it actively misattributes. The second bug had been live for an unknown
number of releases and was found only because the first one exposed it.

**The honest limit.** The digest is unkeyed and lives inside the plaintext, so
anyone able to rewrite the file could omit the field to silence the check.
Nothing within a non-breaking change prevents that. It is a real argument for
9b, and a smaller one than the reassessment below already allows.

**9b — authenticated encryption, v3.0.** AES-GCM, with the breaking format
change described above.

### Reassessment: 9a may be sufficient

An earlier version of this section called 9a a stopgap and 9b "the correct end
state". That overstated the gap, and the acceptance of the breaking change was
argued partly on the overstatement. Corrected here.

**9a detects tampering essentially completely.** Bit-flipping garbles an entire
CBC block; truncation drops blocks; substitution corrupts the block that
follows. Every one produces plaintext that fails the hash, and most fail
`JSON.parse` before reaching it. There is no realistic modification that
survives a content hash.

What 9b adds, assessed honestly in *this* threat model:

| | What it gives | Worth in PAM |
|---|---|---|
| Verify before decrypt | No window where unauthenticated plaintext exists | Narrow. `JSON.parse` is memory-safe in a browser, and if the hash is checked before anything else touches the data that is the entire surface |
| Padding oracle immunity | Attacker cannot use padding validity as a decryption oracle | **Weak here.** An oracle needs thousands of submitted ciphertexts with distinguishable responses. PAM is a local app where a person opens a file by hand; there is no channel to query |
| Auditability | A reviewer sees AES-GCM and knows it is right | **Real, but soft.** CBC-plus-inner-hash requires reasoning about ordering and coverage. A cost, not a vulnerability |

**So the marginal security benefit of 9b over 9a is smaller than this document
previously claimed, and probably does not justify a breaking format change on
security grounds alone.** The padding-oracle argument is the textbook one and
the least applicable; auditability is the strongest remaining reason and is not
an attack.

**Neither 9a nor 9b addresses rollback.** An attacker who replaces the current
vault with a legitimate older copy passes a content hash *and* a GCM tag, since
the old file was validly authenticated when it was written. Detecting that needs
a version counter or state kept outside the file. Worth knowing before treating
either as complete.

**Recommended sequence:** build 9a, live with it, and let 9b prove itself
necessary. Nothing about 9a forecloses 9b — the integrity field simply becomes
redundant once GCM authenticates the payload. Deciding now, before the cheap
option exists, means deciding with less information than will be available in a
month.

**Scheduled for v3.0, and the major version is the point.** A file written in
the new format cannot be read by any earlier release, and there is no downgrade
path: a user who has re-saved cannot go back, even for a problem unrelated to
crypto. That is what major versions exist to signal.

The exposure is real but bounded, and the decision above accepts it. PAM is
multi-device — the README recommends syncing through iCloud, Dropbox or Drive —
so a device still on an older version cannot open a newly written vault. But
PAM is served from a URL and installs as a PWA, so devices update themselves on
next load rather than waiting on a store review or a user tapping Update. The
lag is short and self-closing. The genuinely stranded case is a pinned local
copy, and `git clone <tag>` covers it because PAM has no build step.

Meanwhile the unit test asserts the property that actually holds — that a wrong
password never recovers the plaintext — rather than that decryption fails,
which is only true 255 times in 256.

## 10. Two suites ran without gating the build — RELEASED in v2.4.0

Found because 16 new breach tests were added and the reported total did not
move: still 308.

`finalize()` writes `window.__TEST_RESULTS__`, which `tests/test_unit.py` reads
to decide pass or fail. It was called at the end of `runCryptTests` and
`runSaveRegressionTests` but not by the two runners after them in the chain, so
`runVaultFingerprintTests` (12 tests) and `runBreachTests` (16) rendered their
results onto the page while the totals still reflected the state before they
ran. **Their failures would have shown as red lines and passed the build.** The
vaultFingerprint suite was in that position for the whole of v2.3.0.

Two changes:

- One `finalize()` at the end of the chain instead of per-runner. Adding a
  runner can no longer leave it uncounted.
- `test_unit.py` now reconciles the summary against the page: the number of
  rendered `.test-line` elements must equal the reported total. Trusting the
  summary without checking it against the lines is what let this go unnoticed,
  and the same drift would otherwise recur the next time a runner is appended.

The failure mode is the one this project keeps producing: not a wrong answer,
but a right-looking answer that was never actually computed.

## 11. Reports should be actionable, not just informative — RELEASED in v2.4.0

Both reports currently tell you there is a problem and leave you to find the
records yourself. In a vault of a few hundred entries that is most of the work.

### Status: 11a and 11b click-through DONE

Both reports are now actionable. `selectRecordsByTitle()` in `search.js` is
shared by them, so the escaping and the guard exist once.

- **Reuse report** — the group heading is a button. Clicking it selects that
  group's records and closes the report. The titles come from the cached
  group rather than the rendered list, because the displayed title has had its
  INACTIVE marker stripped and is not always the record's title.
- **Breach report** — each entry's title is a button, selecting that one
  record. Not the whole group sharing the password: the verdict is about a
  password, but the user is being sent somewhere to change it, and they change
  it one record at a time.

**The escaping is the part that could have gone wrong quietly.** Titles are
arbitrary user text — unique, but arbitrary. A title containing `(`, `|` or `.`
would otherwise alter the meaning of the pattern built from it and match the
wrong records — silently, in a feature whose entire purpose is finding the
right ones. `escapeRegExp()` handles it and four tests cover the cases,
including that an escaped pattern still matches its own title and nothing else.

The pattern is anchored — `^(Facebook|Instagram)$` — so selecting `Google` does
not also bring in `Google Cloud`.

**When `searchRecordTitles` is off, selection is disabled rather than merely
warned about.** `searchRecords()` only compares against titles when that
preference is set, so any pattern built from titles matches nothing.

Three layers, because a transient status message at the bottom of the screen is
easy to miss:

- The reports render those entries as **plain text**, not buttons. A control
  that looks clickable and silently does nothing is worse than one that does
  not look clickable at all.
- Each report carries a line saying why selection is unavailable and where to
  turn it back on.
- `selectRecordsByTitle()` still refuses and explains, as a backstop for the
  preference changing while a report is open.

Documented in the preference's own description in the dialogue and in the
README, since the dependency is not guessable: nothing about "Search Record
Titles" suggests it governs clicking an entry in a report.

Neither report puts a password in the search box. The pattern is built from
titles only — building one from password *values* would recreate the search
oracle fixed in v2.3.0.

### 11a. Reuse report: click a group to select its records

Clicking a group in the Reused Passwords report selects those records in the
main window and closes the report.

Mechanism: `searchRecords(value)` already filters the accordion, and
`searchRecordTitles` is on by default. A regex alternation of the group's
titles — `^(Facebook|Instagram)$` — filters to exactly that group. Points to
settle:

- **Decided: the search box shows the filter.** The regex goes into the box
  where the user can see it, edit it, or clear it with the existing button.
  Filtering without showing the term would leave the record list in a state
  with no visible cause, and the next person to look at the window — including
  the same person a minute later — would have no way to tell why records are
  missing. An odd-looking search term is a smaller cost than an unexplained
  one.

  This also means the existing clear-search control is the undo, so nothing new
  is needed for that.
- Titles are unique but are arbitrary user text, and are not escaped for
  regex. A title containing `(` or `|` would break the alternation or, worse,
  match the wrong records. Escape before building the pattern.
- `searchPasswordFieldValues` must stay out of this. Building a filter from
  password *values* would put a secret in the search box — the exact oracle
  fixed in v2.3.0.

### 11b. Breach report: click a record to open it

Click any entry to select that record in the main window and close the report.

**The verdict filter is dropped.** A real run over 220 passwords returned 85
rejections, and the problem was not that they needed filtering — it was that
breached and structurally weak entries rendered identically, so the reader had
to parse the reason text to tell them apart. Labelling each entry solved that
directly, and once labelled the list is scannable without a filter. Done, not
deferred: see the section below.

- Same escaping, and the same decision as 11a: the search box shows the term.
- A record clicked from the report may be one of several sharing a password.
  Decide whether clicking selects the one entry or the whole group; the entry
  is probably right here, since the breach verdict is about the password and
  the user is being sent somewhere to change it.

### Shared work

Both need one helper — "select these records in the main window and close this
dialogue" — rather than two implementations. It belongs somewhere both
`vault-ui.js` and `breach-ui.js` can reach without a circular import;
`search.js` is the natural home since it already owns the filter.

Neither is required for the breach feature to ship. If v2.4.0 gets long, 11a
stands alone and could land in a smaller release of its own.

## 13. The entropy estimate is blind to dictionary words — RELEASED in v2.4.0

**Implemented.** `entropyBits()` now computes both a character estimate and a
word estimate and returns the **lower** of the two. A passphrase is both a
sequence of characters and a sequence of words, and its real strength is
whichever description an attacker will use — the cheaper one.

Only separator-delimited passwords are recognised as word-based, and every part
must be in the list. Detecting concatenated words would need segmentation, and
guessing wrongly there would understate a password that merely happens to
contain a word — the expensive direction of error, since a false REJECT teaches
people to ignore the tool.

`std/creature/history` now scores 40 bits rather than 118, and is rejected.
Cryptic passwords are unaffected at 131.

**Generator defaults raised in the same change**, so PAM does not flag its own
output: `memorablePasswordMinWords` 3 → 5 and `passwordRangeLengthDefault`
20 → 30. Verified over 100 generations — every one is five words and none is
rejected, and 50 cryptic passwords are likewise clean.

The README's saved-file example still showed the old values; it now shows the
new ones. Nothing checks example JSON against the actual defaults, which is a
gap of the same kind as the menu count.



Found while deciding whether the standalone generator needed a breach button.

`entropyBits()` multiplies length by the size of the character classes present.
For `std/creature/history` — three words from PAM's 9,858-word list — that
gives **118 bits**. The real figure is **40**: 3 × log2(9858). The estimate is
off by roughly 3x, and in the unsafe direction.

None of the structural checks catch it either. A word-based password has no
keyboard run, no character sequence, no repeat, no year, and comfortably clears
the 60-bit floor on the inflated number. So PAM's own memorable passwords pass
every local check while carrying a third of the entropy the check believes.

Earlier this looked like a success: `ridge/doll/parameter` was tested as part
of the false-positive suite and reported no objections, which read as the
checks being appropriately lenient. It was the estimator being blind.

**Consequences, both acted on:**

- The corpus check is the only thing that can object to a weak memorable
  password, which is the argument for the generator button below.
- **`MIN_ENTROPY_BITS` stays hardcoded for now.** Making it a preference was
  considered and deferred: against a 3x estimator error, tuning the threshold
  between 60 and 80 is false precision — adjusting a dial on a gauge that is
  wrong by more than the adjustment for exactly the passwords where it matters.
  A configurable security floor is also one users lower when it complains,
  which turns a warning into a way to silence the warning. Revisit once the
  estimator understands dictionary words.

**The fix, when it comes:** detect word-boundary structure and score
`k × log2(wordlist)` instead of `length × log2(alphabet)`. `en_words.js` is
already in the bundle.

**Why this is not a bug fix.** Correcting the estimate makes PAM's own
generator produce passwords PAM's own checker rejects. The generator defaults
to a minimum of three words, and against the 60-bit floor:

| Words | Entropy | Verdict under a corrected estimate |
|---|---|---|
| 3 | 40 bits | REJECT |
| 4 | 53 bits | REJECT |
| 5 | 66 bits | accept |

So the fix forces a decision nobody has made — accept the rejections and watch
people stop using memorable passwords; raise the generator minimum to five;
lower `MIN_ENTROPY_BITS` for everything; score word-based passwords against a
separate threshold; or conclude that 60 bits is the wrong floor. That last one
is live: 60 was a judgement, not a derived number.

**The threat model is what settles it, and it is not one number.** Three words
falls in 96 seconds against a fast unsalted hash at 10^10 guesses/sec, holds
for 3 years against bcrypt-class work factors, and holds for 3,000 years
against a login that rate-limits to ten attempts a second. Same password, same
entropy, three completely different answers. A single global floor cannot
express that, which is the deeper reason the estimator fix is entangled with a
design question.

**Word count is derived from length, not chosen.** The generator adds words
until the result reaches the target length; `memorablePasswordMinWords` is only
a rejection filter applied afterwards. So the two cannot be changed
independently — measured over 200 generations each:

| minWords | length | outcome |
|---|---|---|
| 3 | 20 (today) | mostly 3 words, **40 bits** |
| 5 | 20 | ~3% give up and return `???` plus random hex |
| 5 | 30 | 200/200 clean, **66 bits** |

So v2.4.0 raises **both**: `passwordRangeLengthDefault` 20 → 30 and
`memorablePasswordMinWords` 3 → 5. That also lengthens cryptic passwords from
20 to 30 characters — 131 to 196 bits — which is a visible change to what the
generator produces, and harmless since cryptic passwords are pasted rather than
typed.

**A larger word list is the wrong lever.** Entropy grows logarithmically with
list size and linearly with word count: a tenfold larger dictionary buys about
3 bits per word, one extra word buys 13. Six words from the existing list
(80 bits) matches a 100,000-word list at five words (83 bits) with no 1.4 MB
bundle cost. And a list of uncommon words makes people press Regenerate until
something familiar appears, which silently shrinks the effective keyspace to
whatever subset they recognise — weaker in practice while looking stronger on
paper. Documented in the README under *Memorable Password Min Words*.

**Documented in the meantime, because the mitigation already exists.**
`memorablePasswordMinWords` is a preference: a user can set 5 today and clear
the floor with no code change. The README's *Memorable Password Min Words*
section now gives the table above, explains that the offline column is the one
that matters because you cannot know which sites store passwords badly, and
states plainly that the breach report will **not** warn about this — its
structural check cannot see word-based weakness.

### Added: a breach check in the standalone password generator

A shield button beside each generated password — one cryptic, five memorable —
shown only when the preference is on, and toggled by the same
`enableBreachCheckButtons()` as the per-field ones.

It earns its place for the **memorable** passwords specifically. The cryptic
one carries about 131 bits, so a corpus hit is essentially impossible and the
button will always say "clean". The memorable ones carry about 40, and per item
13 the local checks cannot see that at all — so the corpus is the only check
capable of objecting.

On demand, one request per press. Pressing **Regenerate** sends nothing.

### The scratch harness and the test page differ in ways that matter

Twice in one change, the jsdom harness passed and the real page failed.

The generator tests called `showMainPasswordGeneratorDlg()`, which uses
`bootstrap.Modal.getOrCreateInstance()`. `tests.html` does not load Bootstrap's
JavaScript at all, so the global is undefined there and the call throws before
the body is built. The scratch harness had set `global.bootstrap` at the top,
so it never saw the problem — the stub was in the harness, and only the calls
were carried across.

The fix stubs it in the test itself and restores it afterwards, so the test
exercises the real function rather than a reimplementation of what it does.

**And the harness cannot verify the fix.** `password.js` references the bare
global `bootstrap`, not `window.bootstrap`. In a browser those are the same
name, so assigning `window.bootstrap` makes it resolve; in Node,
`global !== dom.window` and it does not. The scratch harness can confirm the
surrounding logic — the stub is necessary, six buttons appear, the toggle
reaches them, the global is cleaned up — but the browser is the only place the
mechanism itself can be checked.

Worth stating as a rule: **a scratch harness proves a module works in the
harness.** Every discrepancy this session — accumulated `window.prefs` state,
an empty accordion, a missing Bootstrap global — has been the harness being
kinder than the page.

### The preference description went into a tooltip

`mkPrefsCheckBox(labelClasses, inputClasses, id, label, tooltip)` — the fifth
argument is a `title` attribute, not visible text. The dependency note landed
there, so it was correct, present, and only discoverable by hovering.

Visible descriptions come from a separate `prefPromptDesc()` call in the tab
assembly, which is how **Search Record Field Values** gets its warning
paragraph. The `enablePasswordBreachCheck` preference was written that way
earlier in this branch; the same mistake was made on the next one.

Fixed: a `prefPromptDesc()` after `prefSearchRecordTitles`, with the tooltip
shortened to something tooltip-sized.

Nothing catches this. The text was in the source, jshint was clean, and the
tests do not assert what is *visible* in a preference tab. It took looking at
the dialogue.

**The real argument is mobile, not discoverability.** A `title` attribute needs
a pointer. On a phone — where PAM is installed as a PWA, and which the iPhone
captures document — there is no hover, so the text is not merely hard to find
but unreachable. "Does this work without a pointer" belongs in the default set
of questions, not discovered afterwards.

**Audited the rest: nothing else is affected.** All 19 preferences were checked,
and every tooltip carrying more than a restatement of its own label already has
a visible `prefPromptDesc` beneath it — including the SEC-001 HTML rendering
warning, which would have been the worst one to hide. The remaining tooltips
say things like "enable printing", where losing them on a touch device costs
nothing.

The first pass through that audit reported the HTML warning as a problem. It
was a false positive: the check derived the function name from the label, and
`Allow HTML Field Rendering` does not case-fold to `prefAllowHtmlFieldRendering`.
Worth recording because a security warning wrongly reported as missing is the
kind of finding that gets acted on before it is verified.

So the convention was already right throughout the codebase, and this branch
broke it once.

### The reuse-report failure: a duplicated element id

Real, reproducible, and unrelated to the stale directory.

`withVaultUiFixture()` swapped the vault out from under the code under test by
taking `document.getElementById('records-accordion')`, removing that id, and
appending its own element with it. That works when exactly one element claims
the id. The test page has **three** that claim it at different points, and when
two were live at once the survivor sat earlier in document order and won the
lookup inside `convertInternalDataToJSON()`.

The fixture's records were therefore invisible: `getCurrentRecords()` returned
`[]`, the reuse report had nothing to draw, and no error appeared anywhere
because `refreshVaultStats()` wraps that call in a `try/catch` that returns
silently.

Reproduced directly — with two claimants, the old fixture sees 0 records and
the new one sees 2 — rather than inferred. The fixture now neutralises **every**
element carrying the id and restores them all afterwards.

**Three wrong hypotheses preceded this**, and the thing that ended it was the
staged diagnostic reporting `saw []` instead of a bare count of zero. Knowing
the records were invisible rather than the button unrendered turned an
open-ended search into one lookup.

Worth noting the silent `try/catch` in `refreshVaultStats()` made this much
harder than it needed to be. It is defensible in production — the accordion
genuinely may not exist during startup — but it converts every later failure
into an empty report with no explanation.

### Two "unexplained" failures were a deleted working directory

A directory deleted and recreated leaves any shell that was open at the time
attached to the dead inode. The path string is the same; the inode is not. The
symptom that finally exposed it was `python3 -m http.server` failing with
`FileNotFoundError` from `os.getcwd()` — a process that cannot resolve its own
working directory.

Test runs from that shell were serving the **old tree**. That is the likely
cause of both failures below that no code change explained:

- the generator suite reporting zero buttons once and never again;
- the reuse-report fixture reporting zero records, which resolved when the
  files were re-read from a fresh shell rather than by any edit.

Neither was diagnosed by reasoning — three hypotheses were wrong on the second
one — and neither was fixed by the diagnostics added while chasing them.
Assertions do not change behaviour.

**The lesson is about the debugging, not the bug.** When a failure survives
several plausible explanations and then vanishes without a corresponding
change, the environment is a better suspect than the code. It is worth checking
`pwd -P` and the file sizes on disk before instrumenting further.

The staged diagnostics stay. They cost nothing and they would have narrowed
this faster: reporting *which* stage failed — records not visible, cache empty,
button not rendered — rather than a bare count of zero.

### Unexplained: the generator tests failed once, then stopped

After the Bootstrap stub landed, the generator suite reported zero buttons
where six were expected. The next two runs passed, unchanged except for added
assertions — and assertions do not change behaviour.

So the cause is unknown. The stale-id removal added at the same time should not
have mattered: the failure was in the first test of the suite, on a DOM where
no earlier dialogue with that id existed. Something environmental resolved
between runs.

Recorded rather than closed. The suite now reports **which stage** failed —
whether `getElementById` resolved to the dialogue just built, whether the
dialogue has a `.modal-body`, and whether `showMainPasswordGeneratorDlg()`
populated it — so a recurrence produces a diagnosis instead of a bare count of
zero.

A vacuous assertion was also fixed while looking: the toggle test iterated over
the buttons asserting each was hidden, and with zero buttons that loop
succeeded. It reported green while the dialogue produced nothing at all. It now
asserts there are six to hide first.

### Gap found on review: the generator button had no tests

Verified in a scratch jsdom harness when it was written, never carried across
to `tests.html`. Six checks that existed and ran nowhere the build could see
them — the same failure as the two suites that reported without gating, and
exactly the thing this document keeps complaining about.

Found by asking "is the implementation complete?" and grepping for
`x-gen-breach-check` in the test file rather than answering from memory. It
returned 0.

Now covered: one button per generated password, the toggle reaching the
generator as well as the per-field buttons, offline reading as could-not-check,
and a clean password saying so.

### A known cost of hiding the buttons

The breach buttons are hidden when the preference is off rather than shown and
disabled. That remains the right call: a disabled control on every password
field whose only function is to say "go turn on a preference" is real clutter,
and the menu entry does that discovery job once.

The cost is that **"the feature is off" and "the feature is broken" look
identical** at the point where you are looking for the button. The toolbar
badge is the only signal, and it is at the other end of the screen from the
record row or the generator dialogue.

Both of us hit this within an hour of building it: a missing shield in the
password generator was investigated through file sizes, greps and line numbers
before anyone asked whether the preference was enabled. It was not.

Recorded rather than changed. If it recurs, the cheapest fix is probably a line
in the generator and record views when the feature is off — not a button, just
text — but that reintroduces some of the clutter the hiding avoids. Ask whether
it has actually bitten anyone twice before adding it.

**Diagnostic order for "the button is not there", cheapest first:**

1. Is `enablePasswordBreachCheck` on? The ⚠ BREACH CHECK badge in the footer
   answers this without opening preferences.
2. Was a file loaded since? `loadFileContent()` applies the loaded file's
   preferences, so opening a shared vault can turn breach checking off.
3. Shift-reload. `python -m http.server` sends no cache headers, so a plain
   reload can serve a stale module.
4. Then check the file on disk.

### Fixed: the per-field button needed a reload to appear

Reported as "I do not see a breach icon in the password dialog yet".

`mkRecordField()` read the preference when the row was **built**, and rows are
built when records are rendered. Enabling the preference afterwards therefore
left every existing field without a button until the page was reloaded — the
same build-time-versus-runtime trap as the preference checkboxes, which are
also read once at construction.

PAM already had the right pattern: `enablePrinting()` toggles Bootstrap's
`d-none` on `.x-print` elements. `enableBreachCheckButtons()` now does the same
for `.x-fld-breach-check`, called after a preferences save and after a file
load, and the button is always built rather than conditionally.

### Added: the check is available while editing a password

Asked whether the generator dialogue should offer it too. **The generator
itself: no.** A 20-character password from PAM's alphabet carries around 120
bits; the chance it appears in an 850-million corpus is about 1 in 10^28, so
the button would always return "clean" and spend a request to say nothing.

**The editable row: yes, and it was missing.** That is where a password is
adopted — typed, pasted, or taken from the generator — and it is the last
moment before commitment. Most of the value there is local rather than from the
corpus: a generated password passes every check, while a hand-typed
`Summer2026` fails on structure with no network at all.

Two details that matter more than the button:

- The value is read from the input **at click time**, not captured when the row
  was built. In an edit row it is still changing.
- The result is cleared on the first keystroke. A result describes the value it
  was computed from, and left in place it would describe a password the user no
  longer has — the same stale-display trap as the orphaned progress element in
  the vault-wide report.

### Status: per-field button DONE

A shield button beside the eye on password fields, present **only** when
`enablePasswordBreachCheck` is set. Hidden rather than shown-and-disabled: with
the preference off, every password field in the vault would carry a control
whose only function is to say "go turn on a preference". The menu entry does
that job once, which is where someone discovers the feature.

The result is written into the row rather than a dialogue, so the answer
arrives where the question was asked. All three outcomes are reported, and the
offline case says both *could not check* and *nothing was learned about this
password* — a button that silently did nothing when the network was down would
be worse than no button.

Icon names verified against the real Bootstrap Icons set rather than assumed:
neither `bi-shield-check` (this button) nor `bi-key` (the menu entry) was
previously used anywhere in PAM, and an unknown name renders as an invisible
glyph — an icon-only button that is simply not there. Both resolve.

### Breached and structurally weak are told apart

From a real run: 220 passwords in 36.9s, 85 rejected. The report said "85
password(s) should be changed" and listed each with its reasons in one grey
line, so a published password and a short one looked identical at a glance.

`verdictFor()` now returns `inCorpus` and `structural` as separate flags rather
than leaving the caller to infer them from the reason text — a renderer that
pattern-matched prose would break the first time the wording changed. The
report labels each entry **BREACHED** or **WEAK**, in different colours, and
counts them separately in the summary: *"85 password(s) should be changed — 12
found in the breach corpus, 73 structurally weak"*. The existing reasoning is
kept underneath, not replaced.

The distinction is worth making because the urgency differs. A password in the
corpus is published — whoever holds the dump has it, and it should change
today. A structurally weak one is a bad bet that has not necessarily been lost
yet.

**Timing, measured:** 36.9s for 220 requests is 168ms each, of which 120ms is
the deliberate delay. The corpus itself answers in about 48ms, so the throttle
is most of the wall time and is the knob to turn if it ever needs to be faster.

### Fixed: an empty vault had no report body

Found by the regression test for the close-and-restart fix, which failed for a
reason unrelated to what it was testing.

`readyBody()` omitted the progress and results containers when there was
nothing to check. So on a vault with no stored passwords, Check was still
shown, and pressing it reported *"internal error: the breach report body is not
present"* — a correct message about entirely the wrong thing. The loud-failure
change from the previous fix is what made this visible rather than silent.

Both halves fixed: the containers are always present, and Check is hidden when
there is no work for it. A button whose only possible outcome is to report that
it has nothing to do is an invitation to press it and learn nothing.

**The test was also wrong.** Its second `show.bs.modal` fired outside
`withVaultUiFixture`, by which point the vault was empty — so it took the
no-passwords branch and failed on a missing element that had nothing to do with
the restart behaviour it was checking. Now scoped inside the fixture, with a
separate test for the empty-vault case.

### Fixed: Check stopped working after closing the dialogue

Reported as "Check does not seem to be working", and the qualifier — only
after closing — was the whole diagnosis.

Closing the dialogue did not stop a run. So: start a check, close mid-run,
reopen. The loop carried on sending requests nobody was watching. Reopening
rebuilt the body and orphaned the progress element the run was writing to, so
its updates went to a detached node. And the `running` flag was still set, so
the next Check returned immediately — through a **silent return**, leaving a
button that looked broken.

Both halves fixed:

- `hide.bs.modal` sets `cancelRequested`. This is also right on its own terms:
  the user closed the report, and continuing to contact a third party on their
  behalf is not something to do quietly.
- The `running` guard now says `a breach check is already running` rather than
  returning silently. It is genuinely reachable — the loop finishes its current
  request before stopping — so a quick close and reopen can still land there.

Three other silent returns in this module became status messages at the same
time, and the async callback now catches its own rejection: an exception inside
`startBreachCheck()` previously became an unhandled promise rejection, which
looks exactly like a button that does nothing.

**The pattern across all three bugs in this feature.** A Check button described
in prose that had no implementation. A Close button that existed but was inert.
A Check button blocked by a flag that failed without a word. Each was invisible
rather than wrong, and none of the unit tests could see them because they
asserted text and presence rather than behaviour.

### Fixed: the Close button did nothing

`mkPopupModalDlgButton(text, type, tooltip, callback)` calls its callback
unconditionally and hides the modal only on a truthy return. The fourth
argument is therefore **required, not optional** — omit it and the handler
throws before reaching `hide()`, so the button does nothing at all. Every other
call site in the codebase passes one; this was the only one that did not.

The unit test asserted the Close button *existed*. It did. Presence is not
behaviour, and that distinction has now produced two bugs in this feature: a
Check button whose label was described in prose that had no button behind it,
and a Close button that was present and inert.

The regression test is an e2e test that clicks Close and asserts the dialogue
is gone. It also asserts the Check button is **hidden** while the preference is
off, which is the state most users will see.

### The critical requirement

PAM is a PWA. **Offline is a normal state, not an error.** A user who is
offline must never see a result that reads as clean.

Write the failure tests **first**: unreachable host, HTTP error, 502 HTML error
page, empty body, malformed line, and a padding decoy with a count of `0` —
each asserting `CANNOT DETERMINE` or "not found" rather than a pass.

This exact bug appeared three separate times in three different disguises while
building `pwcheck`, and each time the program looked like it worked.

### Also required

- All Unicode normalisation forms checked, not just the one entered.
- `Add-Padding: true` on requests.
- Every response line validated before a non-match is believed.

---

## 14. Loading a file applies its preferences, including security settings — OPEN

The stale `pam-password-generator-standalone.png` capture looked like a
screenshot problem and was not. It showed Length 20 and three-word passwords
because that is genuinely what the application was doing: the harness loads
`www/examples/example.txt`, and **a loaded file carries its own preferences,
which override the defaults**.

`example.txt` still held `passwordRangeLengthDefault: 20` and
`memorablePasswordMinWords: 3`. Both example files now carry the v2.4.0 values.
Without that, a user loading the example vault would get three-word passwords
from the generator that the breach check immediately rejects.

**The wider point is a security one.** Preferences that change security posture
travel inside PAM files, and are applied on load without confirmation. The
example file was setting `filePassCache: 'local'` — persisting the file
password to `localStorage` across browser sessions, which is the weaker of the
two strategies and the one SEC-002 deliberately made non-default. Loading the
examples silently switched the user to it. Now `session` in both files.

The same mechanism could carry `allowHtmlFieldRendering`,
`searchPasswordFieldValues` (the search oracle fixed in v2.3.0), or
`enablePasswordBreachCheck` (outbound traffic). None is set in the shipped
examples, and nothing stops a *shared* file setting them.

### How bad is it? Less than it first appears — the CSP does real work

An early reading of this item claimed a file could enable
`allowHtmlFieldRendering` and reach script execution, since `field.js` renders
an `html` field's raw value live when that preference is on. **That chain does
not work**, and it is worth recording why, because the reasoning is what keeps
the severity honest:

- `script-src 'self' https://cdn.jsdelivr.net` carries **no `'unsafe-inline'`**,
  so an injected `<img onerror=…>` never fires. Inline event handlers are
  blocked outright.
- HTML inserted through `innerHTML` does not execute `<script>` tags at all, by
  browser rule, so a script tag in a field value is inert regardless.
- Exfiltration is mostly closed as well: `img-src 'self' data:` stops the
  classic beacon, `style-src 'self'` stops CSS-based leaks, and `connect-src`
  permits only PAM's origin and the HIBP API.

So this is **not** a path from a shared file to reading someone's vault. It is a
**degraded security posture** problem: a file can silently move a user to
`filePassCache: 'local'` (master password persisted to `localStorage`), turn on
the search oracle, or enable outbound traffic. Real, worth fixing, not urgent —
below 9a in priority, and not a reason to schedule 9b.

**One genuine gap found while checking this.** `form-action` is unspecified in
the policy, and unlike most directives it does **not** fall back to
`default-src`. A form could post anywhere. Adding `form-action 'self'` costs
nothing and closes the one exfiltration channel still open. That is worth doing
independently of the rest of this item.

### The fix: confirm only when a file weakens the posture

Refusing to apply preferences from a loaded file would be wrong. An
administrator distributing a vault to read-only users should be able to set a
stricter policy and have it hold without each user reconfiguring anything.

The resolution is that each security preference has a **safe direction**, and
only one direction needs consent:

| Preference | Applied silently | Requires confirmation |
|---|---|---|
| `allowHtmlFieldRendering` | → `false` | → `true` |
| `searchPasswordFieldValues` | → `false` | → `true` |
| `enablePasswordBreachCheck` | → `false` | → `true` |
| `filePassCache` | → `none` / `session` | → `local` / `global` |

An administrator hardening a distribution is entirely unaffected: tightening
applies silently, which is what they want. The prompt appears only when a file
would leave the user **less safe than they already are**.

Non-security preferences — password length, word counts, search scope, theme —
continue to apply as they do today. This is a narrow rule over four values, not
a change to how loading works.

The toolbar badges already show the resulting state — ⚠ HTML ON, ⚠ PW SEARCH,
⚠ BREACH CHECK, and the filepass indicator — which is a real mitigation, but
they report afterwards rather than asking first.

### SEC-001 in `SECURITY.md` — CORRECTED, and `form-action` added

Found while checking this item. Three problems, all from the section predating
the v2.4.0 CSP work. **All three are now fixed**, and `form-action 'self'` has
been added to the policy with a unit test pinning it.

1. **"HTML rendering can only be enabled in Preferences → Security → Allow HTML
   Field Rendering" is false**, twice over. There is no Security tab — the
   preference is on **Administration** — and it is not the only route, because
   a loaded file can set it. SEC-001's own *Residual risk* paragraph says so
   four lines later, so the document contradicts itself.
2. **The stated risk overstates what is reachable.** "html fields could contain
   malicious scripts (XSS)" was accurate when written. Since v2.4.0 the CSP
   carries no `'unsafe-inline'`, so inline handlers do not fire, and
   `innerHTML` does not execute script tags. Script execution is not the live
   risk.
3. **The real residual is content injection, and it is not described.** Injected
   markup can still render convincing UI. With `form-action` unspecified, a
   fake "confirm your master password" form could post to any origin. That is
   the concrete reason to add `form-action 'self'`, and it belongs in SEC-001
   rather than being inferred from a CSP directive list.

Overstating a risk is safer than understating one, so this was not urgent. But a
security document that contradicts itself in adjacent paragraphs and names a
non-existent tab will not be trusted on the parts that are right.

**What changed.** SEC-001 now names the Administration tab, states plainly that
a loaded file can enable the setting by itself, describes what the CSP does and
does not block, and lists the residual risks in order: content injection first,
the `form-action` gap second, and a distributed file carrying its own setting
third. It also warns against reading the CSP as licence to relax the default —
`script-src` allows `cdn.jsdelivr.net`, which serves arbitrary npm content, and
that is only safe because `innerHTML` cannot execute script tags at all.

**`form-action 'self'` is in the policy**, closing the one exfiltration channel
the rest of it left open. A unit test asserts it, with a comment recording why
it needs its own assertion: `form-action` is one of the few directives with no
`default-src` fallback, so its absence is silent.

## 15. Vault merge — IDEA, an opportunity worth scoping properly

Raised as a natural extension of item 7: once you can see what differs between
two vaults, the obvious next question is whether you can reconcile them.

**The need is real and current.** PAM is explicitly multi-device with file sync.
Editing on a phone and a laptop between saves produces two divergent vaults, and
today the only resolution is to pick a file and lose the other side's changes.
Nothing warns that this happened. A per-record merge is the missing operation.

**But merge is a different risk class from diff, and the difference matters.**
Diff is read-only: a mis-matched record produces a confusing report. Merge
writes: a mis-matched record silently overwrites a credential, and PAM has no
history to recover it from.

That inverts the conclusion reached for item 7. Durable entry identity is
merely *nice to have* for diff — it adds rename detection to a feature that
works without it. For merge it is **load-bearing**, because the cost of
matching the wrong records changes from a bad report to a destroyed password.

**Automatic resolution is not available, and should not be faked.** Records
carry no modification timestamp — only `created`, assigned at save — and fields
carry none at all. There is no basis for last-write-wins at any granularity.
Every conflict therefore needs the user to choose, which is the right answer
for this application regardless: a password manager silently picking between
two credentials is not a behaviour worth having.

**The interesting part: PAM already has the undo mechanism.** Records can be
deactivated rather than deleted. A merge that *deactivates* the losing version
instead of discarding it is reversible, visible in the record list, and needs no
new schema. It also composes with existing behaviour — the reuse report already
excludes inactive records under `hideInactiveRecords`, so superseded versions
would not generate noise. That reuses machinery built for other reasons and
turns the most dangerous property of merge, irreversibility, into a
non-problem.

**Sketch, not a design:**

- Match records the way diff does; require confirmation for anything matched
  heuristically rather than by ID.
- Present each conflict as a choice; never resolve silently.
- Keep the losing version as an inactive record rather than deleting it.
- Never display password values in the conflict UI — report *that* they differ,
  as item 7 does.

Scheduling: this wants durable IDs, so it sits after that lands. Item 7 does
not, and can precede it.

## 16. CodeQL: memorable passwords used Math.random() — RELEASED in v2.4.1

Raised by GitHub Advanced Security on the v2.4.0 pull request, and **found
after v2.4.0 had already been released**. One alert was real and important; the
other was a false positive worth rewriting anyway.

Everything in this section shipped in **v2.4.1**, not v2.4.0: the CSPRNG fix,
the pattern-check scoping, the screenshot seed change, and the in-record
generator length fix.

### Real: insecure randomness in the password generator

`getCrypticPassword()` used `crypto.getRandomValues()`. `getRandomWord()`, which
selects the words for **memorable** passwords, used `Math.random()`.

That is not a cryptographic generator. V8 implements it with xorshift128+,
whose internal state is recoverable from a small number of observed outputs,
after which past and future values can be derived. The generator dialogue
displays five memorable passwords drawn from the same stream, so an attacker
who learns any of them learns something about the others.

It also invalidated the entropy analysis done for item 13. "Five words is 66
bits" assumes each word is an independent uniform draw from the list. It was
neither independent nor uniform.

**Fixed with `randomInt(bound)`**, used by both generators, which draws from
`crypto.getRandomValues()` and rejects values above the largest exact multiple
of the bound. That second part removes a modulo bias that was also present in
the cryptic path: it mapped a `Uint8Array` byte with `% alphabet.length`, and
256 is not a multiple of 72, so the first 40 characters of the alphabet were
slightly favoured. Small, but the entropy figures in the README are stated on
the assumption of a uniform draw.

Verified over 60,000 draws: within 5% of uniform (1.16% observed), always in
range, and both generators still produce correct output.

**The lesson is about where the analysis stopped.** Item 13 examined the word
list size, the word count, the threat model and the attack times, and never
asked whether the words were being drawn properly. Every figure in that
analysis rested on an assumption about a line of code nobody had read.

### The pattern checks fired on coincidence

Switching to a CSPRNG changed which passwords the generator produces, and one
of them failed a build: `#1H20548n1G#z0O%^tQ2VgUwp9.zhn` was rejected for
containing the year **2054**. That password carries 185 bits.

Measured over 200,000 random 30-character passwords, **0.13% trip at least one
pattern check** — a year-like run, a keyboard fragment, an ascending pair, a
doubled character. That is a 2.6% chance per twenty generated, so it would have
recurred every few dozen runs, and it would have rejected perfectly good
passwords for real users.

The error was conceptual rather than a threshold being wrong. These checks look
for evidence of **human construction**. A coincidental run inside a long random
string is not that, and treating it as such produces exactly the false
positives that teach people to ignore the tool.

Two exemptions, both narrow:

- **Above three times the entropy floor**, pattern checks are skipped. Well
  above anything composed by hand, well below what the generator produces.
- **Recognised passphrases** are skipped too. The keyboard row `qwertyuiop`
  contains "erty", so `liberty`, `poverty` and `property` all tripped the
  keyboard-run check — 0.17% of generated memorable passwords, every one a
  false positive. A passphrase is a human choosing words, not characters, and
  its weakness is word count, which the word entropy estimate already measures.

The entropy floor itself is never exempt. Thirty identical characters is still
rejected.

After: **0 false rejects in 3,000 cryptic and 4,000 memorable passwords**, with
every human pattern still caught.

### The in-record generator ignored the length preference

Caught by looking at the regenerated screenshots rather than by any test.

`mkGeneratePasswordDlg()` — the generator that opens inside a record's password
field — had `let len = 20` hardcoded. It never read
`passwordRangeLengthDefault`. So the standalone generator produced 30-character
passwords while the one in the record editor produced 20, and nothing anywhere
compared them.

With `memorablePasswordMinWords` raised to 5, that meant squeezing five words
into twenty characters: the capture showed `dk/pvc/am/you/nearby` and
`most/dl/acne/horn/il`. It is also exactly the configuration measured at a ~3%
failure rate, where the generator gives up and returns `???` plus random hex.

Now `window.prefs.passwordRangeLengthDefault || 20`, and verified through the
real edit-row path: 30-character cryptic passwords and five-word memorable ones
such as `model/jump/pour/clinics/silent`.

**Nothing mechanical would have found this.** The unit tests call
`getMemorablePassword()` with an explicit length. The e2e test added for item 13
checks the *standalone* generator, which was already correct. `check-images`
compares filenames. The regenerated capture was the only artefact that showed
it, and only to someone who read the passwords in it.

That is the argument for looking at the pictures rather than only counting
them.

### The screenshot seed had to change with it

`SEED_RNG_JS` overrides `crypto.getRandomValues` so generated passwords are
deterministic in captures. It filled every element with `next() & 0xff`, which
was correct when every caller used a `Uint8Array`.

`randomInt()` uses a `Uint32Array` and expects a full 32-bit draw. Under the
old seed it would only ever have seen values 0-255, so `randomInt(9858)` would
have selected from **the first 256 words of the list** — 2.6% of the
vocabulary. The captures would not have failed; they would have shown
passwords drawn from a crippled generator, and nothing would have said so.

Now `array[i] = next() >>> 0`, letting the typed array truncate. `Uint8Array`
output is byte-identical to before, so no existing capture is affected by this
change. The probe that verifies the seed took now also checks that a
`Uint32Array` receives a wide value, so the same mistake cannot pass silently
again.

**The two generator captures must be regenerated regardless.** Both generators
now consume the seeded stream differently — `getCrypticPassword()` makes one
32-bit draw per character instead of one `Uint8Array` for the whole password,
and `getRandomWord()` draws from the CSPRNG rather than `Math.random()`. The
passwords in `pam-password-generator-standalone.png` and
`pam-password-generator.png` will differ.

### False positive: URL substring sanitization in a test

CodeQL flagged `allowed.includes('https://api.pwnedpasswords.com')` in
`tests.html` because that shape, applied to a *string*, would also match
`https://evil.com/?x=https://api.pwnedpasswords.com`. Here `allowed` is an
array of CSP directive tokens, so `.includes()` is exact element equality and
the attack does not apply.

Rewritten as `.indexOf(...) > -1` regardless. The analyser cannot tell arrays
from strings at that call site, and neither can a reader skimming the file —
the clearer form costs nothing and removes a recurring alert that would
otherwise need dismissing on every scan.

## `make test PORT=8088` never worked

The Makefile threaded `$(PORT)` through the server and the kill command, and
documented `make test PORT=8088` as an example. The tests hardcoded
`http://localhost:8081/` in twenty-nine places. So a non-default port started a
server the tests never spoke to, and they either failed against nothing or
silently tested whatever happened to be on 8081.

`tests/test_unit.py` already read `PORT` from the environment correctly. The
pattern existed; the other two files had not followed it.

Now `test_chrome.py` and `screenshots.py` derive their URL from `PORT`, and the
Makefile passes it to every process that talks to the server. Verified against a
server on 8082: `PORT=8082` finds it, `PORT=8081` correctly reports none.

**Concurrency was the motivation and is now possible:**

    make test &
    make screenshots PORT=8082

The other shared state was `www/js/version.js`. Its recipe truncated with `>`
and appended six times, so a browser fetching it mid-write would get a partial
module and every import would fail. It is now written to `$@.tmp` and moved
into place — `mv` within a directory is atomic on POSIX, so a reader sees the
old file or the new one, never half of one.

**CPU contention was considered and dismissed.** Both suites are dominated by
waiting rather than computing — 120ms inter-request delays, `SETTLE` pauses,
page loads, Selenium round trips. Two headless browsers on a 16-thread machine
will not contend enough to matter. The one theoretical risk is a capture-timing
poll expiring under load, and `wait_for_modal()` has a five-second budget
against transitions that take about 300ms.

## Two sets of defaults, drifting since v2.3.0

The e2e generator test failed with `reed/mini/ties/rover` — four words, and
**exactly 20 characters**. That length was the clue: the running application
was using `passwordRangeLengthDefault: 20` after it had been raised to 30.

`prefs-model.js` exports `getDefaultPrefs()`. `prefs.js` had its own hardcoded
object literal in `initPrefs()`. **The application used the second; every unit
test asserted the first.**

They had drifted well beyond my change:

| Preference | model | initPrefs |
|---|---|---|
| `searchPasswordFieldValues` | `false` | **missing** |
| `showPasswordReuseWarning` | `true` | **missing** |
| `enablePasswordBreachCheck` | `false` | **missing** |
| `passwordRangeLengthDefault` | 30 | 20 |
| `memorablePasswordMinWords` | 5 | 3 |

The three missing ones are worse than the two stale ones. `searchPasswordFieldValues`
is the v2.3.0 search-oracle fix: its default was never set in the running app
at all, and worked only because `undefined` is falsy. The unit tests asserting
it defaults to `false` were checking an object the application did not use.

`initPrefs()` now delegates to `getDefaultPrefs()` and keeps only what is
genuinely its own — `setHelpLinks()` and the per-device `filePassCache`
override. Verified: 41 keys each, no differences. A test compares the two and
fails on any disagreement, with `filePassCache` excepted since SEC-002 overrides
it per device by design.

`prefs.js` did not import `prefs-model.js` at all before this, which is how two
files ended up owning the same facts. Note `VALID_FIELD_TYPES` and
`VALID_CACHE_STRATEGIES` are still defined in both — the same shape of problem,
not yet fixed.

## A separator is not a password type

The e2e assertion added for item 13 failed, and the fault was in the test.

It identified memorable passwords by looking for `/`. But `SPECIAL` is
`_-+!./#$%^`, so a **cryptic** password can contain a slash —
`FpnzQcuq0nk/PxlMdYJ_itnK` is one from the example vault. The check treated it
as a three-part memorable password and failed it on word count.

The reliable discriminator is shape, not the presence of a character: memorable
passwords are lowercase alphabetic words joined by separators, so every part is
alphabetic. Verified against six cases including cryptic passwords with slashes,
dots and underscores.

Worth noting `wordEntropyBits()` in `breach.js` does not have this problem — it
splits on non-alphabetic characters and then requires every part to be a
dictionary word, so `FpnzQcuq0nk/PxlMdYJ_itnK` fails on the second condition
rather than the first. The production code was written more carefully than the
test asserting things about it.

## The screenshot mode was invisible, and came from the environment

`tests/screenshots.py` decided whether to write files by reading `CHECK` from
the environment. Two consequences, the second serious:

- The per-shot lines were identical in both modes. A line reading `CHG` claims
  the file on disk was updated; in check mode it was not, and nothing said so.
  When nothing changed, both modes printed the same summary.
- **An exported `CHECK=1` would make `make screenshots` silently stop writing
  files, permanently.** Every run would report changes and update nothing, and
  the only symptom would be captures that never seem to take. Nothing in the
  output contradicted the assumption that files were being written.

Fixed in two layers, because either alone is insufficient:

1. **The Makefile passes `CHECK` explicitly for both targets** — `CHECK=0` for
   `screenshots`, `CHECK=1` for `screenshots-check`. The target decides, not
   whatever the shell is carrying. This prevents it rather than detecting it.
2. **The mode is announced before any work and repeated in the summary**, and
   check mode uses distinct per-shot markers — `chg?` and `new?` rather than
   `CHG` and `NEW`, kept to five characters so the columns hold. If the
   environment ever wins anyway, the first line of output says so.

The general shape is one worth remembering: a mode flag taken from ambient
state, with no visible indication of which mode is active, fails silently and
in the direction of doing nothing.

## 17. What memorable passwords are for, and whether to judge at all — IDEA

A thought experiment rather than a proposed change, recorded because it
reframes two things v2.4.1 settled by assertion.

### The memorability rationale is weak; the typeability one is not

Raising `memorablePasswordMinWords` to 5 traded memorability for entropy, and
five words is genuinely harder to hold than three. Two ways to recover the
difference were considered and both fail:

| Scheme | Bits | Things to remember | Bits per item |
|---|---|---|---|
| 5 words | 66.3 | 5 | **13.3** |
| 3 words + 3 random chars | 58.3 | 6 | 9.7 |
| 3 words + 4 random chars | 64.5 | 7 | 9.2 |

A word carries 13.3 bits and costs one item of memory; a random character
carries 6.2 and costs about the same. So an affix scheme asks for **more**
items and yields **fewer** bits. It loses on both axes at once, which is
unusual enough to settle it.

Leetspeak is worse. Applied deterministically it adds **exactly zero** bits —
the attacker applies the same mapping to the same word list. Applied randomly
it adds about one bit per substitutable position (8 bits on a typical
three-word password, reaching 48) while requiring the user to remember which
positions changed; four plain words reach 53 with nothing extra to remember.
And rule-based cracking applies leet substitutions to dictionary words by
default, so it is the first transformation tried rather than a clever one.

**The better rationale is that they are easier to type, not easier to
remember.** Estimated taps on a mobile keyboard, counting layer switches:

| Password | Characters | Taps |
|---|---|---|
| cryptic, 30 chars | 30 | 56 |
| 5 words, `/` separator | 30 | 38 |
| 5 words, space separator | 30 | 30 |

A third fewer taps, and **the separator accounts for the entire penalty** —
four separators cost eight extra taps, two each, out to the symbol layer and
back. The words themselves are free. If typeability is the rationale then
`memorablePasswordWordSeparator` is the interesting lever, not the word count.

**And typing is sometimes mandatory.** Some sites block paste
(`onpaste="return false"`), typically older banking and utility portals — the
ones least likely to change. PAM is a separate PWA, not a browser extension, so
it has no access to another site's page and cannot work around this. Those
passwords must be typed by hand, on whatever device is present. That is a
permanent requirement rather than a fading one, and it is the strongest
argument for offering typeable passwords at all.

### The 60-bit floor may be the wrong shape

The strength checks are **purely expository**. Nothing is blocked, nothing is
rejected, no password is refused. Given that, a verdict PAM cannot justify is
worse than the data behind it.

And it cannot justify this one. The same three-word password holds for
millennia against a login that rate-limits and falls in 96 seconds against a
leaked fast hash. Which applies depends on how the far end stores the password
— something PAM has no way to know. A single threshold cannot express that, so
it will call good passwords weak for low-value accounts and pass marginal ones
for high-value accounts.

**Suggested shape, if this is ever built:** keep **BREACHED** as a verdict,
because it is a fact — the password is published and whoever holds the dump has
it. Replace **WEAK** with the estimate and its consequence:

> `liberty/dental/govern` — about 40 bits. Ample against a login that rate
> limits. Falls in about 96 seconds if the site's password hashes leak and are
> stored badly.

That gives the user what they need to decide, stops PAM pronouncing on a
question it cannot answer, and dissolves the entropy-floor problem entirely
since there is no longer a threshold to defend.

The two halves connect: both say PAM should **describe rather than judge**, and
both follow from noticing that the tool knows less about the user's situation
than its current output implies.

## 18. FIDO Credential Exchange Format (CXF), and stable ids — IDEA

CXF reached **Proposed Standard** on 14 August 2025, with errata in March 2026.
It is backed by 1Password, Apple, Bitwarden, Dashlane, Google, NordPass and
Okta, and Apple shipped export/import using it in iOS/macOS 26. It is the
credible interoperability target.

### PAM's field model fits

CXF's `CustomFields` credential exists for providers whose items carry
arbitrary user-defined fields — the spec says a provider with no grouping
concept should use it without setting `label` or `id`. The mapping is direct:

| PAM | CXF |
|---|---|
| record | `Item`, `title` → `title` |
| field | one `EditableField` inside a `CustomFields` credential |
| field name | `EditableField.label` |
| field value | `EditableField.value` |
| field type | `EditableField.fieldType` |

Four of PAM's ten field types map exactly: `text`→`string`,
`password`→`concealed-string`, `email`→`email`, `number`→`number`. The other
six — `url`, `phone`, `html`, `textarea`, `time`, `datetime-local` — have no
CXF equivalent and degrade to `string`. That is display loss, not data loss,
and the one that matters most maps exactly.

**A naive all-custom-fields export would be conformant and useless.** A record
holding `login` + `password` + `url` exported as untyped fields arrives as a bag
of strings, and the receiving manager cannot autofill it, because autofill keys
off `BasicAuth` plus `CredentialScope`. A worthwhile exporter pattern-matches
the common shape, emits `BasicAuth` with the url as scope, and puts the
remainder in `CustomFields`.

### Passkeys: refuse the import, and do not build the feature

Import is the lossier direction, and `Passkey` is the case that needs an
explicit decision rather than a default.

**Why it arises at all.** Nobody would type a passkey into PAM. But a CXF file
exported from 1Password or Apple *will contain them*, because carrying passkeys
across providers is the specification's whole purpose. So PAM's importer cannot
avoid having a policy.

**Why storing one is worse than refusing.** A passkey is not a secret you
transmit — it is an asymmetric key pair whose private half never leaves the
device. Authenticating means signing a challenge from the relying party, which
the browser routes through the operating system to registered credential
providers. PAM is a web page. It can hold the key material perfectly well and
still never be asked to sign anything, with no manual workaround: a signature
cannot be copied from the clipboard.

The danger is what the user then believes. They migrate, see their passkeys
listed in PAM, delete the originals from Apple's keychain, and have permanently
lost those accounts — the only usable copies are gone and PAM's cannot
authenticate. Silently dropping them produces the same ending with no warning.
So: refuse explicitly. *"This file contains 12 passkeys. PAM cannot store or
use passkeys, so they were not imported. Keep them where they are."*

Contrast an SSH private key, which CXF also carries and which PAM could store
sensibly: storage is the entire expected function and copying it back out to
`~/.ssh` is a real workflow. Passkeys have no equivalent.

**Should PAM add passkey support?** It is not architecturally impossible, which
is worth stating precisely: `chrome.webAuthenticationProxy` has existed since
Chrome 115, and extension-based passkey providers are real — Bitwarden has been
pressed to adopt exactly that API. But every route is a change of product:

- A **Chrome extension** — that API, Chrome only, plus store review.
- **Apple platforms** — a native app with an AutoFill Credential Provider
  extension. Swift, Xcode, App Store review, signing.
- **Android** — a native app registered with Credential Manager.

Each ends PAM being *"open this HTML file"*, and that property is not
incidental — it is the whole argument for trusting it. A suspicious user can
today read every line in an afternoon and confirm there is no server, no
telemetry and no exfiltration path. Route the passkey path through a signed
native extension talking to OS APIs and that verification is gone.

There is a niche argument too. **Passkeys are the case the platforms already
handle well**: where a site supports them, the OS keychain does the job for
free and phishing-resistantly. PAM's value is the long tail — sites that do not
support passkeys, will not for years, and sometimes will not even permit paste
(see item 17). Adding passkey support means competing where Apple and Google
are strong, at the cost of the thing PAM alone does.

**Recommendation: CXF export, and CXF import of everything except passkeys,
with an explicit refusal.** That buys interoperability, respects the standard,
and keeps PAM a page you can read.

### Stable ids from unique titles, without touching the record schema

`Item.id` is REQUIRED, and the spec says an identifier for an entity SHOULD be
the same across different creations of a CXF document. PAM has no durable
record id — the same gap that sits under items 7 and 15.

**But PAM guarantees unique titles.** `checkRecordEditDlg()` refuses a
duplicate title on create and edit, and `loadDupStrategy` enforces it on load
in every mode, including `allow`, which appends ` Clone` until the title is
free. A title change is already treated as a delete plus an add. So a deterministic
function of the title is a legitimate identifier for PAM's own semantics.

**A bare `SHA-256(title)` is not safe, though.** CXF warns that identifiers
SHOULD NOT contain personally identifying information because they travel **in
clear text** during a CXP exchange. A hash of a title is dictionary-attackable:
an observer hashes a few thousand site names and learns which services the user
holds accounts with. The more identifying the vault, the worse the leak.

**Salting fixes it, and costs nothing structurally:**

    Item.id = base64url(SHA-256(salt || title))

with `salt` a random value generated once and stored in the vault's `prefs`
block.

- Stable across exports — same vault, same title, same id.
- Unique within an account — guaranteed by title uniqueness.
- Distinct across vaults — two users with a `Chase Bank` record do not collide.
- Not dictionary-attackable — the observer does not have the salt.

**This is the significant part: it is not a breaking change.** The salt is one
new key in `prefs`, and unknown preference keys are already ignored by older
versions. No record schema change, no migration, no window in which one device
cannot read another's vault. The same reasoning splits item 9: see **9a**,
where a tamper-evidence hash in `meta` needs no format change either. Only
item 9b, authenticated encryption, genuinely requires one.

**What it does not give you.** `hash(title)` means a rename reads as a delete
plus an add to any importer. For CXF that is *fidelity* — it is what PAM
considers to have happened. For vault diff (item 7) it is the limitation
already recorded there, and for merge (item 15) it is still insufficient,
because merge needs to survive a rename to avoid overwriting the wrong record.

So this approach solves CXF export cleanly and does not retire the durable-id
question for items 7 and 15. Those still want a real per-record identifier.
It does mean CXF export need not wait for v3.0.

## A Chrome update churns the screenshots, and looks like a regression

The harness header warns that rendering is not reproducible **across
machines**. It is also not reproducible across **browser versions on the same
machine**, which is not obvious and produces a result that reads as a content
change.

Seen in v2.5.0. Between the e2e run on 7 September (`chrome=152.0.7977.83`) and
the one on 9 September (`chrome=153.0.8010.37`), Chrome updated. The next
screenshot run reported **4 of 51 changed** and none of the four had anything
to do with the release.

**The signature, which is what makes it diagnosable:**

| | Normal run | After a browser update |
|---|---|---|
| Tolerated-noise entries | 1 | **7** |
| Pixel deviation | ~12–16 | **33–108** |
| Dimensions of changed files | usually differ | **identical** |
| Changed files relate to the work | yes | **no** |

Subpixel text rendering shifts very slightly everywhere. Most captures stay
under `difference_is_noise()`'s threshold and appear as `same~`; a few cross it
and are written. So the tolerated-noise list growing from one entry to seven,
with the deviations several times larger than usual, is the reliable tell —
more so than the changed count itself.

**The two confirmations worth doing** before accepting the churn:

1. **Are the changed files plausibly related to the release?** In this case the
   Administration tab, the Custom About preference row and two new-record field
   dialogues, against a release that touched saving, loading and one CSP
   directive. No connection.
2. **Did any dimensions change?** A real content change usually moves a
   boundary. Identical sizes with different pixels is what re-rendered text
   looks like. All four were identical.

Then open one and look at it. `pam-about-custom-pref.png` is 790x112 — a single
preference row, where any real change is obvious at a glance. It was identical.

**Accept the churn rather than reverting.** `git checkout` on those files only
defers it to the next run, by which time the batch is larger and the connection
to a browser update is harder to see. Taking it immediately keeps the captures
matching the browser that is actually installed.

## 19. `make check-toc` — the table of contents is now verified — RELEASED in v2.5.0

Built in v2.5.0 after adding one README section exposed how far the contents
page had drifted. Full detail is under *Where claims live* below; the summary:

`check_images.py` verifies that every link **resolves**. That cannot catch a
link to the *wrong* section, which resolves perfectly. `tests/check_toc.py`
asks the structural question instead — does the contents page reflect the
document's hierarchy? — and reports four kinds of disagreement: **MISSING**,
**WRONG PARENT**, **DUPLICATE** and **STALE**.

It runs in `make lint`, needs no browser, and takes about a second. Anchors
follow GitHub's rules including the `-1` suffixes for repeated heading text,
because a checker that got those wrong would false-positive on every run and be
switched off within a week.

**Twenty-two problems on first run**, including nine Administration preferences
missing from the contents page entirely — among them `Allow HTML Field
Rendering`, `Search Password Field Values` and `Enable Password Breach Check`,
the three security-relevant ones. It also found two headings written at `###`
that silently **terminated the Administration Preferences section**, orphaning
the three preferences after them, and a duplicated *Hide Inactive Records*
section that had existed in two places with different wording.

It has since caught a regression in a heading added minutes earlier, which is
the strongest evidence it earns its place in `lint`.

## 20. `make check-links` — external links are now checkable — RELEASED in v2.5.0

Nothing had ever verified the 31 external URLs in the documentation. Written in
v2.5.0 after `check-toc` prompted the question "do the *other* links work?"

**Eight were stale on the first run**, and every one of them still worked:

| Was | Now |
|---|---|
| 5 MDN paths | MDN restructured `Learn/`, `Web/HTML/Element/`, `Web/Security/` and the PWA guides |
| `draw.io` | `app.diagrams.net` |
| `pytest.org` | `docs.pytest.org/en/stable/` |
| `auditboard.com/blog/nist-password-guidelines` | **a different company** — `optro.ai` |

**`MOVED` is the finding this tool exists for.** A redirect works, so nothing
reports it, and the link rots silently until the redirect is retired years
later — long after anyone remembers writing it. All eight would have been
invisible to any check that only asks "does this 200?".

**The last row is the interesting one.** That was not a path change, it was a
domain changing hands: a corporate blog post cited for NIST password guidance
now resolves to an unrelated company. Replaced with NIST's own SP 800-63B at
`pages.nist.gov`, which is both the primary source and far more likely to
survive. The lesson is that a redirect crossing a domain boundary deserves
judgement, not a mechanical update.

**403 is not a broken link.** The first run reported Stack Exchange as BROKEN,
which was the checker's fault: Stack Exchange rejects non-browser user agents.
403 and 429 are now reported as `BLOCKED` and do not fail the run. A checker
that cries wolf about working links gets switched off, and then reports nothing
at all.

**Not part of `make lint`**, deliberately: it needs network access, and a build
that fails because a third-party blog is having a bad afternoon teaches people
to ignore build failures.

## Where claims live

Every stale-documentation miss this session came from searching a scope defined
by where the work had been, rather than by what the change could reach. This is
the list that would have prevented them.

**When changing a default, a threshold, or anything with a stated value:**

- `www/js/prefs-model.js` — the default itself.
- `www/tests/tests.html` — tests asserting the default, *and* tests asserting
  behaviour that depends on it. The false-positive suite holds literal password
  strings; no search for a preference name will find them.
- `README.md` — the preference's own section, **and** the saved-file example
  JSON, which lists values and goes stale silently.
- `tests/test_chrome.py` — e2e assertions on counts and content.

**When changing behaviour a document describes:**

- `README.md`, `SECURITY.md`, `ARCHITECTURE.md`, `QUICKSTART.md`. The security
  document was missed entirely while the README was audited twice; it claimed
  "No data is ever sent to a server" for the whole branch.
- The README states counts in prose — "there are seven menu options" was wrong
  for two releases. Nothing compares a number in a sentence to the code that
  produces the thing counted.
- The preferences dialogue itself: visible text comes from `prefPromptDesc()`,
  not from the fifth argument of `mkPrefsCheckBox()`, which is a `title`
  attribute and therefore unreachable on a phone.

**When an item's status changes, re-read everywhere it is mentioned.**

This is the case that produced the most stale text, and it is not the same as
the checklist above. Changing a default breaks statements of *fact*. Closing an
item breaks statements of *limitation*, and those are written in more places
and in more discursive language, so a grep for the identifier will not find
them.

Worse, **text describing a shortcoming has a short half-life by construction.**
Writing "PAM cannot do X" is often what makes the gap visible enough to fix, so
the most carefully written explanations of limitations are the most likely to
become false. "This feature does X" is stable. "This feature cannot do X" is a
countdown.

Three examples from v2.4.0 and v2.4.1, all the same shape:

| Written | Made false by |
|---|---|
| README: "the structural check cannot see word-based weakness" | item 13, about an hour later |
| `PROPOSAL.md`: item 16 "fixed in v2.4.0" | v2.4.0 shipping without it |
| Release notes: "Known limitation — the entropy estimate..." | the fix for that limitation |

When an item moves to done, search for its **subject**, not its number:

- The README section describing the feature, *and* any passage explaining what
  it cannot do. These are usually in different sections.
- `RELEASE_NOTES_*.md` for the release in flight — check for a "known
  limitation" paragraph about the thing just fixed.
- This document's status table **and** the prose of the item's own section,
  which often opens with a statement of the problem in the present tense.
- Any version number written while the release was still unreleased. "Fixed in
  vX" is a prediction until the tag exists.

**The README's table of contents drifts, and nothing checks it.**

Adding one section exposed how far. Found in v2.5.0:

- The new **File Integrity Check** section was inserted as a `###` inside
  *Breached Passwords*, so it read as part of breach checking and appeared in
  no table of contents at all. It went first to a top-level section beside
  *Content-Security-Policy* — and that turned out to be the wrong home too, for
  a reason worth recording separately below.
- **Nine Administration preferences were missing from the TOC entirely**,
  including `Allow HTML Field Rendering`, `Search Password Field Values` and
  `Enable Password Breach Check` — the three security-relevant ones.
- **Three more were filed under the wrong parent**: `Enable Printing`,
  `filePass Cache Strategy` and `Custom About` were listed under
  *Miscellaneous* when they live under *Administration*.
- **`Administration Preferences` had no TOC entry** even though its five
  sibling sections all did.
- **`Search Record Field Names` was listed twice**, and `Hide Inactive Records`
  was listed under *Search Preferences* when it is an Administration
  preference.

None of that is catchable by the existing link check, which verifies that every
link resolves — a link to the wrong section resolves perfectly. The gap is
*structural*: whether the TOC reflects the document's actual hierarchy.

Fixed by generating the preferences block from the document rather than editing
it by hand, including anchor suffixing the way GitHub assigns it (there are two
`Hide Inactive Records` headings, so the second is `#hide-inactive-records-1`).

**Built: `make check-toc`** (`tests/check_toc.py`), and part of `make lint`.

It reports four kinds of disagreement — MISSING, WRONG PARENT, DUPLICATE and
STALE — using GitHub's anchor rules including the `-1` suffixes for repeated
heading text, since a checker that got those wrong would false-positive on
every run and be switched off within a week.

**On first run it found twenty-two problems**, and three of them were
structural rather than clerical:

1. **A regression introduced twenty minutes earlier.** The script that
   regenerated the preferences block never reset its parent when it left the
   preferences area, so every `####` heading in the rest of the document was
   attached to *Saving Preferences* — eight duplicated entries. Caught
   immediately.
2. **Two headings at the wrong level, predating all of this.** *What it checks
   besides the corpus* and *When the check cannot be made* were written at
   `###`, which **terminated the Administration Preferences section** and left
   `Search Password Field Values`, `filePass Cache Strategy` and `Enable Raw
   JSON Editing` as structural children of a breach-check subsection. Demoted
   to `#####`, where they belong as elaborations of the preference they
   describe.
3. **A duplicated section.** *Hide Inactive Records* existed twice — once at
   `###` inside *Search Preferences* and once at `####` under *Administration*,
   with different wording. The preference is on the Administration tab, so the
   stray copy was removed and its clearer explanation folded into the survivor.

Now clean at 127 entries against 127 headings, and verified to fail on an
induced regression.

### Security content was organised by accident, not decision

`File Integrity Check` was placed at the top level beside
`Content-Security-Policy` because that is where `Content-Security-Policy`
already was. Nobody had examined why *it* was there either. "Where the last one
went" is not a rationale, and it produced a document where the two things PAM
actually does about security sat outside the section called *Security
Considerations*.

That section held eleven subsections and **every one was a threat PAM cannot
control** — MITM, third-party compromise, malware, shoulder surfing, spoofing —
plus advice. Nothing in it described PAM's own defences. A reader asking "is
this safe?" went there and found only a list of ways they might be attacked.

Restructured so the section answers both questions, with the split named
explicitly because it is now answering two:

    ## Security Considerations
       ### What PAM does
           #### Content-Security-Policy
           #### File Integrity Check
       ### Threats to be aware of
           #### MITM ... (the existing eleven)

The cost, stated because it is real: the two mechanisms lose top-level
visibility in a scan of the document. That is worth less than being findable
where readers actually look for security information, but it is not nothing.

Anchors are unaffected — they follow heading text, not depth — so every existing
cross-reference still resolves. `check-toc` reported all thirteen TOC
disagreements the move created, and confirmed the result.

### The restructure corrupted a section, and no check noticed

The script that moved the two mechanism sections did this:

    mechanisms = ''.join(lines[fic_start:csp_end])   # a STRING
    fic = mechanisms[:fic_end - fic_start]           # sliced by a LINE COUNT

`fic_end - fic_start` is a number of lines. Used as a character offset it cut
29 lines of text after 29 characters, leaving the *File Integrity Check*
section reading:

    #### File Integrity Check

    Sinc

with its body orphaned above the Content-Security-Policy heading, its first
four characters gone.

**`check-toc` passed.** So did the anchor check, and `make all`. Every heading
was present, correctly nested and correctly linked — the structure was
flawless and the content was mangled. That is precisely the boundary of what a
structural check can see, and worth remembering before trusting a green
`check-toc` as evidence that a document edit went well.

**It was found by reading the file.** No tool substitutes for that, and the two
built this release make it easy to believe otherwise.

**The general point.** `check_images.py` verifies that links resolve, and every
one of these links resolved. Structure needs its own question. That distinction
is worth remembering the next time a check looks like it already covers
something.

**One mechanical rule that would have caught the most:** do not pipe an audit
through `head`. **Nor through `grep -v`.**

The second half was added a day after the first, because the first was not
enough. While building `check_toc.py` its lint output was checked with

    pylint tests/check_toc.py | grep "^tests" | grep -v "E0401\|R0914\|R0912"

and reported clean. `make all` then failed on exactly those two warnings. The
filter was written to hide `E0401` — a false positive from the sandbox lacking
`selenium` — and two real warnings were quietly added to it rather than fixed.

Suppressing a diagnostic is a decision, and making it inside a shell pipeline
records nothing and survives nothing. If a warning is a genuine false positive
it belongs in the project's lint configuration where the reason can be written
down; if it is real, it belongs fixed. `check()` was split into four focused
functions and the file rates 10.00/10 with nothing filtered. Twenty matches were truncated to eight, and the missing test was
at number nine. Truncation is right for exploring and wrong for any search whose
purpose is completeness.

## Open questions

**Answered in v2.4.0:**

- *What does the per-field breach button show — an inline result, or the same
  dialogue scoped to one field?* — **An inline result**, written into the row
  beside the field, so the answer arrives where the question was asked. It is
  cleared as soon as the value is edited, since it would otherwise describe a
  password the user no longer has. A dialogue would have been heavier than the
  question deserves.

- *Should the vault-wide check stop early once it finds a hit, or run to
  completion?* — **Run to completion**, with Cancel available throughout.
  Stopping at the first hit would report that one password is breached while
  leaving every other one unknown — the same shape as reporting a failed lookup
  as clean, which is the failure this whole feature is built to avoid. A real
  run over 220 passwords takes 37 seconds, so there is no strong argument for
  cutting it short, and a partial result would need its own marker
  distinguishing "not breached" from "never checked".

**Still open:**

- *Does the schema have a durable per-entry ID?* — No, and nothing in v2.4.0
  changed that. Records are still identified by title plus field names, which
  breaks as soon as either is edited.

  **It improves things; it blocks nothing.** Item 7 (vault diff) was recorded
  as blocked on this and is not: a title-based diff works today, and an ID adds
  rename detection rather than making the feature possible.

  **Correction.** An earlier version of this entry claimed the v2.4.0 report
  click-throughs could select the wrong record because "titles are not unique".
  That is false. **PAM enforces unique titles**: `checkRecordEditDlg()` refuses
  a duplicate on create and edit, and `loadDupStrategy` enforces uniqueness on
  load in all three modes — `allow` appends " Clone" until the title is free.
  Selecting by an escaped title pattern is therefore exact, and there is no
  defect to fix. See item 18, where the same guarantee yields stable CXF
  identifiers.

  What a durable ID would still add is rename survival: a retitled record reads
  as a delete plus an add. That is correct behaviour for PAM's own semantics,
  a quality-of-result issue for item 7, and a genuine requirement for item 15,
  where a merge must not overwrite a renamed record.

  **If item 9b is built, this belongs in the same migration** — for migration
  cost, not because anything depends on it. Both are schema-level and both are
  breaking. But 9b is no longer assumed (see its reassessment), so this cannot
  simply wait for it: if 9b is not built, the identifier needs its own
  justification and its own migration. v3.0 already requires a format change with migration for the
  AES-GCM work, and adding a record identifier in the same change costs one
  migration instead of two — which matters more than usual here, because each
  migration is a release where older devices cannot read newly written vaults.
  Doing them separately would open that window twice.

  Sequencing note: the identifier is the easier half and has no cryptographic
  risk, so it could reasonably land first within v3.0 development even though
  both ship together.
