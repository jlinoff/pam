// Password generation utilities.
import { xmk } from './lib.js'
import { statusBlip } from './status.js'
import { words } from './en_words.js'
import { icon } from './utils.js'

export const ALPHA_LOWER = "abcdefghijklmnopqrstuvwxyz"
export const ALPHA_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
export const DEC_DIGITS = "0123456789"
export const HEX_DIGITS = "0123456789abcdef"
export const SPECIAL = "_-+!./#$%^"
export const ALPHABET = ALPHA_LOWER + ALPHA_UPPER + DEC_DIGITS + SPECIAL

// generate a cryptic password
// length - is the length for the resulting password
// alphabet - is the array of characters to use
export function getCrypticPassword(length, alphabet) {
    // Define the array and initially load it with random values.
    let array = new Uint8Array(length) // length of the desired password
    // https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
    crypto.getRandomValues(array) // load with random values.
    let result = ''
    for (let i=0; i < array.length; i++) {
        // pick a random character from the alphabet
        result += alphabet.charAt(array[i] % alphabet.length);
    }
    return result;
}

export function getRandomWord(minlen, maxlen) {
    var i = Math.floor(Math.random() * words.length);
    var tries = 0
    let maxtries = 1000
    var word = words[i]
    while (tries < maxtries && (word.length < minlen || word.length > maxlen)) {
        i = Math.floor(Math.random() * words.length)
        word = words[i]
        tries += 1
    }
    if (tries >= maxtries) {
        let msg = `ERROR: tries exceeded threshold of ${maxtries} in maxtries(${minlen},${maxlen})`
        console.log(msg)
        statusBlip(msg)
        word = '?'
    }
    return word
}

export function getMemorablePassword(length) {
    let tries = 0
    let sep = window.prefs.memorablePasswordWordSeparator
    let minlen = window.prefs.memorablePasswordMinWordLength
    let maxlen = length
    let numwords = 0
    let maxwords = window.prefs.memorablePasswordMaxWords
    let minwords = window.prefs.memorablePasswordMinWords
    let maxtries = window.prefs.memorablePasswordMaxTries
    let result = ''
    while (result.length !== length && tries < maxtries) {
        result = window.prefs.memorablePasswordPrefix
        numwords = 0
        while (result.length < (length - window.prefs.memorablePasswordSuffix.length)) {
            numwords += 1
            let word = getRandomWord(minlen, maxlen)
            if (numwords > 1) {
                result += sep
            }
            result += word
            if (numwords > maxwords) {
                break
            }
        }
        result += window.prefs.memorablePasswordSuffix
        tries += 1
        if (numwords > maxwords || numwords < minwords) {
            result = '' // failed
        }
    }
    if (tries >= maxtries) {
        console.log('ERROR: tries exceeded threshold')
        result = '???' + getCrypticPassword(length, HEX_DIGITS)
    }
    if (result.length !== length) {
        console.log('ERROR: tries exceeded threshold', result.length)
        result = '???' + getCrypticPassword(length, HEX_DIGITS)
    }
    return result
}

function saveGeneratedPassword(event) {
    event.preventDefault() // very important
    let row = event.target.xGetParentWithClass('row')
    let e2 = row.xGet('.x-fld-value') // field value input
    let e1 = row.parentElement.xGet('.x-fld-value-length') // span
    //console.log('row', row)
    //console.log('x-fld-value', e1)
    //console.log('x-fld-value-length', e2)
    e2.value = event.target.innerHTML
    e1.innerHTML = event.target.innerHTML.length
}

