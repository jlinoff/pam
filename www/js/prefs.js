// preferences stuff
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { convertDictKeys2List, icon, mkPopupModalDlgButton, mkPopupModalDlg, sortDictByKey } from './utils.js'
import { updateRecordFieldTypes }  from './field.js'
import { refreshAbout } from './about.js'

// These are the input types that the tool knows how to handle.
export const VALID_FIELD_TYPES = {
    'datetime-local': 1,
    'email': 1,
    'password': 1,
    'phone': 1,
    'text': 1,
    'textarea': 1,
    'time': 1,
    'url': 1,
}

// These are the storage strategies that the tool understands.
export const VALID_STORAGE_STRATEGIES = {  // window.prefs.persistentStore
    'none': 1,
    'global': 1,
    'local': 1,
    'session': 1,
}

// Re-create the fields if a deletion occurred and
// the user click on "Close" without saving.
var delete_occurred = false

export function initPrefs() {
    window.prefs = {
        fileName: 'example.pam',
        filePass: '',
        searchCaseInsensitive: true,
        searchRecordTitles: true,
        searchRecordFieldNames: false,
        searchRecordFieldValues: false,
        passwordRangeLengthDefault: 20,
        passwordRangeMinLength: 12,
        passwordRangeMaxLength: 32,
        memorablePasswordWordSeparator: '/',
        memorablePasswordMinWordLength: 2,
        memorablePasswordMinWords: 3,
        memorablePasswordMaxWords: 5,
        memorablePasswordMaxTries: 10000,
        clearBeforeLoad: true,
        customAboutInfo: '',
        cloneFieldValues: true, // keep field values when cloning a record
        memorablePasswordPrefix: '', // common prefix for all memorable passwords
        memorablePasswordSuffix: '', // common suffix for all memorable passwords
        helpLink: './help/index.html', // link to the help page.
        projectLink: 'https://github.com/jlinoff/myvault', // link to the project page.
        // valid dup strategies are 'ignore', 'replace', 'allow'
        loadDupStrategy: 'ignore', // only used if clearBeforeLoad is false
        logStatusToConsole: false, // tee the status to console.log
        statusMsgDurationMS: 1500, // status message duration.
        predefinedRecordFields: { // key=name and value=type
            'account': 'text',
            'datetime': 'datetime-local',
            'email': 'email',
            'host': 'text',
            'key': 'password',
            'login': 'text',
            'name': 'text',
            'note': 'textarea',
            'number': 'number',
            'phone': 'phone',
            'password': 'password',
            'secret': 'password',
            'text': 'text',
            'textarea': 'textarea',
            'time': 'time',
            'url': 'url',
            'username': 'text',
        },
        predefinedRecordFieldsDefault: 'text',
        persistentStore: 'global',  // options: none, global, local, session
    }
    setHelpLinks()
}

function mkFieldset(legend) {
    return xmk('fieldset')
        .xClass('border', 'border-dark', 'p-2')
        .xAppend(
            xmk('legend')
                .xClass('float-none', 'w-auto', 'fs-5', 'px-2')
                .xInnerHTML(legend)
        )
}

