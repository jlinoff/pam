// Utility functions.
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { ALPHABET, getCrypticPassword, getMemorablePassword } from './password.js'
import { statusBlip } from './status.js'

// global id map
// each prefix has a number associated with it.
// mkid('foo') --> foo00000001
// mkid('bar') --> bar00000001
// mkid('bar') --> bar00000002
var mkidsMap = {}

/**
 * make unique id for a DOM element
 * @param the id prefix
 */
export function mkid(prefix) {
    // This could be modified to actually search the DOM
    // for unused ids but that is probably overkill.
    let idn = 1
    if (prefix in mkidsMap) {
        idn = mkidsMap[prefix] + 1
    } else {
        idn = 1
    }
    mkidsMap[prefix] = idn
    const id = prefix + '-' + idn.toString(16).padStart(8, '0')
    return id
}

/**
 * Reports whether the value is a URL.
 * <p>
 * It is used to generate links in record views.
 * @example
 * assert isURL('https://foo.bar.com') == true
 * assert isURL('not a url') == false
 * @param {string} value The string value to test.
 * @returns {bool} True if it is a URL or false otherwise.
 */
export function isURL(value) {
    if (value.includes('://')) {
        try {
            let url = new URL(value)
            return true
        } catch(e) {
            if (e instanceof TypeError) {
                return false
            }
        }
    }
    return false
}

// icon - display an icon
export function icon(name, tooltip) {
    let e = xmk('i').xClass('bi', name)
    if (tooltip) {
        e.xAttrs({'title': tooltip})
    }
    return e
}

// Sort a collection by key
// This did not work in some cases.
/*
export const sortDictByKey = (obj) => Object.keys(obj).sort()
    .reduce((acc, c) => { let k = c.toLowerCase() ; acc[k] = obj[k]; return acc }, {})
*/
// Do it the most obvious way - this works for all cases that i tested.
export function sortDictByKey(dict) {
    let sorted_keys = Object.keys(dict).sort( (a, b) => {
        let xa = a.toLowerCase()
        let xb = b.toLowerCase()
        if (xa === xb) {
            return 0
        }
        if (xa < xb) {
            return -1
        }
        return 1 // a > b
    })
    let sorted = {}
    sorted_keys.forEach( (key) => {
        sorted[key] = dict[key]
    })
    return sorted
}

// convert dictionary keys to list for error reporting.
export function convertDictKeys2List(dict) {
    let list = '['
    Object.entries(sortDictByKey(dict)).forEach(([key,value]) => {
        if (list.length > 1) {
            list += ', '
        }
        list += `"${key}"`
    })
    list += ']'
    return list
}

// Create a popup modal dialogue.
export function mkPopupModalDlg(id, title, body, ...buttons) {
    let lid = id + 'Label'
    let dlg = xmk('div')
        .xId(id)
        .xClass('modal', 'fade')
        .xAttrs({
            'data-bs-backdrop': 'modal',
            'data-bs-keyboard': 'false',
            'tabindex': '-1',
            'aria-labelledby': lid,
            'aria-hidden': 'true',
        })
        .xAppend(
            xmk('div')
                .xClass('modal-dialog', 'modal-lg')
                .xAppend(
                    xmk('div')
                        .xClass('modal-content')
                        .xAppend(
                            xmk('div')
                                .xClass('modal-header')
                                .xAppend(
                                    xmk('span')
                                        .xId(lid)
                                        .xClass('modal-title', 'fs-5')
                                        .xInnerHTML(title)
                                ),
                            xmk('div')
                                .xClass('modal-body')
                                .xAppendChild(body),
                            xmk('div')
                                .xClass('modal-footer')
                                .xAppend(...buttons),
                        )
                )
        )
    dlg.xAddEventListener('show.bs.modal', (event) => {
        setDarkLightTheme(window.prefs.themeName) // fix the new DOM elements
    })
    return dlg
}

/*
 * Make draggable row
 */
export function mkDraggableRow(type) {
    return xmk('row')
        .xClass('row', 'x-new-rec-fld')
        .xAttrs({
            'data-rec-type': type,
            'draggable': 'true',
        })
        .xAddEventListener('dragstart', (event) => {
            // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API
            //event.preventDefault() -- this breaks everything
            event.dataTransfer.dropEffect = 'move'
            event.dataTransfer.setData('text/html', event.target.outerHTML)
        })
        .xAddEventListener('dragover', (event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move' // this is required for the drop event
        })
        .xAddEventListener('drop', (event) => {
            event.preventDefault()
            // find dst row
            let dstrow = event.target.xGetParentOfType('row')
            let dstid = dstrow.xGet('legend').innerHTML
            // find src name
            const srcHTML = event.dataTransfer.getData('text/html')
            let srcdom = xmk('div').xInnerHTML(srcHTML) // convert to DOM to enable search
            let srcrow = srcdom.xGet('row')
            let srcid = srcrow.xGet('legend').innerHTML
            // We now have the src and dst.
            //
            // We need to move src to dst to do that we need to know
            // if the drag was up or down.
            //
            // I do this by proxy, find the index of each in the
            // parent children and compare them to determine the
            // direction.
            let container = dstrow.parentElement
            let rows = dstrow.parentElement.xGetN('row')
            let srcElement = null
            let dstElement = null
            let srcidx = -1
            let dstidx = -1
            for( let i=0; i<rows.length; i++) {
                let row = rows[i]
                let rowid = row.xGet('legend').innerHTML
                if (rowid === srcid) {
                    srcidx = i
                    srcElement = row
                }
                if (rowid === dstid) {
                    dstidx = i
                    dstElement = row
                }
            }
            if (srcidx > dstidx) {
                // dragged up
                container.insertBefore(srcElement, dstElement)
            } else if (srcidx < dstidx) {
                // dragged down
                if (dstidx === (rows.length - 1)) {
                    container.appendChild(srcElement) // will move
                } else  {
                    container.insertBefore(dstElement, srcElement)
                }
            }
        })
}

