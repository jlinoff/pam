// Print the records in plaintext top
/**
 * Print records in plaintext to allow users to store them
 * locally. This is not secure but it allows users to keep a hard
 * copy.
 */
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { convertInternalDataToJSON } from './save.js'

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

    let contents = {
        'prefs': {},
        'records': [],
    }
    let now = new Date().toISOString()
    convertInternalDataToJSON(contents, now)
    let text = JSON.stringify(contents, null, 4)
    let numRows = text.split('\n').length
    if (numRows > 40) {
        numRows = 40
    }
    let textarea = xmk('textarea')
        .xId('x-edit-raw-data-textarea')
        .xAttr('rows', numRows)
        .xStyle({'width': '100%',
                 'box-sizing': 'border-box',
                 'margin': '0',
                 'padding': '5px'})
    textarea.value = text

    let topDiv = xmk('div').xId('x-edit-raw-data-div')
        .xStyle({'padding-left':'1em',
                 'padding-right': '1em',
                 'padding-top':'0',
                 'margin-top': '0'})
        .xAppend(
            //xmk('p').xInnerHTML(text),
            textarea,
            xmk('button')
                .xClass('btn', 'btn-secondary', 'm-2')
                .xAttrs({'title': 'save changes'})
                .xInnerHTML('Save')
                .xAddEventListener('click', (event) => { /* jshint ignore:line */
                    alert('save data placeholder')
                }),
            xmk('div').xStyle({'height': '80px'}) // for scrolling over footer
        )
    document.body.appendChild(topDiv)
}