export function menuPrefsDlg() {
    let labelClasses = ['col-9']
    let inputClasses = ['col-3']
    let helpLink = `<a href="window.prefs.helpLink" target="_blank">Help</a>`
    let fldsList = predefinedRecordFields()
    let body = xmk('span').xAppendChild(
        xmk('p').xInnerHTML(`See the ${helpLink} documentation for detailed information.`),
        // miscellaneous
        mkFieldset('Search').xAppend(
            prefSearchCaseInsensitive(labelClasses, inputClasses),
            prefSearchRecordTitles(labelClasses, inputClasses),
            prefSearchRecordFieldNames(labelClasses, inputClasses),
            prefSearchRecordFieldValues(labelClasses, inputClasses),
        ),
        mkFieldset('Passwords').xAppend(
            prefPasswordRangeMinLength(labelClasses, inputClasses),
            prefPasswordRangeMaxLength(labelClasses, inputClasses),
            prefMemorablePasswordMinWordLength(labelClasses, inputClasses),
            prefMemorablePasswordWordSeparator(labelClasses, inputClasses),
            prefMemorablePasswordMinWords(labelClasses, inputClasses),
            prefMemorablePasswordMaxWords(labelClasses, inputClasses),
            prefMemorablePasswordMaxTries(labelClasses, inputClasses),
            prefMemorablePasswordPrefix(labelClasses, inputClasses),
            prefMemorablePasswordSuffix(labelClasses, inputClasses),
            //prefProjectLink(['col-2'],['col-10']),  // user cannot change this
            //prefHelpLink(['col-2'],['col-10']),  // user cannot change this
        ),
        mkFieldset('Miscellaneous').xAppend(
            prefStatusMsgDurationMS(labelClasses, inputClasses),
            prefLogStatusToConsole(labelClasses, inputClasses),
            prefClearBeforeLoad(labelClasses, inputClasses),
            prefLoadDupStrategy(labelClasses, inputClasses),
            prefCloneFieldValues(labelClasses, inputClasses),
            prefStorageStrategy(labelClasses, inputClasses),
            prefCustomAboutInfo(['col-2'],['col-10']),
        ),
        // record fields
        mkFieldset('Record Fields').xAppend(
            xmk('p').xInnerHTML('These are the fields pre-defined to simplify creating a new record.'),
            fldsList),
    )
    let b1 = mkPopupModalDlgButton('Close',
                                 'btn-secondary',
                                 'close the dialogue without making changes',
                                 (el) => {
                                     //console.log(el)
                                     if (delete_occurred) {
                                         // make sure that the deleted items are restored
                                         // if the user closes without saving.
                                         let old_div = document.body.xGet('#x-prefs-fld-div')
                                         let new_div = predefinedRecordFields()
                                         old_div.replaceWith(new_div)
                                     }
                                     delete_occurred = false
                                     return true
                                 })
    let b2 = mkPopupModalDlgButton('Save',
                                 'btn-primary',
                                 'save using the preferences',
                                   (el) => {
                                       delete_occurred = false
                                       return setPrefs(el)
                                   })
    let e = mkPopupModalDlg('menuPrefsDlg', 'Preferences', body, b1, b2)
    return e
}

// set the help links
function setHelpLinks() {
    let helpLink = `<a href="${window.prefs.helpLink}" target="_blank">Help</a>`
    xgetn('.x-help-link').forEach( (e) => { e.innerHTML = helpLink })
    let projectLink = `<a href="${window.prefs.projectLink}" target="_blank">Project</a>`
    xgetn('.x-project-link').forEach( (e) => { e.innerHTML = projectLink })
}

// Set the preferences
function setPrefs(el) {
    //console.log(el)
    // add logic to set window.prefs.* here
    let prefs = el.xGetN('[data-pref-id]')
    for (const pref of prefs) {
        //console.log('PREF:', pref.getAttribute('data-pref-id'))
        //console.log(pref)
        let type = pref.tagName
        let key = pref.getAttribute('data-pref-id')
        //console.log(`TYPE: ${type}`)
        //console.log(`VAR: window.prefs["${key}"]`)
        if (type === 'INPUT') {
            // inputs are easy.
            let value = pref.value
            //console.log(`${type} - window.prefs["${key}"] = "${value}"`)
            window.prefs[key] = value
        } else if (type === 'BUTTON') {
            let icon = pref.xGet('i')
            let value = false
            if (icon) {
                //console.log(icon)
                //console.log(icon.classList)
                value = icon.classList.contains('bi-check2-square')
                //console.log(value)
            }
            switch(key) {
            case 'loadDupStrategy':
                let dropdown_menu = pref.parentElement.xGet('.dropdown-menu')
                let active = dropdown_menu.xGet('.active')
                value = active.innerHTML
                //console.log(`ACTIVE: ${active}`)
                //console.log(`${type} - window.prefs["${key}"] = "${value}"`)
                break
            default:
                window.prefs[key] = value
                //console.log(`${type} - window.prefs["${key}"] = "${value}"`)
                break
            }
        } else if (type === "TEXTAREA") {
            if (key === 'customAboutInfo') {
                let about = document.body.xGet('#x-about-info')
                about.innerHTML = pref.value
            }
            window.prefs[key] = pref.value
            //console.log(`${type} - window.prefs["${key}"] = "${value}"`)
        }
    }
    setHelpLinks()

    // Set the pre-defined fields for use in creating records.
    let flds = el.xGetN('.x-pref-fld-row')
    window.prefs.predefinedRecordFields = {}
    for (const fld of flds) {
        let name = fld.xGet('.x-fld-name').value.trim()
        let value = fld.xGet('.dropdown-toggle').innerHTML.trim() // can never be empty
        if (!name || name.length === 0) {
            alert(`ERROR: empty field name found`)
            return false
        }
        if (name in window.prefs.predefinedRecordFields) {
            alert(`ERROR: duplicate field name found: "${name}"`)
            return false
        }
        window.prefs.predefinedRecordFields[name] = value
    }
    refreshAbout()
    return true
}

