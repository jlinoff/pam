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

export function toggleRawJSONDataEdit() {
    // do nothing for now
    let div = document.getElementById('x-edit-raw-data-div')
    if (!!div) {
        removeRawEditPage()
    } else {
        mkRawEditPage()
    }
}

function removeRawEditPage() {
    let div = document.getElementById('x-edit-raw-data-div')
    div.remove()

    let topSection = document.getElementById('top-section')
    if (!!topSection) {
        topSection.xStyle({display: 'block'})
    }

    let midSection = document.getElementById('mid-section')
    if (!!midSection) {
        midSection.xStyle({display: 'block'})
    }
}

function mkRawEditPage() {
    let topSection = document.getElementById('top-section')
    if (!!topSection) {
        topSection.xStyle({display: 'none'})
    }

    let midSection = document.getElementById('mid-section')
    if (!!midSection) {
        midSection.xStyle({display: 'none'})
    }

    let topDiv = xmk('div').xId('x-edit-raw-data-div')
        .xStyle({'padding-left':'1em',
                 'padding-top':'0',
                 'margin-top': '0'})
        .xAppend(
            xmk('p').xInnerHTML('edit page'),
            xmk('div').xStyle({'height': '80px'}) // for scrolling over footer
        )
    document.body.appendChild(topDiv)
}
