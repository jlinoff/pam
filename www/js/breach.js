// Breach checking against the Have I Been Pwned range API.
//
// This module is the part that decides what an answer MEANS. The network call
// is injected so every failure mode can be exercised without one, and so the
// rules below are testable in isolation.
//
// THE ONE REQUIREMENT THAT MATTERS
//
// PAM is a PWA. Being offline is a normal state, not an error. A user who
// cannot reach the corpus must never see a result that reads as clean.
//
// So there are three outcomes, and the third is not a verdict on the same axis
// as the other two — it is this module reporting that it failed to reach one:
//
//     FOUND             the password is in the corpus
//     NOT_FOUND         the corpus was consulted and does not have it
//     CANNOT_DETERMINE  the lookup failed; nothing was learned
//
// Reporting CANNOT_DETERMINE as NOT_FOUND is the fail-open bug. It appeared
// three separate times in three different disguises while building the
// command-line version of this check, and every time the program looked like
// it worked.

// One import: the word list, needed to recognise a passphrase for what it is.
// Nothing else. This module is reached on the error path, and a logging helper
// that reads window.prefs would throw there if preferences were not yet
// initialised — a secondary failure in the one place it is least welcome.
// Every failure returns its reason to the caller instead.
import { words } from './en_words.js'

export const FOUND = 'found'
export const NOT_FOUND = 'not-found'
export const CANNOT_DETERMINE = 'cannot-determine'

export const RANGE_API = 'https://api.pwnedpasswords.com/range/'

// A response line is a 35-character hex suffix, a colon, and a decimal count.
// Anything else means we are not looking at a range API response — most likely
// an HTML error page from a proxy or captive portal, which must never be read
// as "no match".
const LINE = /^[0-9A-F]{35}:\d+$/

/**
 * SHA-1 of a string as uppercase hex.
 *
 * SHA-1 is not a security choice here: it is the digest the range API indexes
 * by, and the comparison is an equality test against a published list.
 *
 * @param {string} text
 * @returns {Promise<string>} 40 uppercase hex characters
 */
export async function sha1Hex(text) {
    const bytes = new TextEncoder().encode(text)
    const digest = await window.crypto.subtle.digest('SHA-1', bytes)
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
}

/**
 * Interpret a range API response.
 *
 * Strict on purpose. Every line is validated before a non-match is believed,
 * because the failure that matters is reading a body we do not understand as
 * "your password is not in the corpus".
 *
 * @param {string} body - the response text
 * @param {string} suffix - the 35 hex characters after the 5-character prefix
 * @returns {object} {ok: true, found, count} or {ok: false, reason}
 */
export function parseRangeResponse(body, suffix) {
    if (typeof body !== 'string' || body.trim().length === 0) {
        return {ok: false, reason: 'the response was empty'}
    }
    if (typeof suffix !== 'string' || !/^[0-9A-F]{35}$/.test(suffix)) {
        return {ok: false, reason: 'the hash suffix is not 35 hex characters'}
    }

    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0) {
        return {ok: false, reason: 'the response contained no lines'}
    }

    let found = false
    let count = 0
    for (const line of lines) {
        if (!LINE.test(line.toUpperCase())) {
            // One bad line condemns the whole body. A partially valid response
            // is not a response we can reason about: the entry we care about
            // may be in the part we could not read.
            return {ok: false,
                    reason: `unexpected content in the response: ${line.slice(0, 40)}`}
        }
        const [lineSuffix, lineCount] = line.toUpperCase().split(':')
        if (lineSuffix === suffix) {
            found = true
            count = parseInt(lineCount, 10)
        }
    }

    // A count of zero is a padding decoy, not a hit. Requesting padding mixes
    // synthetic zero-count entries into the response so its length reveals
    // nothing; treating one as a match would report a breach that did not
    // happen. Our own suffix can legitimately appear as padding.
    if (found && count === 0) {
        found = false
    }
    return {ok: true, found, count: found ? count : 0}
}

/**
 * Look one password up in the corpus.
 *
 * @param {string} password
 * @param {function} fetchFn - injected; the same shape as window.fetch
 * @returns {Promise<object>} {status, count, reason}
 */
