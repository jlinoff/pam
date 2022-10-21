// Save file.
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { statusBlip } from './status.js'
import { VERSION } from './version.js'  // automatically generated by make
import { icon, mkPopupModalDlgButton, mkPopupModalDlg } from './utils.js'
import { findRecord } from './record.js'
import { mkGeneratePasswordDlg, mkLoadSavePassword, setFilePass } from './password.js'
import { encrypt } from './crypt.js'

// Called from the top level menu.
export function menuSaveDlg() {
    let body = xmk('span')
        .xAppendChild(
            xmk('p').xInnerHTML('Enter a password to encrypt the record contents. You must use the same password to decrypt when loading.'),
            xmk('p').xInnerHTML('Enter "clipboard" or "copy" as the filename paste to the clipboard.'),
            xmk('form').xClass('container').xAppend(
                // save file name
                xmk('div').xClass('row').xAppend(
                    xmk('div').xClass('col-12', 'overflow-auto').xAppend(
                        xmk('label').xClass('col-form-label').xInnerHTML('Filename')
                    ),
                    xmk('div').xClass('col-12', 'overflow-auto').xAppend(
                        xmk('div').xClass('input-group').xAppend(
                            xmk('input').xClass('form-control', 'ps-1').xId('x-save-filename')
                                .xAttrs({'type': 'text', 'value': window.prefs.fileName}),
                            xmk('span').xClass('input-group-append').xAppend(
                                xmk('button')
                                    .xClass('btn', 'btn-lg', 'px-0', 'ms-2')
                                    .xAttr('type', 'button')
                                    .xAddEventListener('click', (event) => {
                                        let row = event.target.xGetParentWithClass('row')
                                        row.xGet('input').value = ''
                                    })
                                    .xAppend(
                                        icon('bi-x-circle', 'delete filename')
                                    ),
                            ),
                        ),
                    ),
                ),
                // save file password
                xmk('div').xClass('row').xAppend(
                    xmk('div').xClass('col-12', 'overflow-auto').xAppend(
                        xmk('label').xClass('col-form-label').xInnerHTML('Password')
                    ),
                    xmk('div').xClass('col-12', 'x-fld-value-div', 'overflow-auto').xAppend(
                        mkLoadSavePassword('x-save-password')
                    ),
                ),
            )
        )
    // Get the place to create the generate dialogue.
    // Load does not need the generate functionality.
    let input_group = body.xGet('#x-save-password').parentElement
    let input_group_append = input_group.xGet('.input-group-append')
    input_group_append.xAppend(
            xmk('button')
                .xClass('btn', 'btn-lg', 'px-0', 'ms-2')
                .xAttr('type', 'button')
            .xAddEventListener('click', (event) => {
                mkGeneratePasswordDlg(event)
            })
            .xAppend(
                icon('bi-gear', 'generate a password')
            ),
    )

    // Create the buttons.
    let b1 = mkPopupModalDlgButton('Close',
                                 'btn-secondary',
                                 'close the dialogue with no changes',
                                 (el) => {
                                    //console.log(el)
                                    return true
                                })
    let b2 = mkPopupModalDlgButton('Save',
                                 'btn-primary',
                                 'save using the password',
                                 (el) => {
                                     //console.log(el)
                                     let fn = el.xGet('#x-save-filename').value.trim()
                                     let fp = el.xGet('#x-save-password').value.trim()
                                     document.body.xGet('#x-save-password').value = fp
                                     document.body.xGet('#x-load-password').value = fp
                                     window.prefs.fileName = fn
                                     setFilePass(fp)
                                     statusBlip(`saving to ${fn}...`)
                                     saveFile(fn, fp)
                                     return true
                                })
    let e = mkPopupModalDlg('menuSaveDlg', 'Save Records To File', body, b1, b2)
    return e
}

// Save the file.
function saveFile(filename, password) {
    let now = new Date().toISOString()
    let contents = {
        'meta': {
            'date-saved': now,
            'format-version': VERSION,
        },
        'prefs': {},
        'records': [],
    }

    // Save the preferencess
    for (const [key, value] of Object.entries(window.prefs)) {
        //console.log(`SAVE: ${key} = "${value}"`)
        contents.prefs[key] = value
    }

    // Load all of the record data.
    let recordsContainer = document.body.xGet('#records-accordion') // middle part of the document.
    let accordionItems = recordsContainer.xGetN('.accordion-item')
    for (let i=0; i<accordionItems.length; i++) {
        let accordionItem = accordionItems[i]
        let button = accordionItem.xGet('.accordion-button')
        let title = button.innerHTML
        let rec = {
            'title': title,
            'fields': []
        }
        let rows = accordionItem.xGetN('.row')
        for (let i=0; i<rows.length; i++) {
            let row = rows[i]
            let nameDiv = row.xGet('.x-fld-name')
            if (!nameDiv) {
                continue // button row
            }
            let name = nameDiv.innerHTML
            let valueDiv = row.xGet('.x-fld-value')
            let value = valueDiv.innerHTML
            let type = valueDiv.getAttribute('data-fld-type')
            switch( type ) {
            case 'html':
            case 'password':
            case 'textarea':
            case 'url':
                value = valueDiv.getAttribute('data-fld-raw-value')
                break
            default:
                break
            }
            let fld = {
                'name': name,
                'type': type,
                'value': value,
            }
            rec.fields.push(fld)
        }
        contents.records.push(rec)
    }
    let text = JSON.stringify(contents, null, 0)
    encrypt(password, text, filename, saveCallback)
}

function saveCallback(text, filename) {
    if (!text || text.length === 0 ) {
        return
    }

    // hack to handle special case where mobile browsers just don't work.
    if ( filename === 'clipboard' || filename === "copy" ) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text)
                .then( (value) => {
                    // succeeded
                    statusBlip(`copied ${text.length} bytes to clipboard`)
                })
                .catch( (error) => {
                    // failed
                    const msg = `internal error:\nnavigator.clipboard.writeText() error:\n${error}`
                    statusBlip(msg)
                    alert(msg)
                })
        }
        statusBlip(`Copied ${text.length} bytes to the clipboard`)
        return
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
    let options = {suggestedName: filename}
    window.showSaveFilePicker(options)
        .then( (fileHandle) => {
            console.log(fileHandle)
            fileHandle.createWritable()
                .then( (writableStream) => {
                    writableStream.write(text)
                    writableStream.close()
                })
                .catch( (error) => {
                    const msg = `internal error:\nnavigator.clipboard.writeText() exception:\n${error}`
                    statusBlip(msg)
                    alert(msg)
                })
        })
        .catch( (error) => {
            const msg = `internal error:\nnavigator.clipboard.writeText() exception:\n${error}`
            statusBlip(msg)
            alert(msg)
        })
    /*
      // old approach using a link.
    let check = xmk('a')
    console.log(check)
    if (check.download === undefined) {
        alert('WARNING!\nsave dialogue not fully supported in this browser.')
    }
    // Create anchor element, add the data and click it.
    let data = 'data:text/plain; charset=utf-8,' + encodeURIComponent(text)
    let a = xmk('a')
        .xStyle({
            'display': 'none'
            })
        .xAttrs({
            'href': data,
            'download': filename
        })
    document.body.appendChild(a)
    a.click()
    setTimeout( () => {a.remove()}, 2000)
    */
}
