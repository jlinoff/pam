/**
 * The main entry point for the application.
 * @module main
 */
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { statusBlip } from './status.js'
import { words } from './en_words.js'
import { icon, toggleDarkTheme, setDarkLightTheme } from './utils.js'
import { initPrefs } from './prefs.js'
import { mkMenu } from './menu.js'
import { mkSearchInputElement, searchRecords } from './search.js'
import { refreshAbout } from './about.js'
import { printRecords, enablePrinting } from './print.js'
import { mkGeneratePasswordDlg } from './password.js'
import { mkRecordEditField } from './field.js'

/**
 * Actions to take when the window is loaded.
 * @global
 */
window.onload = () => { initPrefs(); main() }
window.onresize = () => { refreshAbout() }

// https://developer.mozilla.org/en-US/docs/Web/API/Window#events
/**
 * Clean up actions to take when the window is unloaded.
 * @global
 */
window.addEventListener('beforeunload', () => {/*console.log('beforeunload')*/})
window.addEventListener('unload', () => {/*console.log('unload')*/})
window.addEventListener('load', () => {/*console.log('load')*/})

/**
 * Main entry point for the application.
 */
export function main() {
    // Enable the extra "x" prototype functions for elements.
    //console.log('window.isSecureContext: ', window.isSecureContext)
    enableFunctionChaining()
    initialize()
    adjust()
    enablePrinting()
    setDarkLightTheme(window.prefs.themeName)
    //setTimeout(() => {adjust()}, 1000)
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
                    xmk('button')
                        .xId('x-generate-password')
                        .xClass('btn')
                        .xStyle({'float': 'right', 'margin-right': '1em'})
                        .xAttrs({'title': 'generate password'})
                        .xAppend(icon('bi-key', 'generate password'))  // in dark mode
                        .xAddEventListener('click', (event) => {mainGeneratePasswords()})
                ),
        )
}

function mainGeneratePasswords() {
    // Create fake scafolding for the password.

    // If records are displayed, hide them.
    let records = document.getElementById('records-accordion')
    if (!!records) {
        records.xStyle({display: 'none'})
    }

    // If the search bar is present, hide it.
    let search = document.getElementById('top-section')
    if (!!search ) {
        search.xStyle({display: 'none'})
    }

    // Create the fake row scafolding, including a fake event.
    let fakeRow = xmk('div')
        .xClass('row', 'x-fake')
        .xId('fakeRow')
        .xStyle({'margin-left':'5em',
                 'margin-right':'5em',
                 'position':'fixed',
                 'top': '0',
                 'z-index': '1000 !important'})
    let fakePassword =  mkRecordEditField(' Password', 'password', fakeRow, '')
    fakeRow.xAppend(fakePassword)
    let fakeEvent = {'target': {'parentElement': fakeRow}}

    // Now make the password generation dialogue.
    document.body.appendChild(fakeRow)
    mkGeneratePasswordDlg(fakeEvent)

    // Find the buttons needed for the event overlays.
    let button1 = null
    let button2 = null
    let btns = fakeRow.getElementsByClassName('btn')
    for (let i=0; i<btns.length; i++) {
        let b = btns[i]
        if (b.innerHTML.includes('Close Password Generator')) {
            button1 = b
        }
        if (b.innerHTML.includes('Delete Field')) {
            button2 = b
        }
    }
    // Add the additional event handlers to clean up.
    button1.addEventListener('click', (event) => {
        button2.click()
        let fakes = document.body.getElementsByClassName('x-fake')
    })
    button2.addEventListener('click', (event) => {
        button1.click()
        let fakes = document.body.getElementsByClassName('x-fake')
        for (let j=0;j<fakes.length; j++ ) {
            fakes[j].remove()
        }
        if (!!records) {
            records.xStyle({display: 'block'})
        }
        if (!!search ) {
            search.xStyle({display: 'block'})
        }
    })
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
