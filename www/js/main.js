/**
 * The main entry point for the application.
 * @module main
 */
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { statusBlip } from './status.js'
import { words } from './en_words.js'
import { icon, setDarkLightTheme } from './utils.js'
import { initPrefs, addDefaultRecordFields } from './prefs.js'
import { mkMenu } from './menu.js'
import { mkSearchInputElement, searchRecords } from './search.js'
import { refreshAbout } from './about.js'
import { showMainPasswordGeneratorDlg } from './password.js'
import { toggleRawJSONDataEdit } from './raw.js'
import { enablePrinting } from './print.js'
import { enableSaveFile } from './save.js'
import { enableRawJSONEdit } from './raw.js'

/**
 * Actions to take when the window is loaded.
 * @global
 */
window.onload = () => { main() }
window.onresize = () => { refreshAbout() }

/**
 * Main entry point for the application.
 */
// Update the HTML rendering indicator in the toolbar.
// Call this whenever window.prefs.allowHtmlFieldRendering changes.
export function updateHtmlRenderingIndicator() {
    let indicator = document.getElementById('x-html-rendering-indicator')
    if (indicator) {
        indicator.style.display = window.prefs.allowHtmlFieldRendering ? 'inline' : 'none'
    }
}

export function updateFilePassCacheIndicator() {
    let indicator = document.getElementById('x-filepass-cache-indicator')
    if (indicator) {
        indicator.style.display = window.prefs.filePassCache === 'local' ? 'inline' : 'none'
    }
}

export function main() {
    // Enable the extra "x" prototype functions for elements.
    enableFunctionChaining()
    initPrefs()  // sets window.prefs
    initialize() // requires window.prefs
    adjust()
    initPrefs()
    setDarkLightTheme(window.prefs.themeName)
    //setTimeout(() => {adjust()}, 1000)
    enablePrinting()
    enableSaveFile()
    enableRawJSONEdit()
    addDefaultRecordFields()
    updateHtmlRenderingIndicator()   // SEC-001: show badge if enabled at startup
    updateFilePassCacheIndicator()   // SEC-002: show badge if local at startup
    const secure = window.isSecureContext? '(secure)' : ''
    statusBlip(`initializing PAM... ${secure} ${window.screen.width}x${window.screen.height}`)
}

function adjust() {
    // Hack to adjust the alignment of the top and middle sections
    // i could not get it to work usig bootstrap 5 classes!
    let top = xget('#top-section')
    let mid = xget('#mid-section')
    let ct = window.getComputedStyle(top);
    let cm = window.getComputedStyle(mid);
    //mid.style.marginTop = ct.height  // first try
    mid.style.marginTop = ct.fontSize  // this worked!
}

function initialize() {
    topLayout()
}

// This is a decent start for
//
// +----------------------------------------------------------------+
// |                             header                             |
// +----------------------------------------------------------------+
// | content                                                        |
// +----------------------------------------------------------------+
// |                             footer                             |
// +----------------------------------------------------------------+
//
function topLayout() {
    let lines = ''
    for (let i=1; i<=50; i++) {
        lines += `line ${i}<br />`
    }
    document.body
        .xAttr('data-bs-theme', 'dark')
        .xAppendChild(
            xmk('header')
                .xId('top-section')
                .xClass('fixed-top',
                        'border',
                        'p-2',
                        'fs-5',
                        'text-center',
                        'bg-light',  // because it needs to be opaque to hide the overflow
                       )
                .xAppendChild(createSearchInputAndMenuEntry()),
            xmk('div')
                .xId('mid-section')
                .xClass('h-100',
                        //'border', 'border-2', 'border-danger', // debugging
                        'overflow-auto',
                        'pt-5',
                        'pb-5',
                        'p-2',
                       )
                .xAppend( xmk('div').xClass('accordion').xId('records-accordion') ),
            xmk('footer')
                .xClass('fixed-bottom',
                        'border',
                        'p-2',
                        'fs-5',
                        'text-left',
                        'text-info',
                        'bg-light',  // because it needs to be opaque to hide the overflow
                       )
                .xAppend(
                    xmk('button')
                        .xId('x-dark-mode-button')
                        .xClass('btn')
                        .xAttrs({'title': 'set dark mode'})
                        .xAppend(icon('bi-moon', 'set dark mode'))  // in light mode
                        .xAddEventListener('click', (event) => {
                            setDarkLightTheme('dark')
                        }),
                    xmk('button')
                        .xId('x-light-mode-button')
                        .xClass('btn')
                        .xAttrs({'title': 'set light mode'})
                        .xAppend(icon('bi-sun', 'set light mode'))  // in dark mode
                        .xAddEventListener('click', (event) => {
                            setDarkLightTheme('light')
                        }),
                    xmk('span')
                        .xId('status')
                        .xStyle({'width': '80%'})
                        .xAttrs({'title': 'dynamic status messages appear here'}),
                    xmk('span')
                        .xId('x-html-rendering-indicator')
                        .xClass('badge', 'bg-warning', 'text-dark', 'ms-2')
                        .xStyle({'display': 'none'})
                        .xAttrs({'title': 'HTML field rendering is ENABLED — only use with trusted files (SEC-001)'})
                        .xInnerHTML('&#x26A0; HTML ON'),
                    xmk('span')
                        .xId('x-filepass-cache-indicator')
                        .xClass('badge', 'bg-warning', 'text-dark', 'ms-2')
                        .xStyle({'display': 'none'})
                        .xAttrs({'title': 'File password is cached in localStorage — clears only when explicitly reset (SEC-002)'})
                        .xInnerHTML('&#x26A0; PASS: LOCAL'),
                    xmk('button')
                        .xId('x-generate-password')
                        .xClass('btn')
                        .xStyle({'float': 'right', 'margin-right': '1em'})
                        .xAttrs({'title': 'Open Password Generator'})
                        .xAppend(
                            icon('bi-stars', 'password generator'),
                            xmk('span').xInnerHTML('&nbsp;Pwd Gen'))
                        .xAddEventListener('click', (event) => {showMainPasswordGeneratorDlg()}),
                    xmk('button')
                        .xId('x-edit-raw-json-data')
                        .xClass('btn')
                        .xStyle({'float': 'right', 'margin-right': '1em'})
                        .xAttrs({'title': 'edit raw JSON data'})
                        .xAppend(icon('bi-filetype-json', 'edit raw JSON data'))  // in dark mode
                        .xAddEventListener('click', (event) => {toggleRawJSONDataEdit()}),
                ),
        )
}

// Create the search input and the menu at the top.
function createSearchInputAndMenuEntry() {
    let popup = 'clear the search field'
    let e = xmk('div')
        .xClass('row',
                'd-flex',
                'align-items-center',
               )
        .xAppendChild(
            xmk('div')
                .xClass('col')
                .xAppendChild(mkSearchInputElement()),
            xmk('div')
                .xClass('col-auto', 'text-start')
                .xAppendChild(
                   xmk('button')
                        .xClass('btn', 'btn-lg', 'px-0', 'ms-0')
                        .xAttrs({
                            'type': 'button',
                            'title': popup,
                        })
                        .xAddEventListener('click', (event) => {
                            document.body.xGet('#search').value = ''
                            searchRecords('.')
                        })
                        .xAppend(
                            icon('bi-x-circle', popup),
                        ),
                    xmk('span').xClass('ms-3').xId('x-num-records').xInnerHTML('0')
                ),
            xmk('div')
                .xClass('col-auto', 'text-end' )
                .xAppendChild(mkMenu()),
        )
    return e
}

// make the generate password dialogue for record fields and
// reuse it if it already exists
