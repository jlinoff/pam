/**
 * @module crypt
 * @description AES-256-CBC encryption and decryption using the browser SubtleCrypto API.
 * Supports two file format versions with automatic detection on decrypt.
 *
 * ## v1 format (legacy — PAM < 1.3)
 * Raw Base64 string: [16-byte salt][16-byte IV][ciphertext].
 * Key derivation: PBKDF2-SHA-256, 100,000 iterations.
 * Known weaknesses (preserved intentionally — fixing would break existing files):
 *   1. Salt entropy bug: salt bytes passed through TextEncoder.encode() which calls
 *      .toString() first, producing "0,34,211,..." ASCII instead of raw bytes.
 *   2. Low iteration count: 100,000 is below NIST SP 800-132 / OWASP recommendation (≥600,000).
 *
 * ## v2 format (PAM 1.3+)
 * Prefixed Base64 string: "PAMv2:" + Base64([16-byte salt][16-byte IV][ciphertext]).
 * Key derivation: PBKDF2-SHA-256, 600,000 iterations, raw salt bytes (no TextEncoder bug).
 * The "PAMv2:" prefix enables unambiguous format detection.
 *
 * ## Format detection
 * - Starts with "PAMv2:" → v2 decrypt path
 * - Starts with "{" → plaintext JSON (no decryption needed)
 * - Anything else → v1 decrypt path (legacy)
 */
import { statusBlip } from './status.js'
import { clog } from './utils.js'

// https://stackoverflow.com/questions/40031688/javascript-arraybuffer-to-hex
function buf2hex(buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
}

// https://dev.to/halan/4-ways-of-symmetric-cryptography-and-javascript-how-to-aes-with-javascript-3o1b
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const numIterations = 100000     // v1 — preserved exactly, do not change
const numIterationsV2 = 600000  // v2 — NIST SP 800-132 / OWASP 2023 recommendation
const V2_PREFIX = 'PAMv2:'      // v2 file format prefix

const toBase64 = buffer => {
    // handle very large buffers
    let raw = ''
    let bytes = new Uint8Array(buffer)
    let len = bytes.length
    for (let i=0; i < len ; i++) {
        raw += String.fromCharCode( bytes[ i ] )
    }
    let binstr = btoa(raw)
    return binstr
    // The following call is subject to limitations based on the
    // maximum number of function arguments.
}
const fromBase64 = buffer => {
    try {
        return Uint8Array.from(atob(buffer), c => c.charCodeAt(0))
    } catch (e) {
        alert(`ERROR: decryption conversion failed!\n${e}`)
    }
}

const PBKDF2 = async (password, salt, iterations, length, hash, algorithm = 'AES-CBC') => {
        let keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            {name: 'PBKDF2'},
            false,
            ['deriveKey']
        );
        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations,
                hash
            },
            keyMaterial,
            { name: algorithm, length },
            false, // we don't need to export our key!!!
            ['encrypt', 'decrypt']
        );
    }

/**
 * Encrypt plaintext JSON using AES-256-CBC.
 *
 * This function is asynchronous — the result is delivered via callback, not returned.
 * Callers must not assume the callback fires synchronously.
 *
 * Edge cases (all handled, all deliver exactly one callback invocation):
 * - Empty plaintext: callback(plaintext, filename) immediately, no encryption.
 * - Empty password + non-JSON plaintext: assumed already encrypted; callback as-is.
 * - Empty password + JSON plaintext: written out as plaintext (no encryption).
 * - Non-secure context (HTTP): encryption is disabled; status message shown.
 *
 * @param {string} password - The master password. Empty string means no encryption.
 * @param {string} plaintext - The UTF-8 JSON string to encrypt.
 * @param {string} filename - The target filename, passed through to the callback unchanged.
 * @param {function(string, string): void} callback - Called with (ciphertext, filename)
 *   on success. On failure, logs the error and does not invoke the callback.
 */
