// Minimum-disclosure queries over a vault.
//
// Every function here answers a question with the least information that
// suffices: "are these the same vault?" with 64 bits, "am I reusing
// passwords?" with one integer. Full disclosure stays available but is the
// last resort rather than the only door.
//
// The motivating failure: answering "are my two password stores the same?"
// required exporting both to plaintext CSV, because a full dump was the only
// egress on offer. The question needed a hash. See PROPOSAL.md.
//
// These are pure functions over a records array — the structure produced by
// convertInternalDataToJSON() in save.js. They never touch the DOM, so they
// can be tested with plain object literals.

// Sort by JSON encoding so ordering is total and depends on nothing but
// content. Comparing the encoded form also means nested arrays order
// consistently without a bespoke comparator per level.
function compareJSON(a, b) {
    const sa = JSON.stringify(a)
    const sb = JSON.stringify(b)
    if (sa < sb) {
        return -1
    }
    return sa > sb ? 1 : 0
}

// Hoisted out of reuseGroups so the comparator is not declared inside a loop,
// which jshint flags for the closure semantics it can imply.
function compareByTitleThenName(a, b) {
    return compareJSON([a.title, a.name], [b.title, b.name])
}

function compareGroups(a, b) {
    return compareByTitleThenName(a[0], b[0])
}

// Field types whose values are secrets. A record may have none of these, or
// several: reuse is a property of a (record, field) pair, not of a record.
const SECRET_TYPES = ['password']


/**
 * Reduce records to a canonical string whose value does not depend on order.
 *
 * Sorting is load-bearing. Two identical vaults serialised in different
 * orders must produce the same fingerprint — an unsorted comparison reports
 * a difference that is not there, which is exactly the false alarm this
 * feature exists to prevent.
 *
 * There is no delimiter to forge. An earlier version joined values with a
 * separator character, which meant a value containing that character could
 * make two different vaults canonicalize identically — the field value "a:b"
 * against a field named "p:a" with value "b", say. JSON encoding escapes and
 * quotes every element, so no value can manufacture a boundary.
 *
 * Metadata is excluded deliberately. `created` is stamped with the current
 * time by convertInternalDataToJSON() for any record that lacks one, so a
 * fingerprint covering it would change on every call. The question is
 * "same content?", not "same content and same save history?".
 *
 * @param {Array} records - records as produced by convertInternalDataToJSON.
 * @returns {string} canonical form, stable under reordering.
 */
export function canonicalizeRecords(records) {
    let entries = []
    for (const record of records) {
        let fields = []
        for (const field of record.fields) {
            fields.push([field.name, field.type, field.value])
        }
        // Field order within a record is presentation, not content.
        fields.sort(compareJSON)
        entries.push([record.title, Boolean(record.active), fields])
    }
    entries.sort(compareJSON)
    return JSON.stringify(entries)
}

/**
 * A short fingerprint of the vault's content, for comparing two vaults by eye.
 *
 * 64 bits shown as four groups. This is a comparison aid between vaults the
 * same person controls, not a security boundary — there is no adversary
 * choosing record contents to collide with yours. If that ever changes,
 * lengthen it.
 *
 * @param {Array} records - records as produced by convertInternalDataToJSON.
 * @returns {Promise<string>} e.g. "3f2a 91c4 0e88 d517"
 */
export async function vaultFingerprint(records) {
    const canonical = canonicalizeRecords(records)
    const bytes = new TextEncoder().encode(canonical)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hex = Array.from(new Uint8Array(digest))
        .slice(0, 8)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    return hex.match(/.{4}/g).join(' ')
}

/**
 * Every secret-bearing field in the vault, flattened.
 *
 * @param {Array} records - records as produced by convertInternalDataToJSON.
 * @returns {Array} [{title, name, value}]
 */
export function secretFields(records) {
    let out = []
    for (const record of records) {
        for (const field of record.fields) {
            if (SECRET_TYPES.includes(field.type) && field.value) {
                out.push({title: record.title, name: field.name, value: field.value})
            }
        }
    }
    return out
}

/**
 * Groups of fields that share a password.
 *
 * The password is the grouping key and is never returned. A caller can tell
 * the user that two entries collide without ever displaying the secret they
 * collide on.
 *
 * This is the check no breach corpus can perform and no per-password checker
 * can perform either: reuse is a property of the whole set. It also needs no
 * network, no corpus, and no privacy tradeoff.
 *
 * @param {Array} records - records as produced by convertInternalDataToJSON.
 * @returns {Array} [[{title, name}, ...], ...] — one array per shared password,
 *   each with two or more members. Sorted for stable display.
 */
export function reuseGroups(records) {
    let byValue = new Map()
    for (const field of secretFields(records)) {
        if (!byValue.has(field.value)) {
            byValue.set(field.value, [])
        }
        byValue.get(field.value).push({title: field.title, name: field.name})
    }
    let groups = []
    for (const members of byValue.values()) {
        if (members.length > 1) {
            members.sort(compareByTitleThenName)
            groups.push(members)
        }
    }
    groups.sort(compareGroups)
    return groups
}

/**
 * How many stored passwords are reused. The headline number.
 *
 * Counts fields, not groups: three entries sharing one password is three
 * reused passwords to fix, not one.
 *
 * @param {Array} records - records as produced by convertInternalDataToJSON.
 * @returns {number}
 */
export function reuseCount(records) {
    let total = 0
    for (const group of reuseGroups(records)) {
        total += group.length
    }
    return total
}
