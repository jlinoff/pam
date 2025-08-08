// Print the records in plaintext top
/**
 * Print records in plaintext to allow users to store them
 * locally. This is not secure but it allows users to keep a hard
 * copy.
 */
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'

export function enableRawJSONEdit() {
    let button = document.getElementById('x-edit-raw-json-data')
    if (window.prefs.enableRawJSONEdit) {
        button.xStyle({'display': 'block'})
    } else {
        button.xStyle({'display': 'none'})
    }
}
