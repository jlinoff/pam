/**
 * The main entry point for the application.
 * @module main
 */
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { statusBlip } from './status.js'
import { words } from './en_words.js'
import { icon } from './utils.js'
import { initPrefs } from './prefs.js'
import { mkMenu } from './menu.js'
import { mkSearchInputElement, searchRecords } from './search.js'
import { refreshAbout } from './about.js'

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
    document.body.xClass('bg-dark')
    document.body.xAppendChild(
        xmk('header')
            .xId('top-section')
            .xClass('fixed-top',
                    'border',
                    'p-2',
                    'bg-dark',
                    'fs-5',
                    'text-center',
                    'text-light')
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
                    'bg-dark',
                    'fs-5',
                    'text-center',
                    'text-info',
                   )
            .xId('status')
            .xAttrs({'title': 'dynamic status messages appear here'})
            .xInnerHTML('footer')
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
                        .xClass('btn', 'btn-lg', 'px-0', 'ms-0', 'text-light')
                        .xAttrs({
                            'type': 'button',
                            'title': popup,
                        })
                        .xAddEventListener('click', (event) => {
                            document.body.xGet('#search').value = ''
                            searchRecords('')
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