export function encrypt(password, plaintext, filename, callback) {
    if (!plaintext || plaintext.length === 0) {
        callback(plaintext, filename)
        return
    }
    if (!password || password.length === 0) {
        if (plaintext[0] !== '{') {
            callback(plaintext, filename) // already encrypted, encrypt again
            return
        }
        callback(plaintext, filename) // write out in plaintext
        return
    }
    let ciphertext = plaintext
    if (window.isSecureContext) {
        statusBlip(`encrypting ${plaintext.length}B...`)
        // https://dev.to/halan/4-ways-of-symmetric-cryptography-and-javascript-how-to-aes-with-javascript-3o1b
        const iv = window.crypto.getRandomValues(new Uint8Array(16))
        const salt = window.crypto.getRandomValues(new Uint8Array(16))
        const encoded_plaintext = encoder.encode(plaintext)
        PBKDF2(password, salt, numIterations, 256, 'SHA-256')
            .then( (key) => {
                window.crypto.subtle.encrypt(
                    {name: 'AES-CBC', iv: iv }, key, encoded_plaintext)
                    .then( (encrypted) => {
                        ciphertext = toBase64([...salt, ...iv, ...new Uint8Array(encrypted)])
                        statusBlip(`encrypted ${plaintext.length}B -> ${ciphertext.length}B ...`)
                        callback(ciphertext, filename)
                    })
                    .catch( (error) => {
                        clog(error)
                    })
            })
            .catch((error) => {
                clog(error)
            })
    } else {
        statusBlip('encryption not enabled')
    }
}

/**
 * Decrypt AES-256-CBC ciphertext produced by encrypt().
 *
 * This function is asynchronous — the result is delivered via callbacks, not returned.
 *
 * Edge cases (all handled, all deliver exactly one callback invocation):
 * - Empty ciphertext: callback(ciphertext) immediately.
 * - Empty password + JSON ciphertext (starts with `{`): assumed already decrypted; callback as-is.
 * - Empty password + non-JSON ciphertext: cannot decrypt without a password; callback2 called.
 *
 * @param {string} password - The master password used during encryption.
 * @param {string} ciphertext - Base64-encoded ciphertext from encrypt(), or plain JSON.
 * @param {function(string): void} callback - Called with the decrypted plaintext on success.
 * @param {function(string): void} callback2 - Called with an error message string on failure.
 */
export function decrypt(password, ciphertext, callback, callback2) {
    if (!ciphertext || ciphertext.length === 0) {
        callback(ciphertext)
        return
    }
    if (!password || password.length === 0) {
        if (ciphertext[0] === '{') {
            callback(ciphertext) // already decrypted
            return
        }
        // It is encrypted, we MUST have a password
        callback2('No password specified\nPlease specify the password and try again')
        return
    }
    let plaintext = ciphertext

    // Dispatch: v2 files have PAMv2: prefix; everything else uses v1 path
    if (ciphertext.startsWith(V2_PREFIX)) {
        decryptV2(password, ciphertext, callback, callback2)
        return
    }

    if (window.isSecureContext) {
        statusBlip(`decrypting ${ciphertext.length}B...`)
        const salt_len = 16
        const iv_len = 16
        const encrypted = fromBase64(ciphertext)
        const salt = encrypted.slice(0, salt_len)
        const iv = encrypted.slice(0+salt_len, salt_len+iv_len)
        const data = encrypted.slice(salt_len + iv_len)
        PBKDF2(password, salt, numIterations, 256, 'SHA-256')
            .then( (key) => {
                window.crypto.subtle.decrypt(
                    {name: 'AES-CBC', iv: iv }, key, data)
                    .then( (decrypted) => {
                        const base64 = decoder.decode(decrypted)
                        if (base64[0] === '{' ) {
                            plaintext = base64
                        } else {
                            plaintext = fromBase64(base64)
                        }
                        statusBlip(`decrypted ${ciphertext.length}B -> ${plaintext.length}B ...`)
                        callback(plaintext)
                    })
                    .catch( (error) => {
                        callback2(`Decryption failed!\nPlease try another password.\n${error}`)
                        clog(error)
                    })
            })
            .catch((error) => {
                callback2(`Decryption setup failed!\nPlease try another password.\n${error}`)
            })
        statusBlip(`decrypted ${ciphertext.length}B -> ${plaintext.length}B ...`)
    } else {
        statusBlip('decryption not enabled')
    }
}