export async function lookupPassword(password, fetchFn) {
    if (typeof password !== 'string' || password.length === 0) {
        return {status: CANNOT_DETERMINE, count: 0,
                reason: 'no password was supplied'}
    }

    let prefix = null
    let suffix = null
    try {
        const hash = await sha1Hex(password)
        prefix = hash.slice(0, 5)
        suffix = hash.slice(5)
    } catch (error) {
        // crypto.subtle is unavailable outside a secure context.
        return {status: CANNOT_DETERMINE, count: 0,
                reason: `could not hash the password: ${error}`}
    }

    let response = null
    try {
        response = await fetchFn(RANGE_API + prefix, {
            headers: {'Add-Padding': 'true'},
        })
    } catch (error) {
        // Offline, DNS failure, blocked by policy, connection reset.
        return {status: CANNOT_DETERMINE, count: 0,
                reason: `could not reach the breach corpus: ${error}`}
    }

    if (!response || typeof response.ok !== 'boolean') {
        return {status: CANNOT_DETERMINE, count: 0,
                reason: 'the request returned nothing usable'}
    }
    if (!response.ok) {
        return {status: CANNOT_DETERMINE, count: 0,
                reason: `the breach corpus returned ${response.status}`}
    }

    let body = null
    try {
        body = await response.text()
    } catch (error) {
        return {status: CANNOT_DETERMINE, count: 0,
                reason: `could not read the response: ${error}`}
    }

    const parsed = parseRangeResponse(body, suffix)
    if (!parsed.ok) {
        return {status: CANNOT_DETERMINE, count: 0, reason: parsed.reason}
    }
    return {
        status: parsed.found ? FOUND : NOT_FOUND,
        count: parsed.count,
        reason: '',
    }
}

// ---------------------------------------------------------------------------
// Structural weakness
//
// These run locally and need no network. Without them ACCEPT would mean only
// "not in the corpus", which is a floor rather than a verdict: Summer2026 is
// in no breach corpus worth the name and is still a bad password.
//
// Each check returns a short reason or null. They are deliberately
// conservative — a false REJECT on a password the user actually likes teaches
// them to ignore the tool, which costs more than the check saves.
// ---------------------------------------------------------------------------

// Rows as a keyboard presents them, so `qwerty` and `asdf` are runs but
// `abcdef` is caught by the sequence check instead.
const KEYBOARD_ROWS = [
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
    '1234567890',
]

const MIN_RUN = 4          // shortest run worth objecting to
const MIN_REPEAT = 4       // aaaa, but not aaa
const MIN_LENGTH = 12      // below this, structure hardly matters

/**
 * A run of adjacent keys, forwards or backwards, in any keyboard row.
 *
 * @param {string} password
 * @returns {string|null} the offending fragment, or null
 */
export function keyboardRun(password) {
    const lower = password.toLowerCase()
    for (const row of KEYBOARD_ROWS) {
        const reversed = row.split('').reverse().join('')
        for (const source of [row, reversed]) {
            for (let i = 0; i + MIN_RUN <= source.length; i++) {
                const fragment = source.slice(i, i + MIN_RUN)
                if (lower.includes(fragment)) {
                    return fragment
                }
            }
        }
    }
    return null
}

/**
 * A run of consecutive characters by code point, forwards or backwards.
 *
 * Catches abcd and 4321, which no keyboard row contains as adjacency.
 *
 * @param {string} password
 * @returns {string|null}
 */
export function characterSequence(password) {
    const lower = password.toLowerCase()
    let run = 1
    let direction = 0
    for (let i = 1; i < lower.length; i++) {
        const step = lower.charCodeAt(i) - lower.charCodeAt(i - 1)
        if ((step === 1 || step === -1) && (direction === 0 || step === direction)) {
            direction = step
            run++
            if (run >= MIN_RUN) {
                return lower.slice(i - run + 1, i + 1)
            }
        } else {
            direction = (step === 1 || step === -1) ? step : 0
            run = direction === 0 ? 1 : 2
        }
    }
    return null
}

/**
 * The same character repeated.
 *
 * @param {string} password
 * @returns {string|null}
 */
export function repeatedCharacter(password) {
    const match = password.match(/(.)\1{3,}/)
    return match ? match[0] : null
}

/**
 * A year that reads as a date rather than as entropy.
 *
 * Only plausible years: 1900-2099. A password containing 4291 is not using it
 * as a year, and objecting would be noise.
 *
 * @param {string} password
 * @returns {string|null}
 */
export function embeddedYear(password) {
    const match = password.match(/(19\d\d|20\d\d)/)
    return match ? match[0] : null
}

/**
 * Entropy assuming the password is a random string of characters.
 *
 * log2(alphabet) * length, where the alphabet is inferred from which classes
 * appear. Correct for a random string and a large overestimate for anything
 * with structure.
 *
 * @param {string} password
 * @returns {number} estimated bits
 */
