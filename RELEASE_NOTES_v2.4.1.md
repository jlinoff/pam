# PAM v2.4.1 Release Notes

A security fix. **If you have ever generated a *memorable* password with PAM —
any version, not only v2.4.0 — and it protects something that matters,
regenerate it.**

## Memorable passwords were generated with a non-cryptographic random source

`getCrypticPassword()` has always drawn from `crypto.getRandomValues()`, the
browser's cryptographic generator. `getRandomWord()`, which selects the words
for memorable passwords, used `Math.random()`.

`Math.random()` is not a cryptographic generator and is not documented as one.
V8 implements it with xorshift128+, whose internal state can be recovered from
a small number of observed outputs; once recovered, both earlier and later
values can be derived. The generator dialogue displays five memorable
passwords drawn from the same stream, so they are not independent of one
another.

It also means the entropy figures PAM's own documentation gives for memorable
passwords — about 13.3 bits per word, 66 bits for five words — were stated on
an assumption that did not hold. Those numbers assume each word is an
independent uniform draw.

**This is not new in v2.4.0.** The code predates that release by years. It
surfaced now because v2.4.0 was the first change to that file after CodeQL
scanning was enabled on the repository, and the scanner flagged it immediately.

## The fix

Both generators now use a shared `randomInt(bound)` that draws from
`crypto.getRandomValues()` and rejects any value above the largest exact
multiple of the bound before taking the remainder.

That rejection step also removes a modulo bias in the cryptic path, which was
mapping a random byte with `% 72`. Since 256 is not a multiple of 72, the first
40 characters of the alphabet were slightly favoured. Small, but the entropy
figures are stated on the assumption of a uniform draw.

Verified over 60,000 draws: within 1.2% of uniform, always in range.

## What you should do

- **Regenerate memorable passwords that protect anything valuable**, whichever
  version of PAM produced them. Cryptic passwords are unaffected — they were
  always drawn from the cryptographic generator.
- Nothing about stored data changed. Vault files, encryption and the file
  format are untouched, and v2.4.1 reads and writes exactly what v2.4.0 does.

## Also in this release

- The screenshot harness seeded `crypto.getRandomValues` by filling every array
  element with an 8-bit value, which was correct while all callers used a
  `Uint8Array`. `randomInt()` uses a `Uint32Array`, so under the old seed it
  would have selected from only the first 256 of the 9,858 words — captures
  would have shown passwords from a crippled generator without failing. The
  seed now fills the full element width, and its self-check verifies that.
- A CodeQL "incomplete URL substring sanitization" alert in the unit tests was
  a false positive — the value tested is an array of CSP tokens, so `.includes()`
  is exact element equality rather than substring matching. Rewritten as
  `.indexOf(...) > -1` so neither the analyser nor a reader has to work that out.