function setActive(event) {
    let dm = event.target.xGetParentWithClass('dropdown-menu')
    let ppa = dm.xGet('.active')
    ppa.classList.remove('active')
    event.target.classList.add('active')
}

function prefCustomAboutInfo(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Custom About'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('textarea')
                    .xClass('form-control')
                    .xAttrs({'type': 'button',
                             'title': 'custom about information',
                             'placeholder': 'HTML custom about information',
                             'data-pref-id': 'customAboutInfo',
                            })
            ),
        ),
    )
}

function prefStatusMsgDurationMS(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Status Message Duration (milliseconds)'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xId('x-prefs-status-msg-duration-ms')
                    .xClass('form-control', 'text-end')
                    .xAttrs({'type': 'number',
                             'value': window.prefs.statusMsgDurationMS,
                             'min': 500,
                             'max': 30000,
                             'title': `min=500, max=30000`,
                             'data-pref-id': 'statusMsgDurationMS',
                            })
            ),
        ),
    )
}

function prefLogStatusToConsole(labelClasses, inputClasses) {
    let checkbox = window.prefs.logStatusToConsole ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Log Status to the Console'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'title': 'duplicate status to the console',
                             'data-pref-id': 'logStatusToConsole',
                            })
                    .xAppend(icon(checkbox, 'enable or disable'))
                    .xAddEventListener('click', (event) => {
                        //console.log(event)
                        //console.log(event.target.parentElement.tagName)
                        let button = event.target.xGetParentOfType('button')
                        let icon = button.xGet('i')
                        let enabled = icon.classList.contains('bi-check2-square')
                        let mbody = event.target.xGetParentWithClass('modal-body')
                        if (enabled) {
                            icon.classList.remove('bi-check2-square')
                            icon.classList.add('bi-square')
                            let msg = 'do not log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        }
                    }),
            ),
        ),
    )
}

function prefClearBeforeLoad(labelClasses, inputClasses) {
    let checkbox = window.prefs.clearBeforeLoad ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Clear Records On Load'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'title': 'clear records before loading',
                             'data-pref-id': 'clearBeforeLoad',
                            })
                    .xAppend(icon(checkbox, 'enable or disable'))
                    .xAddEventListener('click', (event) => {
                        //console.log(event)
                        //console.log(event.target.parentElement.tagName)
                        let button = event.target.xGetParentOfType('button')
                        let icon = button.xGet('i')
                        let enabled = icon.classList.contains('bi-check2-square')
                        let mbody = event.target.xGetParentWithClass('modal-body')
                        let row = mbody.xGet('#x-prefs-load-dup-row')
                        if (enabled) {
                            icon.classList.remove('bi-check2-square')
                            icon.classList.add('bi-square')
                            let msg = 'do not clear records before loading'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                            if (row.classList.contains('d-none')) {
                                row.classList.remove('d-none')
                            }
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'clear records before loading enabled'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                            if (!row.classList.contains('d-none')) {
                                row.classList.add('d-none')
                            }
                        }
                    }),
            ),
        ),
    )
}

