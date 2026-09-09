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

## Also fixed: the in-record generator ignored the length preference

The password generator that opens inside a record's password field had its
length hardcoded to 20 characters and never read
`passwordRangeLengthDefault`. The standalone generator honoured it.

This did not matter before v2.4.0, when the default was also 20. Raising it to
30 made the two diverge.

The practical effect is on **memorable** passwords generated from inside a
record in v2.4.0. Fitting five words into twenty characters forces short words,
which draws from a smaller part of the list — roughly 3,500 usable words rather
than 9,858, so about **59 bits instead of the 66** the documentation states.
That is below the 60-bit floor PAM's own strength check applies, and the check
does not notice, because it assumes the full word list.

It also occasionally failed outright: about 3% of the time the generator could
not fit five words into twenty characters and returned `???` followed by random
hex.

Cryptic passwords from that generator were 20 characters rather than 30 — 131
bits instead of 196, both comfortably strong.

**Should you regenerate?** Only if you want the documented strength. 59 bits is
a meaningful password for anything rate-limited, and well short of the 66 the
README promises. Memorable passwords made with the *standalone* generator are
unaffected.

## Also fixed: the strength checks rejected valid passwords

The **Breached Passwords** report applies local checks alongside the corpus
lookup — keyboard runs, character sequences, repeated characters, embedded
years. Those look for evidence that a *person* composed the password. In a long
random string the same patterns turn up by chance and mean nothing.

Measured over 200,000 random 30-character passwords, **0.13% tripped at least
one of them**. A password carrying 185 bits was being reported as **WEAK** for
containing "2054".

Passphrases had a related problem: the keyboard row `qwertyuiop` contains
`erty`, so `liberty`, `poverty` and `property` were all reported as keyboard
runs — 0.17% of generated memorable passwords, every one a false positive.

The four pattern checks are now skipped for passwords well above the entropy
floor, and for passphrases made of dictionary words. The length and entropy
checks still always apply, so thirty identical characters is still rejected.
Nothing a person is likely to compose has stopped being caught: `Summer2026`,
`qwerty123456` and `password1234` are all still reported.

If a password you own was reported as WEAK by v2.4.0 and you could not see why,
this may be the reason — run the report again.

## What you should do

- **Regenerate memorable passwords that protect anything valuable**, whichever
  version of PAM produced them. Cryptic passwords are unaffected by the
  randomness fix — they were always drawn from the cryptographic generator.
- Optionally, regenerate memorable passwords created from **inside a record**
  in v2.4.0: they are about 59 bits rather than the documented 66. Less urgent
  than the item above.
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
