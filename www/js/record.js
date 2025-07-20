import { xmk, xgetn } from './lib.js'
import { icon, isURL, mkid,  mkPopupModalDlg, mkPopupModalDlgButton } from './utils.js'
import { copyRecordFieldsToEditDlg, mkRecordEditDlg, mkRecordField } from './field.js'
import { searchRecords } from './search.js'
import { clearAbout } from './about.js'

let INACTIVE = '<small>*INACTIVE*</small>&nbsp;'

// find record by title.
// it does a case insensitive O(N) lookup so "Xyx" will be equal "xyz".
// This is an O(N) operation but that is okay because the number of records is small.
export function findRecord(title) {
    let recordsContainer = document.body.xGet('#records-accordion') // middle part of the document.
    let titleNormalized = title.trim().toLowerCase()
    let accordionItems = recordsContainer.xGetN('.accordion-item')
    for (let i=0; i<accordionItems.length; i++) {
        let accordionItem = accordionItems[i]
        let button = accordionItem.xGet('.accordion-button')
        let valueNormalized = button.innerHTML.trim().toLowerCase()
        if (valueNormalized === titleNormalized ) {
            return accordionItem
        }
    }
    return null
}

// get the number of records.
function getNumRecords() {
    let recordsContainer = document.body.xGet('#records-accordion')
    let accordionItems = recordsContainer.xGetN('.accordion-item')
    return accordionItems.length
}

// set the number of records
function setNumRecords() {
    let numrecs = getNumRecords()
    document.body.xGet('#x-num-records').xInnerHTML(numrecs)
}

// find the record that would appear after this one
// for use in an insertBefore operation. If it would
// be the last record, return null.
// This is an O(N) operation but that is okay because the number of records is small.
export function findRecordAfter(title) {
    let recordsContainer = document.body.xGet('#records-accordion')
    let inserted = false
    let titleNormalized = title.trim().toLowerCase()
    let records = recordsContainer.xGetN('.accordion-item')
    for (let i=0; i<records.length; i++) {
        let record = records[i]
        let button = record.xGet('.accordion-button')
        let valueNormalized = button.innerHTML.trim().toLowerCase()
        if (valueNormalized > titleNormalized ) {
            return record // insertbefore
        }
    }
    return null // append
}

// delete record
export function deleteRecord(title) {
    let record = findRecord(title)
    if (record) {
        record.remove()
        setNumRecords()
    }
}

// insert record into the accordion display
export function insertRecord(newRecord, title) {
    // ordered insertion here.
    // this logic guarantees that the list always maintains order.
    // order is desirable because it makes it more human readable.
    // the complexity O(N) but the list is relatively small (human scale)
    // so it will be sufficiently fast.
    let afterRecord = findRecordAfter(title)
    if (afterRecord) {
        afterRecord.parentElement.insertBefore(newRecord, afterRecord)
    } else {
        let recordsContainer = document.body.xGet('#records-accordion')
        recordsContainer.appendChild(newRecord)
    }
    setNumRecords()
}

// clear all records
export function clearRecords() {
    let recordsContainer = document.body.xGet('#records-accordion') // middle part of the document.
    let accordionItems = recordsContainer.xGetN('.accordion-item')
    let nodeList = []
    for (let i=0; i<accordionItems.length; i++) {
        let accordionItem = accordionItems[i]
        nodeList.push(accordionItem)
    }
    nodeList.forEach((n) => { n.remove() })
    document.body.xGet('#x-num-records').xInnerHTML('0')
    clearAbout()
}