function characterEntropyBits(password) {
    let alphabet = 0
    if (/[a-z]/.test(password)) { alphabet += 26 }
    if (/[A-Z]/.test(password)) { alphabet += 26 }
    if (/[0-9]/.test(password)) { alphabet += 10 }
    if (/[^a-zA-Z0-9]/.test(password)) { alphabet += 33 }
    if (alphabet === 0) {
        return 0
    }
    return password.length * Math.log2(alphabet)
}

// Built once, on first use. 9,858 entries, so a Set rather than a linear scan.
let WORD_SET = null

/**
 * Entropy assuming the password is words drawn from PAM's list.
 *
 * A passphrase's strength is the number of words times log2(list size),
 * regardless of how many characters that happens to occupy. Measuring it by
 * length instead is what made `std/creature/history` score 118 bits when it
 * carries 40.
 *
 * Only separator-delimited passwords are recognised. Detecting concatenated
 * words would need segmentation, and guessing wrongly there would understate
 * a password that merely happens to contain a word — the expensive direction
 * of error, since a false REJECT teaches people to ignore the tool.
 *
 * @param {string} password
 * @returns {number|null} bits, or null if this is not a word-based password
 */
function wordEntropyBits(password) {
    const parts = password.split(/[^a-zA-Z]+/).filter(Boolean)
    if (parts.length < 2) {
        return null
    }
    if (WORD_SET === null) {
        WORD_SET = new Set(words.map((w) => w.toLowerCase()))
    }
    for (const part of parts) {
        if (!WORD_SET.has(part.toLowerCase())) {
            return null
        }
    }
    return parts.length * Math.log2(WORD_SET.size)
}

/**
 * A rough entropy floor, in bits.
 *
 * Takes the LOWER of the two estimates. A passphrase is both a sequence of
 * characters and a sequence of words, and its real strength is whichever
 * description the attacker will use — which is the cheaper one.
 *
 * @param {string} password
 * @returns {number} estimated bits
 */
export function entropyBits(password) {
    if (!password) {
        return 0
    }
    const chars = characterEntropyBits(password)
    const asWords = wordEntropyBits(password)
    if (asWords === null) {
        return Math.round(chars)
    }
    return Math.round(Math.min(chars, asWords))
}

// Below this a password is weak whatever its shape. 60 bits is not a strong
// password; it is the point below which one is indefensible.
export const MIN_ENTROPY_BITS = 60

/**
 * Every structural objection to a password.
 *
 * @param {string} password
 * @returns {Array<string>} reasons, empty if none
 */