/*
 * Make a modal record button (usually Quit or Save).
 */
export function mkPopupModalDlgButton(text, type, tooltip, callback) {
    let xcls = 'x-fld-record-' + text.toLowerCase()
    let dlg = xmk('button')
        .xClass('btn', type, 'btn-lg', xcls) // btn-secondary
        .xAttrs({
            'type': 'button',
            'title': tooltip,
        })
        .xAddEventListener('click', (event) => {
            // Manually hide modal element when button is clicked.
            // No id is needed.
            let modalContent = event.target.offsetParent
            let modalDialog = modalContent.offsetParent
            let modal = modalDialog.parentElement
            let bsModal = bootstrap.Modal.getInstance(modal)
            let modalContentBody = modalContent.xGet('.modal-body')
            if (callback(modalContentBody)){
                bsModal.hide()
            }
        })
        .xInnerHTML(text)
    return dlg
}

/**
 * Toggle the light/dark, theme based on the data-bs-theme-value
 */
export function toggleDarkTheme() {
    let curTheme = document.body.getAttribute('data-bs-theme')
    if (curTheme === "dark" ) {
        setDarkLightTheme('light')
    } else {
        setDarkLightTheme('dark')
    }
}

/**
 * Update attribute value.
 */
function updateAttributeValue(attr, value) {
    let elements = Array.from(document.querySelectorAll(`[${attr}]`))
    for (let i = elements.length-1; i >= 0; i--) {
        let element = elements[i]
        try {
            element.setAttribute(attr, value)
        } catch (error) {
            console.log(error)
        }
    }
}

/**
 * Replace the "from" class with the "to" class on each element.
 * This is tricky because the list is live - it changes as the classes are replaced.
 */
function replaceClass(from, to) {
    let elements = Array.from(document.body.getElementsByClassName(from))
    //let ea = [].slice.call(document.querySelectorAll(`.${from}`),0)
    //let elements = [].slice.call(Array.from(document.body.getElementsByClassName(from)), 0)
    for (let i = elements.length-1; i >= 0; i--) {
        let element = elements[i]
        try {
            element.classList.replace(from, to)
        } catch (error) {
            console.log(error)
        }
    }
}

/**
 * Set style for elements in a class.
 */
function setStylesByClass(className, styles) {
    let elements = Array.from(document.body.getElementsByClassName(className))
    for (let i = elements.length-1; i >= 0; i--) {
        let element = elements[i]
        try {
            element.xStyle(styles)
        } catch (error) {
            console.log(error)
        }
    }
}

/**
 * set the dark/light theme explicitly
 */
export function setDarkLightTheme(theme) {
    let setDarkModeButton = document.getElementById('x-dark-mode-button')
    let setLightModeButton = document.getElementById('x-light-mode-button')
    window.prefs.themeName = theme
    updateAttributeValue('data-bs-theme', theme)
    if (theme === "light" ) {
        // let there be light!
        replaceClass('bg-dark', 'bg-light') // for the footer
        if (!!setLightModeButton && !!setDarkModeButton) {
            setLightModeButton.xStyle({'display' : 'none'})
            setDarkModeButton.xStyle({'display' : 'inline', 'color': 'black'}) // make sure it it visible
        }
    } else if (theme === "dark") {
        replaceClass('bg-light', 'bg-dark')
        if (!!setLightModeButton && !!setDarkModeButton) {
            setLightModeButton.xStyle({'display' : 'inline', color: 'white'}) // make sure it it visible
            setDarkModeButton.xStyle({'display' : 'none'})
        }
    } else {
        alert(`ERROR: invalid theme: '${theme}, expected 'dark' or 'light'`)
    }
}

export function copyTextToClipboard(value) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(value)
            .then(
                (text) => {
                    // succeeded
                    statusBlip(`copied ${value.length} bytes to clipboard`)
                },
                (error) => {
                    // failed
                    const msg = `internal error:\nnavigator.clipboard.writeText() error:\n${error}`
                    statusBlip(msg)
                    alert(msg)
                        }
            )
            .catch((error) => {
                const msg = `internal error:\nnavigator.clipboard.writeText() exception:\n${error}`
                statusBlip(msg)
                alert(msg)
            })
    } else {
        const msg = `internal error:\nnavigator.clipboard not found\ncould be a permissions problem`
        statusBlip(msg)
        alert(msg)
    }
}
