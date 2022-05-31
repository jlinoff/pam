// Encypt/decrypt using SubtleCrypto
import { statusBlip } from './status.js'

// https://stackoverflow.com/questions/40031688/javascript-arraybuffer-to-hex
function buf2hex(buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
}

// https://dev.to/halan/4-ways-of-symmetric-cryptography-and-javascript-how-to-aes-with-javascript-3o1b
const encoder = new TextEncoder()
const decoder = new TextDecoder();

const toBase64 = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)))
const fromBase64 = buffer => Uint8Array.from(atob(buffer), c => c.charCodeAt(0))

const PBKDF2 = async (password, salt, iterations, length, hash, algorithm =  'AES-CBC') => {
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

// Encrypt plaintext
export function encrypt(password, plaintext, filename, callback) {
    if (!plaintext || plaintext.length === 0) {
        callback(plaintext, filename)
    }
    if (!password || password.length === 0) {
        if (plaintext[0] !== '{') {
            callback(plaintext, filename) // already encrypted
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
        PBKDF2(password, salt, 100000, 256, 'SHA-256')
            .then( (key) => {
                console.log('key', key)
                window.crypto.subtle.encrypt(
                    {name: 'AES-CBC', iv: iv }, key, encoded_plaintext)
                    .then( (encrypted) => {
                        console.log('encrypted', encrypted)
                        //ciphertext = buf2hex(encrypted)
                        ciphertext = toBase64([...salt, ...iv, ...new Uint8Array(encrypted)])
                        statusBlip(`encrypted ${plaintext.length}B -> ${ciphertext.length}B ...`)
                        callback(ciphertext, filename)
                    })
                    .catch( (error) => {
                        console.log(error)
                    })
            })
            .catch((error) => {
                console.log(error)
            })
    } else {
        statusBlip('encryption not enabled')
    }
}

// Decrypt ciphertext.
export function decrypt(password, ciphertext, callback, callback2) {
    if (!ciphertext || ciphertext.length === 0) {
        callback(ciphertext)
    }
    if (!password || password.length === 0) {
        if (ciphertext[0] === '{') {
            callback(ciphertext) // already decrypted
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
        PBKDF2(password, salt, 100000, 256, 'SHA-256')
            .then( (key) => {
                console.log('key', key)
                window.crypto.subtle.decrypt(
                    {name: 'AES-CBC', iv: iv }, key, data)
                    .then( (decrypted) => {
                        console.log('decrypted', decrypted)
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
                        console.log(error)
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