function prefLoadDupStrategy(labelClasses, inputClasses) {
    let visible = window.prefs.clearBeforeLoad ? 'd-none' : ''
    return xmk('div').xClass('row', visible).xId('x-prefs-load-dup-row').xAppend(
        prefLabel(labelClasses, 'Load Duplicate Record Strategy'),
        xmk('div').xClass(...inputClasses).xAppend(
            // Load duplication strategy
            xmk('div').xClass('dropdown').xAppend(
                xmk('button')
                    .xId('x-prefs-load-dup-button')
                    .xClass('btn', 'dropdown-toggle')
                    .xAttrs({
                        'data-bs-toggle': 'dropdown',
                        'aria-expanded': 'false',
                        'type': 'button',
                        'data-pref-id': 'loadDupStrategy',
                    })
                    .xInnerHTML('ignore'),
                xmk('ul')
                    .xAttrs({'aria-labelledby': 'x-prefs-load-dup-button'})
                    .xClass('dropdown-menu')
                    .xAppend(
                        xmk('li').xClass('dropdown-item')
                            .xAttr('href', '#')
                            .xInnerHTML('allow')
                            .xAddEventListener('click', (event) => {
                                let button = event.target.xGetParentWithClass('dropdown').xGet('button')
                                button.innerHTML = event.target.innerHTML
                                setActive(event)
                            }),
                        xmk('li').xClass('dropdown-item', 'active')
                            .xAttr('href', '#')
                            .xInnerHTML('ignore')
                            .xAddEventListener('click', (event) => {
                                let button = event.target.xGetParentWithClass('dropdown').xGet('button')
                                button.innerHTML = event.target.innerHTML
                                setActive(event)
                            }),
                        xmk('li').xClass('dropdown-item')
                            .xAttr('href', '#')
                            .xInnerHTML('replace')
                            .xAddEventListener('click', (event) => {
                                let button = event.target.xGetParentWithClass('dropdown').xGet('button')
                                button.innerHTML = event.target.innerHTML
                                setActive(event)
                            }),
                    ),
            ),
        ),
    )
}

function prefCloneFieldValues(labelClasses, inputClasses) {
    let checkbox = window.prefs.cloneFieldValues ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Clone Field Values when Cloning Records'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'data-pref-id': 'cloneFieldValues',
                            })
                    .xAppend(icon(checkbox, 'enable or disable'))
                    .xAddEventListener('click', (event) => {
                        let button = event.target.xGetParentOfType('button')
                        let icon = button.xGet('i')
                        let enabled = icon.classList.contains('bi-check2-square')
                        let mbody = event.target.xGetParentWithClass('modal-body')
                        if (enabled) {
                            icon.classList.remove('bi-check2-square')
                            icon.classList.add('bi-square')
                            let msg = 'clone field values when cloning records'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'do not clone field values when cloning records'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        }
                    }),
            ),
        ),
    )
}

function prefStorageStrategy(labelClasses, inputClasses) {
    let value = window.prefs.persistentStore
    let list_items = []
    Object.entries(VALID_STORAGE_STRATEGIES).forEach(([key1,value1]) => {
        let a  = xmk('a')
            .xAttrs({'href': '#'})
            .xClass('dropdown-item')
            .xInnerHTML(key1)
            .xAddEventListener('click', (event) => {
                setActive(event)
                let new_value = event.target.innerHTML
                let dm = event.target.xGetParentWithClass('dropdown-menu')
                let button = dm.parentElement.xGet('.dropdown-toggle')
                button.innerHTML = new_value
                window.prefs.persistentStore = new_value
            })
        if (key1 === value) {
            a.xClass('active')
        }
        list_items.push(
            xmk('li').xAppend(a)
        )
    })
    let dropdown_id = `x-prefs-storage-type-dropdown`
    let dropdown = xmk('div').xAppend(
        xmk('button')
            .xId(dropdown_id)
            .xAttrs({
                'type': 'button',
                'data-bs-toggle': 'dropdown',
                'aria-expanded': false,
            })
            .xClass('btn', 'btn-secondary', 'dropdown-toggle')
            .xInnerHTML(value),
        xmk('ul')
            .xAttrs({'aria-labelledby': dropdown_id})
            .xClass('dropdown-menu')
            .xAppend(...list_items)
    )
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Interactive Storage Strategy'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                dropdown
            ),
            xmk('br')
        )
    )
}

