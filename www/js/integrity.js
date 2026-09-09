// Vault content integrity (PROPOSAL.md item 9a).
//
// A PAM file is encrypted with AES-CBC, which provides confidentiality and
// nothing else. There is no authentication tag, so a modified file decrypts to
// modified plaintext and nothing says so.
//
// This module writes a digest of the vault's content into meta.integrity at
// save time and checks it at load time. It is deliberately NOT a format
// change: loadFileContent() reads only meta['date-saved'], prefs and records,
// so an older version of PAM ignores the field and opens the file normally.
//
// Measured, because the value is easy to overstate and easy to dismiss:
//
//   - Random bit-flips across the whole ciphertext are caught 97.5% of the
//     time by AES-CBC padding or by JSON.parse rejecting garbled structure.
//     Only ~2.5% reach the digest. On that number alone this module looks
//     redundant.
//
//   - TARGETED flips do not behave that way. Corrupting a byte inside a long
//     text field changes a character without disturbing the JSON around it.
//     In a trial confined to the final blocks of a vault with a 600-character
//     note, 15 tampered files decrypted AND parsed as valid JSON. Every one
//     was caught by the digest, and every one would otherwise have loaded
//     silently as a valid vault with corrupted content.
//
//     An attacker does not flip bits at random. That second number is the one
//     that matters.
//
// What this gives, honestly:
//
//   - TAMPER EVIDENCE. Flipping bits in the ciphertext garbles an entire CBC
//     block; truncation drops blocks; substitution corrupts the block that
//     follows. All of them change the plaintext, and the digest catches it.
//
//   - AN ACCURATE DIAGNOSIS FOR A WRONG PASSWORD. Note the wording. A wrong
//     password was already *detected*: PKCS#7 padding fails about 255 times in
//     256, and the once it passes, JSON.parse rejects the garbage. What was
//     wrong is the MESSAGE — that last case reported "invalid record format",
//     blaming the file rather than the password. This module distinguishes
//     them.
//
// What it does NOT give:
//
//   - AUTHENTICATED ENCRYPTION. The digest is verified after decrypting, not
//     before. See item 9b.
//   - ROLLBACK PROTECTION. An attacker who replaces the current vault with a
//     legitimate older copy passes this check, because the old file's digest
//     was correct when it was written. Detecting that needs a version counter
//     or state held outside the file, and neither 9a nor 9b provides one.
//
// No imports on purpose, matching breach.js: this runs on the load path, where
// a helper that reads window.prefs would throw if preferences were not yet
// initialised.

export const DIGEST_PREFIX = 'sha256:'

// Verification outcomes. Distinct values rather than a boolean because the
// three cases call for different responses, and collapsing them is how a
// missing digest ends up reported as a failed one.
export const INTEGRITY_OK = 'INTEGRITY_OK'
export const INTEGRITY_ABSENT = 'INTEGRITY_ABSENT'
export const INTEGRITY_FAILED = 'INTEGRITY_FAILED'

/**
 * Serialise a value with object keys in sorted order.
 *
 * JSON.stringify preserves insertion order, so two structurally identical
 * vaults could serialise differently and produce different digests. Sorting
 * makes the digest depend on content alone.
 *
 * Arrays keep their order: record order and field order are content here, even
 * though vaultFingerprint() deliberately ignores them. The two answer different
 * questions — the fingerprint asks "same vault?", this asks "same bytes?".
 *
 * @param {*} value
 * @returns {string} deterministic JSON
 */
export function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']'
    }
    const keys = Object.keys(value).sort()
    const parts = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
    return '{' + parts.join(',') + '}'
}

/**
 * Digest of the parts of a vault worth protecting.
 *
 * Covers records and prefs. It deliberately does NOT cover meta: meta holds
 * the digest itself, so including it would be circular, and its other field —
 * date-saved — changes on every save without the content changing.
 *
 * @param {Array} records
 * @param {Object} prefs
 * @returns {Promise<string>} "sha256:" followed by lowercase hex
 */
export async function contentDigest(records, prefs) {
    const payload = stableStringify({records: records || [], prefs: prefs || {}})
    const bytes = new TextEncoder().encode(payload)
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    const hex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return DIGEST_PREFIX + hex
}

/**
 * Check a parsed vault against its recorded digest.
 *
 * Returns ABSENT rather than failing when there is no digest. Files written
 * before this existed are legitimate and must keep opening without complaint;
 * treating a missing digest as tampering would reject every older vault.
 *
 * That does mean an attacker can strip the field to silence the check. Nothing
 * within a non-breaking change can prevent it — the digest lives inside the
 * plaintext, so anyone able to rewrite the file could omit it. It is the
 * honest limit of doing this without an authenticated format, and it is one
 * reason 9b still has an argument.
 *
 * @param {Object} json - the parsed vault
 * @returns {Promise<Object>} {status, expected, actual}
 */
export async function verifyIntegrity(json) {
    const recorded = json && json.meta ? json.meta.integrity : undefined
    if (!recorded) {
        return {status: INTEGRITY_ABSENT, expected: null, actual: null}
    }
    const actual = await contentDigest(json.records, json.prefs)
    if (actual === recorded) {
        return {status: INTEGRITY_OK, expected: recorded, actual: actual}
    }
    return {status: INTEGRITY_FAILED, expected: recorded, actual: actual}
}
