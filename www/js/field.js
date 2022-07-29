// record fields
import { xmk } from './lib.js'
import { icon, isURL, mkDraggableRow, sortDictByKey } from './utils.js'
import { findRecord } from './record.js'
import { mkGeneratePasswordDlg } from './password.js'
import { statusBlip } from './status.js'

// Make record field with the name, type and value.
export function mkRecordField(name, type, value) {
    let rawValue = value
    let fieldValue = rawValue // is modified for display by password, textarea and url

    // copy to clipboard button for all fields.
    let fldButtons = []
    let copyToClipboardButton = mkRecordFieldCopyToClipboardButton(rawValue)

    switch (type) {
    case 'url':
        if (isURL(rawValue)) {
            fieldValue = `<a href="${rawValue}" target="_blank">${rawValue}</a>`
        }
        break
    case 'password':
        // show/hide button for password fields
        fieldValue = '*'.repeat(value.length)  // emulate the **** for password fields
        fldButtons.push( mkRecordFieldPasswordShowHideButton(rawValue, fieldValue) )
        break
    case 'textarea':
        fieldValue = `<pre>${rawValue}</pre>` // needed to keep line breaks in HTML
        break
    default:
        break
    }
    fldButtons.push(copyToClipboardButton) // copy to clipboard is the rightmost button

    // For each field in the entry add a an entry to the accordion body
    // with the field name and type. Also add a clipboard button.
    // For fields that contain URLs create a link.
    return mkRecordFldElement(name, type, fieldValue, rawValue, ...fldButtons)
}

// Make the DOM elements for a single record field.
function mkRecordFldElement(name, type, value, rawValue, ...buttons) {
    return xmk('div').xClass('row', 'p-0').xAppend(
        xmk('div')
            //.xClass('col-12', 'col-sm-3', 'text-start')
            .xClass('col-12', 'text-start')
            .xAppend(
                xmk('div')
                    //.xClass('border', 'fst-italic', 'x-fld-name')
                    .xClass('x-fld-name', 'overflow-auto', 'text-secondary')
                    .xInnerHTML(name),
            ),
        //xmk('div').xClass('col', 'text-center').xAppend(xmk('div').xInnerHTML(type)),
        xmk('div')
            //.xClass('col-12', 'col-sm-7', 'text-start').xAppend(
            .xClass('col-12', 'text-start').xAppend(
                xmk('div')
                    .xClass('x-fld-value', 'border', 'font-monospace', 'overflow-auto')
                    .xAttrs({
                        'title': `type: ${type}`,
                        'data-fld-type': type,
                        'data-fld-raw-value': rawValue,
                    })
                    .xInnerHTML(value)
            ),
        xmk('div')
            //.xClass('col-12', 'col-sm-2', 'text-end').xAppend(...buttons)
            .xClass('col-12', 'text-end').xAppend(...buttons)
    )
}