function prefSearchCaseInsensitive(labelClasses, inputClasses) {
    let checkbox = window.prefs.searchCaseInsensitive ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Case Insensitive Searches'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'title': 'do case insensitiv searches',
                             'data-pref-id': 'searchCaseInsensitive',
                            })
                    .xAppend(icon(checkbox, 'enable or disable'))
                    .xAddEventListener('click', (event) => {
                        //console.log(event)
                        //console.log(event.target.parentElement.tagName)
                        let button = event.target.xGetParentOfType('button')
                        let icon = button.xGet('i')
                        let enabled = icon.classList.contains('bi-check2-square')
                        let mbody = event.target.xGetParentWithClass('modal-body')
                        if (enabled) {
                            icon.classList.remove('bi-check2-square')
                            icon.classList.add('bi-square')
                            let msg = 'do not log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        }
                    }),
            ),
        ),
    )
}

function prefSearchRecordTitles(labelClasses, inputClasses) {
    let checkbox = window.prefs.searchRecordTitles ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Search Record Titles'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'title': 'search record titles',
                             'data-pref-id': 'searchRecordTitles',
                            })
                    .xAppend(icon(checkbox, 'enable or disable'))
                    .xAddEventListener('click', (event) => {
                        //console.log(event)
                        //console.log(event.target.parentElement.tagName)
                        let button = event.target.xGetParentOfType('button')
                        let icon = button.xGet('i')
                        let enabled = icon.classList.contains('bi-check2-square')
                        let mbody = event.target.xGetParentWithClass('modal-body')
                        if (enabled) {
                            icon.classList.remove('bi-check2-square')
                            icon.classList.add('bi-square')
                            let msg = 'do not log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        }
                    }),
            ),
        ),
    )
}

function prefSearchRecordFieldNames(labelClasses, inputClasses) {
    let checkbox = window.prefs.searchRecordFieldNames ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Search Record Field Names'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'title': 'search record field names',
                             'data-pref-id': 'searchRecordFieldNames',
                            })
                    .xAppend(icon(checkbox, 'enable or disable'))
                    .xAddEventListener('click', (event) => {
                        //console.log(event)
                        //console.log(event.target.parentElement.tagName)
                        let button = event.target.xGetParentOfType('button')
                        let icon = button.xGet('i')
                        let enabled = icon.classList.contains('bi-check2-square')
                        let mbody = event.target.xGetParentWithClass('modal-body')
                        if (enabled) {
                            icon.classList.remove('bi-check2-square')
                            icon.classList.add('bi-square')
                            let msg = 'do not log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        }
                    }),
            ),
        ),
    )
}

function prefSearchRecordFieldValues(labelClasses, inputClasses) {
    let checkbox = window.prefs.searchRecordFieldValues ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Search Record Field Values'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'title': 'search record field values',
                             'data-pref-id': 'searchRecordFieldValues',
                            })
                    .xAppend(icon(checkbox, 'enable or disable'))
                    .xAddEventListener('click', (event) => {
                        //console.log(event)
                        //console.log(event.target.parentElement.tagName)
                        let button = event.target.xGetParentOfType('button')
                        let icon = button.xGet('i')
                        let enabled = icon.classList.contains('bi-check2-square')
                        let mbody = event.target.xGetParentWithClass('modal-body')
                        if (enabled) {
                            icon.classList.remove('bi-check2-square')
                            icon.classList.add('bi-square')
                            let msg = 'do not log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'log status to console'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        }
                    }),
            ),
        ),
    )
}

function prefPasswordRangeMinLength(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Minimum Password Length'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xId('x-prefs-password-length-minimum')
                    .xClass('form-control', 'text-end')
                    .xAttrs({'type': 'number',
                             'value': window.prefs.passwordRangeMinLength,
                             'min': 4,
                             'max': 39,
                             'title': 'min=4, max=39',
                             'data-pref-id': 'passwordRangeMinLength',
                            })
                    .xAddEventListener('change', (event) => {
                        if (event.target.value > window.prefs.passwordRangeMaxLength) {
                            event.target.value = window.prefs.passwordRangeMaxLength
                        }
                    })
                    .xAddEventListener('input', (event) => {
                        if (event.target.value > window.prefs.passwordRangeMaxLength) {
                            event.target.value = window.prefs.passwordRangeMaxLength
                        }
                    }),
            ),
        ),
    )
}

