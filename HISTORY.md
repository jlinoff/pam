# PAM History

PAM is one of several password managers Joe Linoff has written from scratch
over the past twenty years. This document traces the lineage.

---

## Predecessors

### passman

| | |
|---|---|
| Circa | 2010 |
| Project | [joelinoff.com/blog/?page_id=1025](https://joelinoff.com/blog/?page_id=1025) |
| Webapp | [projects.joelinoff.com/passman/passman-v0.7/](https://projects.joelinoff.com/passman/passman-v0.7/) |

The oldest surviving effort. Written in pure JavaScript using a table
paradigm for presenting data. The UI and implementation are quite complex.

### qspm

| | |
|---|---|
| Circa | 2018 |
| Project | [github.com/eSentire/qspm](https://github.com/eSentire/qspm) |
| Webapp | [esentire.github.io/qspm/](https://esentire.github.io/qspm/) |

Implemented in Rust and JavaScript, funded by eSentire, Inc. as a hack week
project. The acronym stands for Quantum Safe Password Manager — an ambitious
name. The UI and implementation are quite complex.

### myvault

| | |
|---|---|
| Circa | 2020 |
| Project | [github.com/jlinoff/myvault](https://github.com/jlinoff/myvault) |
| Webapp | [jlinoff.github.io/myvault](https://jlinoff.github.io/myvault/) |
| Help | [jlinoff.github.io/myvault/help](https://jlinoff.github.io/myvault/help/) |

The direct precursor to PAM. Implemented in Rust and JavaScript. Used in
production for several years. The record create/edit dialogs and password
generator were poor implementations — the motivation for rewriting as PAM.

### pam

| | |
|---|---|
| Circa | 2022 |
| Project | [github.com/jlinoff/pam](https://github.com/jlinoff/pam) |
| Webapp | [jlinoff.github.io/pam/www/](https://jlinoff.github.io/pam/www/) |

Pure JavaScript. Drops Rust — not because Rust isn't suitable (it is), but
because the browser's SubtleCrypto API provides everything needed. Leverages
Bootstrap 5 for mobile compatibility. Fixes the dialog and generator
weaknesses of myvault.

The acronym stands for Personal Accounts Manager, or Password Manager, or
whatever. It doesn't really matter.

---

## Chronology

Password management as a hobby project spans more than twenty years:

**Early 2000s** — First implementation in JavaScript, with hand-written
uncertified implementations of AES-256-CBC, AES-256-GCM, and DES3. Feasible
at the time because the day job involved designing certified hardware and
software security implementations in C++.

**2000s–2010s** — Successive reimplementations as a way to learn new
technologies: JavaScript, Python, Docker, Go, and eventually Rust.

**By PAM** — The tool had grown beyond password management into general
record management, driven largely by the ability to enter and access records
from a phone. That broader use case is what PAM is designed for.

**Rust was dropped** not out of dissatisfaction — Rust is excellent — but
because it was no longer needed. The browser secure context provides
everything required.

**A note on org-mode** — in a perfect world this would have been built in
Emacs org-mode, but reliable remote access from multiple devices never quite
worked well enough. JavaScript won by default.