// Create the DOM structure for the new record using the bootstrap
// accordion idiom.
//
// title - is the unique record title
// active - is the boolean active flag
// created - is the creation date string
// recordFields - are the record fields
//
// The data for each record is embedded in the DOM elements that
// compose the fields. Each record is an array of fields.
//
// The name of a field is found by:
//   recordFields[i].getElementsByClassName('x-fld-name')[0].childNodes[0].textContent;
//
// The type of a field is found by:
//   recordFields[i].querySelectorAll('[data-fld-raw-value]')[0].dataset.fldType;
//
// The true value of a field is found by:
//   recordFields[i].querySelectorAll('[data-fld-raw-value]')[0].dataset.fldRawValue;
//
// The display value of a field used for passwords or secrets is found by:
//   recordFields[i].getElementsByClassName('[x-fld-value]')[0].childNodes[0].textContent;
//
// Note to future self:
//   Should the recordFields array have a custom property for the title
//   and other properties?
export function mkRecord(title, active, created, ...recordFields) {
    // Create the accordion item with all of the record information.
    // Accordions in bootstrap only allow one item to be expanded at a time.
    let rid1 = mkid('rid') // unique record id for accordion entry header
    let rid2 = mkid('rid') // unique record id for accordion entry collapsable body

    let activateCheckBoxElement = xmk('input')
        .xClass('form-check-input', 'fs-6', 'm-2')
        .xAttrs({'title': 'click to toggle the activation this record, inactive records can be hidden',
                 'type': 'checkbox',
                 'value': '',
                 'style': 'height: 1.5em; width: 1.5em',
                })
        .xAddEventListener('click', (event) => {
            console.log(event.target.checked)
            console.log(event.target)
            if (event.target.checked) {
                let item = event.target.xGetParentWithClass('accordion-item')
                let button = item.xGet('.accordion-button')
                let titleElem = item.getElementsByClassName('accordion-button')[0]
                let title = titleElem.innerHTML
                titleElem.innerHTML = title.replace(INACTIVE, '')
                button.setAttribute('x-active', 'true')
                searchRecords() // refresh
            } else {
                let item = event.target.xGetParentWithClass('accordion-item')
                let button = item.xGet('.accordion-button')
                let titleElem = item.getElementsByClassName('accordion-button')[0]
                let title = titleElem.innerHTML
                titleElem.innerHTML = title.replace(INACTIVE, '')
                titleElem.innerHTML = INACTIVE + title
                button.setAttribute('x-active', 'false')
                searchRecords() // refresh
            }
        })

    if (active){
        // Always active for the time being.
        activateCheckBoxElement.xAttrs({'checked': 'checked'})
    }

    let toggleActivateButton = xmk('span')
        .xAppend(
            activateCheckBoxElement,
            xmk('span')
                .xClass('fs-6', 'm-1')
                .xAttrs({'title': 'toggle between active and inactive, inactive records can be hidden in prefernces'})
                .xInnerHTML('&nbsp;Active'))

    let deleteButton = xmk('button')
        .xClass('btn', 'fs-6', 'm-1')
        .xAttrs({'title': 'delete this record permanently'})
        .xAppend(
            icon('bi-trash', 'delete this record permanently'),
            xmk('span').xInnerHTML('&nbsp;Delete'))
        .xAddEventListener('click', (event) => {
            let ai = event.target.xGetParentWithClass('accordion-item')
            ai.remove()
            setNumRecords()
            searchRecords() // refresh
        })

    let cloneButton = xmk('button')
        .xClass('btn', 'fs-6', 'm-1')
        .xAttrs({'title': 'duplicate this record'})
        .xAppend(
            icon('bi-files', 'duplicated this record'),
            xmk('span').xInnerHTML('&nbsp;Clone'))
        .xAddEventListener('click', (event) => {
            // bring up the edit record modal dialogue
            let dlg = document.body.xGet('#menuCloneDlg')
            if (dlg) {
                // we replace it each time because the fields are
                // different.
                dlg.remove()
            }
            let now = new Date().toISOString()
            let newDlg = menuCloneDlg(title, active, now)  // cloned records have a new creation date
            document.body.xAppendChild(newDlg)
            dlg = document.body.xGet('#menuCloneDlg')
            let myModal = new bootstrap.Modal(dlg)
            myModal.show()
        })

    let editButton = xmk('button')
        .xClass('btn', 'fs-6', 'm-1')
        .xAttrs({'title': 'edit this record'})
        .xAppend(
            icon('bi-pencil-square', 'edit this record'),
            xmk('span').xInnerHTML('&nbsp;Edit')
        )
        .xAddEventListener('click', (event) => {
            // bring up the edit record modal dialogue
            let dlg = document.body.xGet('#editRecordDlg')
            if (dlg) {
                // we replace it each time because the fields are
                // different.
                dlg.remove()
            }
            let newDlg = editRecordDlg(title, active, created)
            document.body.xAppendChild(newDlg)
            dlg = document.body.xGet('#editRecordDlg')
            let myModal = new bootstrap.Modal(dlg)
            myModal.show()
        })

    return xmk('div').xAppend(
        xmk('div').xClass('accordion-item').xAppend(
            xmk('div').xId(rid1).xClass('accordion-header').xAppend(
                xmk('button').xClass('accordion-button', 'fs-4', 'collapsed')
                    .xAttrs({
                        'type': 'button',
                        'data-bs-toggle': 'collapse',
                        'data-bs-target': '#' + rid2,
                        'aria-expanded': 'false',
                        'aria-controls': rid2,
                        'x-active': active.toString(),
                        'x-created': created,
                    })
                    .xInnerHTML(title)
            ),
            xmk('div').xId(rid2)
                .xAttrs({
                    'aria-labelledby': rid1,
                    'data-bs-parent': '#records-accordion',
                })
                //.xClass('accordion-collapse', 'collapse', 'show')
                .xClass('accordion-collapse', 'collapse')
                .xAppend(
                    xmk('div')
                        .xClass('accordion-body', 'fs-5')
                        .xAppend(
                            // The record fields with clipboard copy buttons and other stuff.
                            xmk('div')
                                .xClass('container')
                                .xAppend(...recordFields),
                            // The record buttons.
                            xmk('div')
                                .xClass('container')
                                .xAppend(
                                    xmk('div')
                                        .xClass('row', 'align-items-center')
                                        .xAppend(
                                            // the record buttons.
                                            xmk('div')
                                                .xClass('col-12', 'align-self-start')
                                                .xAppend(
                                                    deleteButton,
                                                    cloneButton,
                                                    editButton,
                                                    toggleActivateButton,
                                                    xmk('span')
                                                        .xClass('btn', 'fs-6', 'm-1')
                                                        .xAttrs({'title': 'creation date'})
                                                        .xInnerHTML('&nbsp;Created: <small>'+created+'</small>')
                                                ),
                                        ),
                                ),
                        ),
                ),
        )
    )
}