function prefPasswordRangeMaxLength(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Maximum Password Length'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xId('x-prefs-password-length-maximum')
                    .xClass('form-control', 'text-end')
                    .xAttrs({'type': 'number',
                             'value': window.prefs.passwordRangeMaxLength,
                             'min': 5,
                             'max': 40,
                             'title': `min=5, max=40`,
                             'data-pref-id': 'passwordRangeMaxLength',
                            })
                    .xAddEventListener('change', (event) => {
                        if (event.target.value <= window.prefs.passwordRangeMinLength) {
                            event.target.value = window.prefs.passwordRangeMinLength
                        }
                    })
                    .xAddEventListener('input', (event) => {
                        if (event.target.value <= window.prefs.passwordRangeMinLength) {
                            event.target.value = window.prefs.passwordRangeMinLength
                        }
                    }),
            ),
        ),
    )
}

function prefMemorablePasswordMinWordLength(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Memorable Password Min Word Length'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-end')
                    .xAttrs({'type': 'number',
                             'value': window.prefs.memorablePasswordMinWordLength,
                             'title': 'minimum word length in memorable passwords',
                             'data-pref-id': 'memorablePasswordMinWordLength',
                            }),
            ),
        ),
    )
}

function prefMemorablePasswordWordSeparator(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Memorable Password Word Separator'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-start')
                    .xAttrs({'type': 'text',
                             'value': window.prefs.memorablePasswordWordSeparator,
                             'title': 'string used to separate words in memorable passwords',
                             'data-pref-id': 'memorablePasswordWordSeparator',
                            }),
            ),
        ),
    )
}

function prefMemorablePasswordMinWords(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Memorable Password Min Words'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-end')
                    .xAttrs({'type': 'number',
                             'value': window.prefs.memorablePasswordMinWords,
                             'title': 'minimum number of words in memorable passwords',
                             'data-pref-id': 'memorablePasswordMinWords',
                            }),
            ),
        ),
    )
}

function prefMemorablePasswordMaxWords(labelClasses, inputClasses) {
    xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Memorable Password Max Words'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-end')
                    .xAttrs({'type': 'number',
                             'value': window.prefs.memorablePasswordMaxWords,
                             'title': 'maximum number of words in memorable passwords',
                             'data-pref-id': 'memorablePasswordMaxWords',
                            })
            ),
        ),
    )
}

function prefMemorablePasswordMaxTries(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Memorable Password Max Tries'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-end')
                    .xAttrs({'type': 'number',
                             'value': window.prefs.memorablePasswordMaxTries,
                             'title': 'maximum number of tries to generate a memorable password',
                             'data-pref-id': 'memorablePasswordMaxTries',
                            })
            ),
        ),
    )
}

function prefMemorablePasswordPrefix(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Memorable Password Prefix'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-start')
                    .xAttrs({'type': 'text',
                             'value': window.prefs.memorablePasswordPrefix,
                             'title': 'common prefix for memorable passwords',
                             'data-pref-id': 'memorablePasswordPrefix',
                            }),
            ),
        ),
    )
}

function prefMemorablePasswordSuffix(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Memorable Password Suffix'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-start')
                    .xAttrs({'type': 'text',
                             'value': window.prefs.memorablePasswordSuffix,
                             'title': 'common suffix for memorable passwords',
                             'data-pref-id': 'memorablePasswordSuffix',
                            }),
            ),
        ),
    )
}

function prefHelpLink(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Help Link'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-start')
                    .xAttrs({'type': 'text',
                             'value': window.prefs.helpLink,
                             'title': 'link to help',
                             'data-pref-id': 'helpLink',
                            }),
            ),
        ),
    )
}

function prefProjectLink(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Project Link'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-start')
                    .xAttrs({'type': 'text',
                             'value': window.prefs.projectLink,
                             'title': 'link to project',
                             'data-pref-id': 'projectLink',
                            }),
            ),
        ),
    )
}

function prefLabel(labelClasses, title) {
    return xmk('div').xClass(...labelClasses).xAppend(
        xmk('label')
            .xClass('col-form-label')
            .xInnerHTML(title)
    )
}

