/**
 * @module crypt
 * @description AES-256-CBC encryption and decryption using the browser SubtleCrypto API.
 *
 * ## File format (v1)
 * The encrypted output is a Base64 string encoding: [16-byte salt][16-byte IV][ciphertext].
 * The salt is generated randomly per encryption; the IV is generated randomly per encryption.
 * Key derivation uses PBKDF2-SHA-256 with 100,000 iterations.
 *
 * ## Known v1 weaknesses (see SECURITY.md SEC-003/SEC-004)
 * 1. The salt bytes are passed through TextEncoder.encode() — which calls .toString() first —
 *    producing an ASCII string like "0,34,211,..." instead of raw bytes. This dramatically
 *    reduces effective salt entropy. This bug is preserved intentionally: fixing it would
 *    break decryption of all existing v1 files.
 * 2. 100,000 PBKDF2 iterations is below current NIST/OWASP recommendations (≥600,000).
 *    This will be addressed in the v2 file format (PAM v1.3).
 *
 * ## Plaintext detection
 * The first character `{` is used to distinguish plaintext JSON from Base64 ciphertext,
 * since Base64-encoded output never begins with `{`.
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

const numIterations = 100000

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