// Clone an existing record
function menuCloneDlg(title, active, created) {
    let body = mkRecordEditDlg(title + ' Clone')
    copyRecordFieldsToEditDlg(title, body, true)
    let closeButton = mkPopupModalDlgButton('Close',
                                          'btn-secondary',
                                          'close the dialogue with no changes',
                                          (event) => {
                                              console.log(event)
                                              cleanRecordEditDlg(event)
                                              return true
                                          })
    let saveButton = mkPopupModalDlgButton('Save',
                                         'btn-primary',
                                         'save the changes and close the dialogue',
                                         (event) => {
                                             console.log(event)
                                             checkRecordEditDlg(event, false) // do not allow duplicate titles
                                             let container = event.xGet('.container')
                                             if (container.getAttribute('data-check-failed')) {
                                                 let msg = container.getAttribute('data-check-failed')
                                                 alert(`ERROR! ${msg}\nCANNOT SAVE RECORD`)
                                                 container.removeAttribute('data-check-failed')
                                                 return false
                                             } else {
                                                 let newTitle = container.xGet('.x-record-title').value.trim()
                                                 // do not delete the old record!
                                                 saveRecordEditDlg(event, active, created)
                                                 cleanRecordEditDlg(event)
                                                 searchRecords() // refresh
                                                 return true
                                     }
    })
    let e = mkPopupModalDlg('menuCloneDlg', 'Clone Record', body, closeButton, saveButton)
    return e
}


// Clean up the drop down.
// Reset the active to the default.
// event - event listener event
export function cleanRecordEditDlg(event) {
    // define the active selection.
    let button = event.offsetParent.xGet('.dropdown-toggle')
    button.parentElement.xGetN('.dropdown-item').forEach( (n) => {
        n.classList.remove('active') // remove from all entries
        if (n.innerHTML === window.prefs.predefinedRecordFieldsDefault) {
            n.classList.add('active') // activate the text entry
        }
    })

    // reset dropdown state when creating a new record field.
    button.innerHTML = 'New Field'
    let container = button.xGetParentWithClass('container')

    // clear the title
    container.xGet('.x-record-title').value = ''

    // remove artifacts
    xgetn('.x-new-rec-fld').forEach((n) => {n.remove()})
}