// make the generate password dialogue for record fields and
// reuse it if it already exists
export function mkGeneratePasswordDlg(event) {
    let button = event.target.parentElement
    let row = button.xGetParentWithClass('row')
    let passwordInput = row.xGet('.x-fld-value')
    // has it already been created?
    let genSection = row.xGet('.x-fld-pw-gen')
    if (!genSection) {
        // Create the generation section and add it.
        //let topdiv = row.xGet('fieldset')
        let topdiv = row.xGet('.x-fld-value-div')
        let len = 20
        let cp0 = getCrypticPassword(len, ALPHABET)
        let num = 5 // number of memorable passwords
        let mbs = []
        // Create the memorable password buttons.
        for (let i=0; i<num; i++) {
            const pwd = getMemorablePassword(len)
            const rowElement = row
            let button = xmk('button')
                .xClass('btn', 'btn-secondary', 'x-fld-pw-mp', 'm-2', 'font-monospace')
                .xAttrs({'title': 'click to save this memorable password'})
                .xInnerHTML(pwd)
                .xAddEventListener('click', (event) => {
                    saveGeneratedPassword(event)
                })
            mbs.push(button)
        }
        topdiv.xAppend(
            // Close button.
            xmk('div').xClass('col-12', 'x-fld-pw-gen', 'mt-1').xAppend(
                xmk('hr'),
                xmk('button')
                    .xClass('btn', 'btn-small', 'w-100')
                    .xAppend(
                        icon('bi-x-circle', 'close the section'),
                        xmk('span').xInnerHTML('&nbsp;Close Password Generator'))
                    .xAddEventListener('click', (event) => {
                        event.preventDefault() // very important
                        let row = button.xGetParentWithClass('row')
                        //console.log(row)
                        row.xGetN('.x-fld-pw-gen').forEach( (col) => {
                            col.classList.add('d-none')
                        })
                    }),
            ),
            // Cryptic and memorable password buttons.
            xmk('div').xClass('col-auto', 'x-fld-pw-gen').xAppend(
                xmk('p').xClass('m-1', 'fs-3').xInnerHTML('Password Generator'),
                xmk('p').xClass('m-1', 'fs-6').xInnerHTML('Click on the generated password to select it. ' +
                                                          'Click the Generate button or use the length slider ' +
                                                          'to generate new passwords.'),
                xmk('p').xClass('m-1', 'fs-5').xInnerHTML('Cryptic Password'),
                xmk('button')
                    .xClass('btn', 'btn-secondary', 'x-fld-pw-cp0', 'm-2', 'font-monospace')
                    .xAttrs({'title': 'click to save cryptic password'})
                    .xInnerHTML(cp0)
                    .xAddEventListener('click', (event) => {
                        saveGeneratedPassword(event)
                    }),
                xmk('p').xClass('fs-5').xInnerHTML('Memorable Passwords'),
                ...mbs,
            ),
            // Password length using range value.
            xmk('div').xClass('col-auto', 'x-fld-pw-gen').xAppend(
                xmk('span').xClass('fs-5').xInnerHTML('Length&nbsp;'),
                xmk('input')
                    .xClass('form-range', 'w-50')
                    .xAttrs({'type': 'range',
                             'value': len,
                             'title': 'password length',
                             'min': window.prefs.passwordRangeMinLength,
                             'max': window.prefs.passwordRangeMaxLength,
                            })
                    .xAddEventListener('focus', (event) => {
                        // Allow text to be selected in a draggable parent.
                        // Disable dragging.
                        let row = event.target.xGetParentWithClass('x-new-rec-fld')
                        row.setAttribute('draggable', false)
                    })
                    .xAddEventListener('blur', (event) => {
                        // Allow text to be selected in a draggable parent.
                        // Re-enable dragging.
                        let row = event.target.xGetParentWithClass('x-new-rec-fld')
                        row.setAttribute('draggable', true)
                    })
                    .xAddEventListener('input', (event) => {
                        //console.log(event.target.value)
                        let rlen = event.target.parentElement.xGet('.x-fld-pw-range-len')
                        let len = parseInt(event.target.value)
                        let row = button.xGetParentWithClass('row')
                        rlen.xInnerHTML(len)
                        row.xGet('.x-fld-pw-cp0').innerHTML = getCrypticPassword(len, ALPHABET)
                        row.xGetN('.x-fld-pw-mp').forEach( (e) => {
                            //console.log(e)
                            //console.log(len)
                            let pwd = getMemorablePassword(len)
                            //console.log(pwd)
                            e.innerHTML = pwd
                        })
                    }),
                xmk('span').xClass('fs-5').xInnerHTML('&nbsp;'),
                xmk('span').xClass('x-fld-pw-range-len', 'fs-5')
                    .xInnerHTML(window.prefs.passwordRangeLengthDefault)
            ),
            //xmk('hr'),
        )
    } else {
        // password dialogue already exists
        let row = button.xGetParentWithClass('row')
        //console.log(row)
        let range = row.xGet('.x-fld-pw-range-len')
        let len = parseInt(range.innerHTML)
        let cp0Value = getCrypticPassword(len, ALPHABET)
        let cp0Button = row.xGet('.x-fld-pw-cp0')
        cp0Button.innerHTML = cp0Value
        row.xGetN('.x-fld-pw-mp').forEach( (e) => {
            e.innerHTML = getMemorablePassword(len)
        })

        // toggle visibility
        let cols = row.xGetN('.x-fld-pw-gen')
        if (cols[0].classList.contains('d-none')) {
            cols.forEach((col) => {
                col.classList.remove('d-none')
                //console.log(col)
            })
        }
    }
}