export function structuralWeaknesses(password) {
    const reasons = []
    if (typeof password !== 'string' || password.length === 0) {
        return ['it is empty']
    }
    if (password.length < MIN_LENGTH) {
        reasons.push(`it is only ${password.length} characters`)
    }

    const run = keyboardRun(password)
    if (run) {
        reasons.push(`it contains the keyboard run "${run}"`)
    }
    const sequence = characterSequence(password)
    if (sequence) {
        reasons.push(`it contains the sequence "${sequence}"`)
    }
    const repeat = repeatedCharacter(password)
    if (repeat) {
        reasons.push(`it repeats "${repeat[0]}" ${repeat.length} times`)
    }
    const year = embeddedYear(password)
    if (year) {
        reasons.push(`it contains the year ${year}`)
    }

    const bits = entropyBits(password)
    if (bits < MIN_ENTROPY_BITS) {
        reasons.push(`it has roughly ${bits} bits of entropy, below ${MIN_ENTROPY_BITS}`)
    }
    return reasons
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export const ACCEPT = 'accept'
export const REJECT = 'reject'
export const UNDETERMINED = 'undetermined'

/**
 * Combine a corpus lookup with the local structural checks.
 *
 * The ordering matters and is not obvious:
 *
 * 1. A corpus hit is REJECT. Nothing else needs saying — the password is
 *    published.
 * 2. Structural weakness is REJECT even when the corpus could not be reached.
 *    These checks need no network, so being offline is no reason to withhold
 *    an objection we can make locally. A weak password is weak whether or not
 *    anyone has published it.
 * 3. Only then does a failed lookup become UNDETERMINED. It is not a third
 *    verdict on the same axis: it says the corpus was not consulted, so
 *    "not in the corpus" was never established.
 * 4. ACCEPT means every check that could run did run and none objected.
 *
 * Reporting 3 as ACCEPT is the fail-open bug. Reporting it as REJECT would
 * reject good passwords whenever the user is offline and teach them to ignore
 * the tool.
 *
 * @param {string} password
 * @param {object} lookup - the result of lookupPassword()
 * @returns {object} {verdict, reasons, count, checkedCorpus}
 */
export function verdictFor(password, lookup) {
    const reasons = []
    const structural = structuralWeaknesses(password)
    const checkedCorpus = lookup.status === FOUND || lookup.status === NOT_FOUND

    if (lookup.status === FOUND) {
        const times = lookup.count === 1 ? 'once' : `${lookup.count} times`
        reasons.push(`it appears in the breach corpus ${times}`)
    }
    reasons.push(...structural)

    if (lookup.status === FOUND || structural.length > 0) {
        // inCorpus is reported separately rather than left for the caller to
        // infer from the reason text. "Published in a breach" and "weak by
        // construction" call for different urgency, and a UI that had to
        // pattern-match prose to tell them apart would break the first time
        // the wording changed.
        return {
            verdict: REJECT,
            reasons,
            count: lookup.count,
            checkedCorpus,
            inCorpus: lookup.status === FOUND,
            structural: structural.length > 0,
        }
    }
    if (!checkedCorpus) {
        // Nothing objected, but the corpus was not consulted, so the absence
        // of a corpus objection means nothing. Say what failed.
        return {
            verdict: UNDETERMINED,
            reasons: [lookup.reason || 'the breach corpus could not be reached'],
            count: 0,
            checkedCorpus: false,
            inCorpus: false,
            structural: false,
        }
    }
    return {verdict: ACCEPT, reasons: [], count: 0, checkedCorpus: true,
            inCorpus: false, structural: false}
}

/**
 * Check one password end to end.
 *
 * @param {string} password
 * @param {function} fetchFn - injected; the same shape as window.fetch
 * @returns {Promise<object>} the verdict
 */
export async function checkPassword(password, fetchFn) {
    const lookup = await lookupPassword(password, fetchFn)
    return verdictFor(password, lookup)
}

// ---------------------------------------------------------------------------
// Running a check over many passwords
// ---------------------------------------------------------------------------

// Between requests. Serialised rather than parallel: a burst of hundreds of
// requests from one address is both impolite and a weaker privacy property
// than the same requests spread out, since it links them together in time.
export const REQUEST_DELAY_MS = 120

// A prefix that certainly exists in the corpus, used to establish that the
// service is reachable before firing hundreds of requests at it. Any prefix
// would do — this is a reachability probe, not a lookup.
const PROBE_PREFIX = '00000'

/**
 * Wait, without declaring a function inside the loop that uses it.
 *
 * @param {number} ms
 * @returns {Promise}
 */
function pause(ms) {
    return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * Is the corpus reachable at all?
 *
 * Worth one request before starting a long run: an offline user should be told
 * once, immediately, rather than watching several hundred failures accumulate.
 *
 * @param {function} fetchFn
 * @returns {Promise<object>} {ok, reason}
 */
export async function probeCorpus(fetchFn) {
    let response = null
    try {
        response = await fetchFn(RANGE_API + PROBE_PREFIX, {
            headers: {'Add-Padding': 'true'},
        })
    } catch (error) {
        return {ok: false, reason: `could not reach the breach corpus: ${error}`}
    }
    if (!response || typeof response.ok !== 'boolean') {
        return {ok: false, reason: 'the request returned nothing usable'}
    }
    if (!response.ok) {
        return {ok: false, reason: `the breach corpus returned ${response.status}`}
    }
    return {ok: true, reason: ''}
}

/**
 * Check many passwords, one request at a time.
 *
 * @param {Array} candidates - [{value, entries}] from passwordsToCheck()
 * @param {function} fetchFn
 * @param {object} options - {onProgress, isCancelled, delayMs}
 * @returns {Promise<object>} {results, cancelled, probeFailed, reason}
 */
export async function checkAll(candidates, fetchFn, options) {
    const opts = options || {}
    const onProgress = opts.onProgress || (() => {})
    const isCancelled = opts.isCancelled || (() => false)
    const delayMs = opts.delayMs === undefined ? REQUEST_DELAY_MS : opts.delayMs

    const probe = await probeCorpus(fetchFn)
    if (!probe.ok) {
        // Told once, before any of the real requests. Several hundred
        // identical failures would be worse than useless.
        return {results: [], cancelled: false, probeFailed: true,
                reason: probe.reason}
    }

    const results = []
    for (let i = 0; i < candidates.length; i++) {
        if (isCancelled()) {
            return {results, cancelled: true, probeFailed: false, reason: ''}
        }
        const candidate = candidates[i]
        const verdict = await checkPassword(candidate.value, fetchFn)
        results.push({entries: candidate.entries, ...verdict})
        onProgress(i + 1, candidates.length)

        if (delayMs > 0 && i + 1 < candidates.length) {
            await pause(delayMs)
        }
    }
    return {results, cancelled: false, probeFailed: false, reason: ''}
}