// check the record edit dialogue before saving.
// event - event listener event
export function checkRecordEditDlg(event, allowCloneTitle) {
    // Check the record to make sure that is copacetic.
    // error info is reported by the data-check-failed attribute.
    // todo: check for blank title
    console.log('checking', event)
    let container = event.xGet('.container')
    let title = container.xGet('.x-record-title').value.trim()
    console.log('title', title)
    // allowCloneTitle is true when we know that the old record will be
    // removed so duplicates are okay
    if (!title && !allowCloneTitle) {
        // note: could use an attribute here to store error messages
        console.log('warning!', 'undefined record title')
        container.xAttr('data-check-failed', 'undefined record title')
        return
    }
    // todo: check for dup titles in the global list of records
    let recordsContainer = document.body.xGet('#records-accordion') // middle part of the document.
    let titleNormalized = title.trim().toLowerCase()
    let accordionItems = recordsContainer.xGetN('.accordion-item')
    // allowCloneTitle is true when we know that the old record will be
    // removed so duplicates are okay
    if (!allowCloneTitle && findRecord(title)) {
        container.xAttr('data-check-failed', `title already exists: "${title}"`)
        return
    }
    // use the dom record structure (defined in "save") to look for dups.
    // todo: add empty fields warning
    let flds = container.xGetN('.x-new-rec-fld')
    if (flds.length === 0) {
        // no fields were added.
        if (window.prefs.requireRecordFields) {
            container.xAttr('data-check-failed', 'no fields found')
        }
        return
    } else {
        for (let i=0; i<flds.length; i++) {
            //console.log(`fld[${i}]`, flds[i])
            let nameElem = flds[i].xGet('.x-fld-name')
            if (nameElem) {
                let name = nameElem.value.trim()
                if (!name) {
                    let msg = `undefined field name in record: ${title}`
                    console.log('warning!', msg)
                    container.xAttr('data-check-failed', msg)
                    return
                }
            }
            let valueElem = flds[i].xGet('.x-fld-value')
            if (valueElem) {
                let value = valueElem.value.trim()
                if (!value) {
                    let msg = `undefined field value in ${name} in record: ${title}`
                    //console.log('warning!', msg)
                    container.xAttr('data-check-failed', msg)
                    return
                }

                let type = valueElem.getAttribute('data-fld-type')
                if (type === 'url') {
                    if (!isURL(value)) {
                        let msg = `"${name}" is not a valid URL "${value}" in record: ${title}`
                        //console.log('warning!', msg)
                        container.xAttr('data-check-failed', msg)
                        return
                    }
                }
                // todo: for passwords check against min/max length
            }
        }
    }
}

// Make the record fields from the DOM structure of the
// of the popup dialogue described by the container argument.
function mkRecordFields(container) {
    let recordFields = []
    let flds = container.xGetN('.x-new-rec-fld')
    for (let i=0; i<flds.length; i++) {
        //console.log(`save.row[${i}]`, flds[i])
        let nameElem = flds[i].xGet('.x-fld-name')
        let valueElem = flds[i].xGet('.x-fld-value')
        if (!nameElem || !valueElem) {
            // This field was deleted but there was a '.x-new-rec-fld'
            // artifact.
            continue
        }
        let name = nameElem.value
        let type = valueElem.getAttribute('data-fld-type')
        let value = valueElem.value
        recordFields.push( mkRecordField(name, type, value) )
    }
    return recordFields
}

// save the record
export function saveRecordEditDlg(event, active, created) {
    let container = event.xGet('.container')
    //console.log('save', container)
    let rows = container.xGetN('.row')
    //console.log('save.rows', rows)
    let title = container.xGet('.x-record-title').value
    //console.log('save.title', title)
    // Create the accordion item with all of the record information.
    // Accordions in bootstrap only allow one to item to be expanded at a time.
    let recordFields = mkRecordFields(container)
    let newRecord = mkRecord(title, active, created, ...recordFields)
    if (active === true || !window.prefs.hideInactiveRecords) {
        insertRecord(newRecord, title);
    }
}

// edit an existing record.
// this is ephemeral, it is created when the record Edit button is clicked.
function editRecordDlg(title) {
    // Create the dynamic grid for the popup modal dialogue that is
    // used to define the new record.
    // Each record is defined by a title and fields.
    // The user updates the title and fields interactively.
    // Once they are done, they click the "Save" button
    // to save the record to the top level records accordion or
    // they click the "Close" button to abort.
    let body = mkRecordEditDlg(title)
    copyRecordFieldsToEditDlg(title, body, false)
    let closeButton = mkPopupModalDlgButton('Close',
                                          'btn-secondary',
                                          'close the dialogue with no changes',
                                          (event) => {
                                              //console.log(event)
                                              cleanRecordEditDlg(event)
                                              return true
                                          })
    let saveButton = mkPopupModalDlgButton('Save',
                                         'btn-primary',
                                         'save the changes and close the dialogue',
                                         (event) => {
                                             //console.log(event)
                                             checkRecordEditDlg(event, true)
                                             let container = event.xGet('.container')
                                             if (container.getAttribute('data-check-failed')) {
                                                 let msg = container.getAttribute('data-check-failed')
                                                 alert(`ERROR! ${msg}\nCANNOT SAVE RECORD`)
                                                 container.removeAttribute('data-check-failed')
                                                 return false
                                             } else {
                                                 let newTitle = container.xGet('.x-record-title').value.trim()
                                                 // Delete the old one before adding the new one.
                                                 let old = findRecord(title)
                                                 if (!!old) {
                                                     old.remove()
                                                 }
                                                 let active = true
                                                 let created = new Date().toISOString()
                                                 saveRecordEditDlg(event, active, created)
                                                 cleanRecordEditDlg(event)
                                                 searchRecords() // refresh
                                                 return true
                                     }
    })
    let e = mkPopupModalDlg('editRecordDlg', 'Edit Record', body, closeButton, saveButton)
    return e
}