function predefinedRecordFields() {
    // Display the pre-defined record, allow them to be modified or deleted.
    let fldsList = xmk('div').xId('x-prefs-fld-div')
    let sorted_dict = sortDictByKey(window.prefs.predefinedRecordFields)
    Object.entries(sorted_dict).forEach(([key,value]) => {
        if ( fldsList.length === 0 ) {
            let hdr =  xmk('div').xClass('row').xAppend(
                xmk('div').xClass('col', 'col-4').xAppend(
                    xmk('span').xClass('fw-bold').xInnerHTML('Field Name')
                ),
                xmk('div').xClass('col', 'col-4').xAppend(
                    xmk('span').xClass('fw-bold').xInnerHTML('Field Value')
                ),
                xmk('div').xClass('col', 'col-4').xAppend(
                    xmk('span').xClass('fw-bold').xInnerHTML('Field Options')
                ),
            )
            fldsList.xAppend(hdr)
        }
        let list_items = []
        Object.entries(VALID_FIELD_TYPES).forEach(([key1,value1]) => {
            let a  = xmk('a')
                .xAttrs({'href': '#'})
                .xClass('dropdown-item')
                .xInnerHTML(key1)
                .xAddEventListener('click', (event) => {
                    setActive(event)
                    let value = event.target.innerHTML
                    //console.log(value)
                    let dm = event.target.xGetParentWithClass('dropdown-menu')
                    //console.log(dm)
                    //console.log(dm.parentElement)
                    let button = dm.parentElement.xGet('.dropdown-toggle')
                    //console.log(button)
                    button.innerHTML = value
                })
            if (key1 === value) {
                a.xClass('active')
            }
            list_items.push(
                xmk('li').xAppend(a)
            )
        })
        let keyu = encodeURIComponent(key)
        let dropdown_id = `x-prefs-type-dropdown-${keyu}`
        let dropdown = xmk('div').xAppend(
            xmk('button')
                .xId(dropdown_id)
                .xAttrs({
                    'type': 'button',
                    'data-bs-toggle': 'dropdown',
                    'aria-expanded': false,
                })
                .xClass('btn', 'btn-secondary', 'dropdown-toggle')
                .xInnerHTML(value),
            xmk('ul')
                .xAttrs({'aria-labelledby': dropdown_id})
                .xClass('dropdown-menu')
                .xAppend(...list_items)
        )
        let tooltip = `delete this field (${key})`
        let tooltip2 = `update this field (${key})`
        let fld = xmk('div').xClass('row','x-pref-fld-row').xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('div').xClass('col', 'col-4').xAppend(
                    xmk('input').xClass('form-control', 'x-fld-name').xAttrs({'value': key})
                ),
                xmk('div').xClass('col', 'col-4').xAppend(
                    dropdown
                    //xmk('input').xClass('form-control', 'x-fld-value').xAttrs({'value': value})
                ),
                xmk('div').xClass('col', 'col-1').xAppend(
                    xmk('button')
                        .xClass('btn', 'btn-lg', 'form-control', 'text-start')
                        .xAttrs({
                            'type': 'button',
                            'title': tooltip,
                        })
                        .xAppend(icon('bi-trash3-fill', tooltip))
                        .xAddEventListener('click', (event) => {
                            let row = event.target.xGetParentWithClass('row')
                            row.remove()
                            // restore it if the user click "Close" without saving
                            delete_occurred = true
                        }),
                ),
            ),
        )
        fldsList.xAppend(fld)
    })

    // Add new field inputs and button.
    let tooltip = 'add new field'
    let newfld = xmk('div').xClass('row').xAppend(
         xmk('div').xClass('col', 'col-12').xAppend(
             xmk('button')
                 .xClass('btn', 'btn-lg', 'form-control', 'text-center', 'fs-5')
                 .xAttrs({
                     'type': 'button',
                     'title': tooltip,
                 })
                 .xAppend(icon('bi-plus-circle', tooltip),
                          xmk('span').xInnerHTML('&nbsp;Add New Field'))
                 .xAddEventListener('click', (event) => {
                     let idn = 0
                     let new_value = 'text'
                     let base = 'AAA'
                     let new_key = base + idn.toString(16).padStart(4, '0')
                     while (new_key in window.prefs.predefinedRecordFields) {
                         idn += 1
                         new_key = base + idn.toString(16).padStart(4, '0')
                     }
                     window.prefs.predefinedRecordFields[new_key] = new_value
                     let div = document.body.xGet('#x-prefs-fld-div')
                     div.replaceWith(predefinedRecordFields())
                     updateRecordFieldTypes()
                 }),
         ),
    )
    fldsList.xPrepend(newfld)
    return fldsList
}