// Make a button whose action is to copy to the clipboard
function mkRecordFieldCopyToClipboardButton(raw_value) {
    const value = raw_value
    return xmk('button')
        .xClass('btn', 'btn-lg', 'p-0', 'ms-2')
        .xAttrs({'type': 'button'})
        .xAppend(icon('bi-clipboard', 'copy to clipboard')) // also bi-files
        .xAddEventListener('click', (event) => {
            statusBlip(`copying ${value.length} bytes to clipboard`)
            //console.log(status)
            if (navigator.clipboard) {
                navigator.clipboard
                    .writeText(value)
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
         })
}

// Make a button whose action is to show or hide a password value
function mkRecordFieldPasswordShowHideButton(showValueIn, hideValueIn) {
    const showValue = showValueIn
    const hideValue = hideValueIn
    return xmk('button')
        .xClass('btn', 'btn-lg', 'p-0', 'ms-2')
        .xAppend(icon('bi-eye', 'show password'))
        .xAddEventListener('click', (event) => {
            let row = event.target.xGetParentWithClass('row')
            let button = event.target.xGetParentWithClass('btn')
            let valueElement = row.xGet('.x-fld-value')
            let icon = button.xGet('.bi-eye')
            if (icon) {
                icon.classList.remove('bi-eye')
                icon.classList.add('bi-eye-slash')
                valueElement.innerHTML = showValue
            } else {
                icon = button.xGet('.bi-eye-slash')
                icon.classList.remove('bi-eye-slash')
                icon.classList.add('bi-eye')
                valueElement.innerHTML = hideValue
            }
        })
}

// define dropdown-toggle list item.
function mkRecordFieldNameListEntry(name, type) {
    return xmk('a')
        .xClass('dropdown-item')
        .xAttrs({'href': '#',
                 'value': name,
                 'data-lia-name': name,
                 'data-lia-type': type,
                })
        .xInnerHTML(name)
        .xAddEventListener('click', (event) => {
            let pp = event.target.xGetParentWithClass('dropdown-menu')
            let ppa = pp.xGet('.active')
            ppa.classList.remove('active')
            event.target.classList.add('active')
            let row = event.target.xGetParentWithClass('row')

            // Create the draggable field.
            //console.log(`selected ${name}`)
            let container = event.target.xGetParentWithClass('container')
            container.xAppend(mkRecordEditField(name, type, container))
        })
}

// make the toggle list items for the drop down menu
function mkRecordFieldNameListItems(nameTypeMap) {
    // Create the type select list entries from window.prefs.predefinedRecordFields.
    let sorted = sortDictByKey(nameTypeMap)
    let entries = []
    Object.entries(sorted).forEach(([key,value]) => {
        let e =  xmk('li').xAppend(mkRecordFieldNameListEntry(key, value))
        if (key === window.prefs.predefinedRecordFieldsDefault) {
            e.xClass('active')
        }
        entries.push(e)
    })
    //console.log(entries)
    return entries
}

// Make a record field.
// textarea - has a known  bug: label aligns at bottom
// password - generate not implemented.
// all - move fields up and down (change order)
function mkRecordEditField(name, type, container, value) {
    let drag = '<i class="bi bi-grip-vertical"></i>'

    // See if name was already used, if so, append a number to the name to make it unique.
    let names = container.xGetN('.x-fld-name')
    let dups = {} // make sure it is not renamed to something that already exists
    //console.log('.x-fld-name', names)
    names.forEach( (n) => {
        //console.log('n.value', n.value)
        if (n.value.includes(name)) {
            //console.log('name', name)
            let pos = n.value.search(/\d/);
            //console.log('pos', pos)
            if (pos < 0) {
                name = name + '1'
            } else {
                let base = n.value.slice(0, pos)
                let num = parseInt(n.value.slice(pos)) + 1
                name = base + num  // make a unique name
                while (name in dups) { // make sure it is really unique
                    num++
                    name = base + num
                }
                dups[name] = num // cache 'em to avoid duplicates
            }
        }
    })

    // define the the value input element
    if (!value) {
        value = ''
    }
    let passwordLength = null
    let passwordShowHide = null
    let passwordGenerate = null
    let inputs = [] // There can be multiple input elements (see password)
    if ( type === 'textarea' ) {
        let e = xmk('textarea')
        if (value) {
            e.value = value
        }
        inputs.push(e)
    } else if ( type === 'password' ) {
        let e0 = xmk('input').xAttrs({'type': type, 'value': value})
            .xAddEventListener('change', (event1) => {
                let row = event1.target.xGetParentWithClass('row')
                let e1 = row.parentElement.xGet('.x-fld-value-length')
                e1.innerHTML = event1.target.value.length
            })
            .xAddEventListener('input', (event1) => {
                let row = event1.target.xGetParentWithClass('row')
                let e1 = row.parentElement.xGet('.x-fld-value-length')
                e1.innerHTML = event1.target.value.length
            })
        inputs.push(e0)
        // password length element
        let len = value ? value.length : 0
        passwordLength = xmk('span').xClass('x-fld-value-length', 'ms-3').xInnerHTML(len)
    } else {
        let e = xmk('input').xAttrs({'type': type, 'value': value})
        inputs.push(e)
    }

    // These are the same for all inputs.
    inputs[0]
        .xClass('x-fld-value', 'form-control', 'font-monospace')
        .xAttr('data-fld-type', type)
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

    // define delete button
    let recordDeleteButton = xmk('button')
        .xAttrs({'type': 'button', 'title': `delete field`})
        .xClass('btn', 'btn-lg', 'ms-0')
        .xAppend(icon('bi-trash3-fill', 'delete'),
                 xmk('span').xInnerHTML('&nbsp;Delete Field '))
        .xAddEventListener('click', (event) => {
            let row = event.target.xGetParentWithClass('x-new-rec-fld')
            row.remove()
        })

    // define password buttons
    if ( type === 'password' ) {
        // password show/hide button
        passwordShowHide = xmk('button')
            .xAttrs({'type': 'button',
                     'title': 'show or hide password'})
            .xClass('btn', 'btn-lg', 'px-0', 'ms-3')
            .xAppend(icon('bi-eye', 'show or hide password'))
            .xAddEventListener('click', (event) => {
                let button = event.target.parentElement
                //console.log(button)
                let row = button.xGetParentWithClass('row')
                let passwordInput = row.xGet('.x-fld-value')
                let icon = button.xGet('i')
                let show = icon.classList.contains('bi-eye')
                if (show) {
                    icon.classList.remove('bi-eye')
                    icon.classList.add('bi-eye-slash')
                    passwordInput.xAttr('type', 'text')
                } else {
                    icon.classList.remove('bi-eye-slash')
                    icon.classList.add('bi-eye')
                    passwordInput.xAttr('type', 'password')
                }
            })

        // password generate button
        passwordGenerate = xmk('button')
            .xAttrs({'type': 'button'})
            .xClass('btn', 'btn-lg', 'px-0', 'ms-3')
            .xAppend(icon('bi-gear', 'generate a password'))
            .xAddEventListener('click', (event) => {
                mkGeneratePasswordDlg(event)
            })
    }

    let display = 'none'
    if (window.prefs.editableFieldName === true ) {
        display = 'block'
    }
    let editableFieldName = xmk('div').xStyle({'display': display}).xClass('row').xAppend(
        xmk('div').xClass('col-12').xAppend(
            xmk('label')
                .xClass('col-form-label')
                .xInnerHTML('Name')
        ),
        xmk('div').xClass('col-12').xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xAttrs({'value': name})
                    .xClass('x-fld-name', 'form-control')
                    .xAddEventListener('input', (event) => {
                        let fieldset = event.target.xGetParentOfType('fieldset')
                        let legend = fieldset.xGet('legend')
                        legend.innerHTML = event.target.value
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
                            icon('bi-x-circle', 'clear field name')
                        ),
                ),
            ),
        ),
    )

    let editableFieldValue = xmk('div').xClass('row').xAppend(
        xmk('div').xClass('col-12').xAppend(
            xmk('label').xStyle({'display': display})
                .xClass('col-form-label')
                .xInnerHTML('Value')
        ),
        xmk('div').xClass('col-12', 'overflow-auto').xAppend(
            xmk('div').xClass('input-group').xAppend(
                ...inputs,
                xmk('span').xClass('input-group-append').xAppend(
                    xmk('button')
                        .xClass('btn', 'btn-lg', 'px-0', 'ms-2')
                        .xAttr('type', 'button')
                        .xAddEventListener('click', (event) => {
                            let row = event.target.xGetParentWithClass('row')
                            let field = row.xGet('.x-fld-value')
                            //console.log(field)
                            let ftype = field.getAttribute('data-fld-type')
                            //console.log(ftype)
                            if (ftype === 'textarea') {
                                field.value = ''
                            } else {
                                field.value = ''
                            }
                            if (ftype === 'password') {
                                let e1 = row.xGet('.x-fld-value-length')
                                e1.innerHTML = '0' // length
                            }
                        })
                        .xAppend(
                            icon('bi-x-circle', `clear ${type} value`)
                        ),
                ),
            ),
        ),
        // Buttons
        xmk('div').xClass('col-12', 'x-fld-value-div')
            .xAppend(
                recordDeleteButton,
                passwordLength,
                passwordShowHide,
                passwordGenerate,
            ),
    )

    // Create the field name/value sub-dialogue
    let draggableRow = mkDraggableRow(type)
    draggableRow.xAppend(
        xmk('form').xClass('x-fld-form').xAppend(
            xmk('fieldset').xClass('border', 'border-dark', 'p-2').xAppend(
                xmk('legend')
                    .xClass('float-none', 'w-auto', 'fs-5', 'px-2')
                    .xStyle({cursor: 'grab'})
                    .xAttrs({'title': 'field name draggable'})
                    .xInnerHTML(`${drag} ${name}`),
                editableFieldName,
                editableFieldValue,
            ),
        ),
    )
    return draggableRow
}