// Make load/save password with clear and show/hide.
export function mkLoadSavePassword(xid) {
    return xmk('div').xClass('input-group').xAppend(
        xmk('input')
            .xId(xid)
            .xClass('form-control', 'x-fld-value', 'ps-1')
            .xAttrs({
                'type': 'password',
                'autocomplete': 'new-password',
                'value': getFilePass(),
            }),
        xmk('span').xClass('input-group-append').xAppend(
            xmk('button')
                .xClass('btn', 'btn-lg', 'px-0', 'ms-2')
                .xAttr('type', 'button')
                .xAddEventListener('click', (event) => {
                    let row = event.target.xGetParentWithClass('row')
                    row.xGet('input').value = ''
                })
                .xAppend(
                    icon('bi-x-circle', 'delete password')
                ),
            xmk('button')
                .xClass('btn', 'btn-lg', 'px-0', 'ms-2')
                .xAttr('type', 'button')
                .xAddEventListener('click', (event) => {
                    let button = event.target.parentElement
                    let row = event.target.xGetParentWithClass('row')
                    let input = row.xGet('input')
                    let icon = button.xGet('i')
                    let show = icon.classList.contains('bi-eye')
                    if (show) {
                        icon.classList.remove('bi-eye')
                        icon.classList.add('bi-eye-slash')
                        input.xAttr('type', 'text')
                    } else {
                        icon.classList.remove('bi-eye-slash')
                        icon.classList.add('bi-eye')
                        input.xAttr('type', 'password')
                    }
                })
                .xAppend(
                    icon('bi-eye', 'show/hide password name')
                ),
        ),
    )
}

// Put the password into local or session storage
export function setFilePass(password) {
    switch (window.prefs.filePassCache) {
    case 'none':
        window.prefs.filePass = ''
        break
    case 'global':
        window.prefs.filePass = password
        break
    case 'local':
        localStorage.setItem('filePass', password)
        break
    case 'session':
        sessionStorage.setItem('filePass', password)
        break
    default:
        console.log('ERROR: internal error, invalid value')
        break
    }
}

// Get the password from local or session storage
export function getFilePass() {
    switch (window.prefs.filePassCache) {
    case 'none':
        return ''
        break
    case 'global':
        return window.prefs.filePass
        break
    case 'local':
        return localStorage.getItem('filePass')
        break
    case 'session':
        return sessionStorage.getItem('filePass')
        break
    default:
        console.log('ERROR: internal error, invalid value')
        break
    }
}