/**
 * Encrypt plaintext JSON using the v2 format (AES-256-CBC, 600k PBKDF2 iterations,
 * raw salt bytes, PAMv2: prefix).
 *
 * @param {string} password - The master password.
 * @param {string} plaintext - The UTF-8 JSON string to encrypt.
 * @param {string} filename - Passed through to the callback unchanged.
 * @param {function(string, string): void} callback - Called with (ciphertext, filename).
 */
export function encryptV2(password, plaintext, filename, callback) {
    if (!plaintext || plaintext.length === 0) {
        callback(plaintext, filename)
        return
    }
    if (!password || password.length === 0) {
        if (plaintext[0] !== '{') {
            callback(plaintext, filename)
            return
        }
        callback(plaintext, filename)
        return
    }
    if (window.isSecureContext) {
        statusBlip(`encrypting (v2) ${plaintext.length}B...`)
        const iv = window.crypto.getRandomValues(new Uint8Array(16))
        const salt = window.crypto.getRandomValues(new Uint8Array(16))
        const encoded_plaintext = encoder.encode(plaintext)
        // v2: pass raw salt bytes directly — no TextEncoder bug
        window.crypto.subtle.importKey(
            'raw', encoder.encode(password), {name: 'PBKDF2'}, false, ['deriveKey']
        ).then((keyMaterial) => {
            window.crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: salt, iterations: numIterationsV2, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-CBC', length: 256 },
                false,
                ['encrypt', 'decrypt']
            ).then((key) => {
                window.crypto.subtle.encrypt(
                    {name: 'AES-CBC', iv: iv}, key, encoded_plaintext
                ).then((encrypted) => {
                    const ciphertext = V2_PREFIX + toBase64([...salt, ...iv, ...new Uint8Array(encrypted)])
                    statusBlip(`encrypted (v2) ${plaintext.length}B -> ${ciphertext.length}B`)
                    callback(ciphertext, filename)
                }).catch((error) => { clog(error) })
            }).catch((error) => { clog(error) })
        }).catch((error) => { clog(error) })
    } else {
        statusBlip('encryption not enabled')
    }
}

/**
 * Decrypt v2 format ciphertext (requires PAMv2: prefix).
 * Rejects anything without the PAMv2: prefix — use decrypt() for unified dispatch.
 *
 * @param {string} password - The master password.
 * @param {string} ciphertext - Must start with "PAMv2:".
 * @param {function(string): void} callback - Called with plaintext on success.
 * @param {function(string): void} callback2 - Called with error message on failure.
 */
export function decryptV2(password, ciphertext, callback, callback2) {
    if (!ciphertext || !ciphertext.startsWith(V2_PREFIX)) {
        callback2('Not a v2 file: missing PAMv2: prefix')
        return
    }
    if (!password || password.length === 0) {
        callback2('No password specified\nPlease specify the password and try again')
        return
    }
    if (window.isSecureContext) {
        statusBlip(`decrypting (v2) ${ciphertext.length}B...`)
        const b64 = ciphertext.slice(V2_PREFIX.length)
        const encrypted = fromBase64(b64)
        const salt = encrypted.slice(0, 16)
        const iv = encrypted.slice(16, 32)
        const data = encrypted.slice(32)
        // v2: use raw salt bytes directly
        window.crypto.subtle.importKey(
            'raw', encoder.encode(password), {name: 'PBKDF2'}, false, ['deriveKey']
        ).then((keyMaterial) => {
            window.crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: salt, iterations: numIterationsV2, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-CBC', length: 256 },
                false,
                ['encrypt', 'decrypt']
            ).then((key) => {
                window.crypto.subtle.decrypt(
                    {name: 'AES-CBC', iv: iv}, key, data
                ).then((decrypted) => {
                    const plaintext = decoder.decode(decrypted)
                    statusBlip(`decrypted (v2) ${ciphertext.length}B -> ${plaintext.length}B`)
                    callback(plaintext)
                }).catch((error) => {
                    callback2(`Decryption failed!\nPlease try another password.\n${error}`)
                })
            }).catch((error) => {
                callback2(`Decryption setup failed!\nPlease try another password.\n${error}`)
            })
        }).catch((error) => {
            callback2(`Key import failed!\n${error}`)
        })
    } else {
        statusBlip('decryption not enabled')
    }
}