// export update record field types
export function updateRecordFieldTypes() {
    // update the record field types when
    // window.prefs.predefinedRecordFields changes.
    let dropdown = document.body.xGet('#x-new-field-type').xGetParentWithClass('dropdown')
    let menu = dropdown.xGet('ul')
    menu.replaceWith(
        xmk('ul')
            .xAttrs({'aria-labelledby': 'x-new-field-type'})
            .xClass('dropdown-menu')
            .xAppend(...mkRecordFieldNameListItems(window.prefs.predefinedRecordFields))
    )
}

// Define the DOM elements used to edit the record.
export function mkRecordEditDlg(title) {
    return xmk('div').xClass('container').xAppend(
        xmk('div').xClass('row').xAppend(
            // Title input
            xmk('div').xClass('col-12').xAppend(
                xmk('input')
                    .xClass('w-100', 'fs-5', 'm-2', 'x-record-title')
                    .xAttrs({
                        'value': title,
                        'placeholder': 'Record Title',
                    })
            ),
        ),
        xmk('div').xClass('row').xAppend(
            xmk('div').xClass('col').xAppend(
                xmk('div').xClass('dropdown').xAppend(
                    // This is the field types button that displays the field name pulldown.
                    xmk('button')
                        .xId('x-new-field-type')
                        .xClass('btn', 'btn-secondary', 'dropdown-toggle')
                        .xAttrs({
                            'aria-expanded': 'false',
                            'data-bs-toggle': 'dropdown',
                            'title': 'create new field of the selected type',
                            'type': 'button',
                        })
                        .xInnerHTML('New Field'),
                    // This is the field name list pulldown.
                    xmk('ul')
                        .xAttrs({'aria-labelledby': 'x-new-field-type'})
                        .xClass('dropdown-menu')
                        .xAppend(...mkRecordFieldNameListItems(window.prefs.predefinedRecordFields)
                    ),
                ),
            ),
        ),
    )
}

// Copy the fields from the source record to the edit dlg.
// title is the identifies the source record.
export function copyRecordFieldsToEditDlg(title, body, clone) {
    let srcRecord = findRecord(title)
    let rows = srcRecord.xGetN('.row')
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
        if (type === 'password' || type === 'url' || type === 'textarea') {
            value = valueDiv.getAttribute('data-fld-raw-value')
        }
        if (clone && !window.prefs.cloneFieldValues) {
            value = ''
        }
        let fld = mkRecordEditField(name, type, body, value)
        body.xAppend(fld)
    }
}
