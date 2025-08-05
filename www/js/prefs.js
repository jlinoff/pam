// preferences stuff
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { convertDictKeys2List, icon, mkPopupModalDlgButton, mkPopupModalDlg, sortDictByKey } from './utils.js'
import { updateRecordFieldTypes, mkRecordEditField }  from './field.js'
import { refreshAbout } from './about.js'
import { enablePrinting } from './print.js'
import { enableSaveFile } from './save.js'
import { setDarkLightTheme } from './utils.js'
import { searchRecords } from './search.js'

// These are the input types that the tool knows how to handle.
export const VALID_FIELD_TYPES = {
    'datetime-local': 1,
    'email': 1,
    'html': 1,
    'password': 1,
    'phone': 1,
    'text': 1,
    'textarea': 1,
    'time': 1,
    'url': 1,
}

// These are the storage strategies that the tool understands.
export const VALID_CACHE_STRATEGIES = {  // window.prefs.filePassCache
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
        // Use the '.txt' extension because the '.pam' extension
        // does not work on some mobile devices.
        themeName: 'dark', // choices are dark or light
        enablePrinting: false,
        enableSaveFile: true,
        fileName: 'example.txt',
        filePass: '',
        filePassCache: 'local',  // options: none, global, local, session
        editableFieldName: false, // if true, allow field names to be changed
        searchCaseInsensitive: true,
        searchRecordTitles: true,
        searchRecordFieldNames: false,
        searchRecordFieldValues: false,
        hideInactiveRecords: true, // hide inactive records if true
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
        projectLink: 'https://github.com/jlinoff/pam', // link to the project page.
        // valid dup strategies are 'ignore', 'replace', 'allow'
        loadDupStrategy: 'ignore', // only used if clearBeforeLoad is false
        logStatusToConsole: false, // tee the status to console.log
        statusMsgDurationMS: 1500, // status message duration.
        predefinedRecordFields: { // key=name and value=type
            'account': 'text',
            'datetime': 'datetime-local',
            'email': 'email',
            'host': 'text',
            'html': 'html',
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
        requireRecordFields: false,
        lockPreferencesPassword: '',
        defaultRecordFields: '',
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
    let fldsList = mkRecordFields(window.prefs.predefinedRecordFields)
    let body = xmk('span').xAppendChild(
        prefPromptDesc(`See the ${helpLink} documentation for detailed information. `+
                       'No changes are saved until you <code>Save</code> at the bottom of the page. '+
                       'Choose <code>Close</code> to quit without saving changes.'),
        mkFieldset('Search').xAppend(
            prefSearchCaseInsensitive(labelClasses, inputClasses),
            prefSearchRecordTitles(labelClasses, inputClasses),
            prefSearchRecordFieldNames(labelClasses, inputClasses),
            prefSearchRecordFieldValues(labelClasses, inputClasses),
            prefPromptDesc('Use caution when enabling this option because '+
                           'if you search for something like <code>ttp</code> '+
                           'every record that has <code>https://</code> in the '+
                           'url field will be displayed.'),
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
            prefPromptDesc('The preferences in this section probably do not '+
                           'need to be changed unless you really know what you are doing.'),
            prefStatusMsgDurationMS(labelClasses, inputClasses),
            prefLogStatusToConsole(labelClasses, inputClasses),
            prefClearBeforeLoad(labelClasses, inputClasses),
            prefLoadDupStrategy(labelClasses, inputClasses),
            prefCloneFieldValues(labelClasses, inputClasses),
            prefRequireRecordFields(labelClasses, inputClasses),
            prefEditableFieldName(labelClasses, inputClasses),
            prefFilePassCacheStrategy(labelClasses, inputClasses),
        ),
        // record fields
        mkFieldset('Record Fields').xAppend(
            prefPromptDesc('These are the fields pre-defined to simplify creating a new record. '+
                           'It is unlikely that you would want to change these unless you want '+
                           'a set of unique fields for a custom environment.'),
            xmk('p').xInnerHTML(),
            fldsList),
        // Administration stuff - at the very end to make it somewhat non-obvious
        mkFieldset('Administration').xAppend(
            //prefLockPreferencesPassword(labelClasses, inputClasses),
            prefLockPreferencesPassword(['col-4'],['col-8']),
            prefPromptDesc('Setting this password will lock the preferences so that '+
                           'users who do not know this password cannot change them. '+
                           'This allows an administrator to disable printing and saving. '+
                           'This password is encrypted but it is stored in the PAM file '+
                           'so it is not as secure as the master password. '+
                           'Only set it in a secure environment.'),
            prefDefaultRecordFields(['col-4'],['col-8']),
            prefPromptDesc('These are the default fields defined for each new record '+
                           'entered as a comma separated list of field names. '+
                           'A common example would be: <code>url,login,password</code>.'),
            prefEnablePrinting(labelClasses, inputClasses),
            prefPromptDesc('Enable or disable the menu <code>Print</code> operation. Being able to print records '+
                           'could be a security risk because all of the printed information is decrypted.'),
            prefEnableSaveFile(labelClasses, inputClasses),
            prefPromptDesc('Enable or disable the menu <code>Save File</code> operation. '+
                           'Being able to save a private copy of the records '+
                           'could be a security risk. When the user disables this preference it does '+
                           'not remove the <code>Save File</code> entry from the menu '+
                           'immediately after the preferences are saved. '+
                           'If it did, you would never be able to save it persistently in the file. '+
                           'Instead it allows the file save operation to succeed but the next time the file '+
                           'is loaded the <code>Save File</code> will <i>not<i> appear in the menu.'),
            prefHideInactiveRecords(labelClasses, inputClasses),
            prefPromptDesc('Making records inactive is very much like deleting them. '+
                           'The only difference is that even though they are no longer visible '+
                           'a historical record of them is kept if this preference is enabled.'),
            prefCustomAboutInfo(['col-2'],['col-10']),
            prefPromptDesc('This allows you to add custom information to the <code>About</code> page. '+
                           'Typically you might add something like administrator contact information. '+
                           'An example would be <code>This implementation supported by admin@example.com</code>.')
        ),
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
                                         let new_div = mkRecordFields(window.prefs.predefinedRecordFields)
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
                                       return savePrefs(el)
                                   })
    let e = mkPopupModalDlg('menuPrefsDlg', 'Preferences', body, b1, b2)
    e.xAddEventListener('show.bs.modal', (event) => {
        // do this each time the prefs modal popup pops up
        let div = document.body.xGet('#x-prefs-fld-div')
        let flds = mkRecordFields(window.prefs.predefinedRecordFields)
        div.replaceWith(flds)
        setDarkLightTheme(window.prefs.themeName) // fix the new DOM elements
    })
    return e
}

function prefPromptDesc(msg) {
    return xmk('p')
        .xStyle({'margin-left': '5em', 'margin-right': '5em', 'font-size':'smaller'})
        .xInnerHTML(msg)
}

export function addDefaultRecordFields() {
    // Create the default record fields.
    let menu = document.getElementById('menuNewDlg')
    let body = menu.getElementsByClassName('container')[0]
    // Clear the existing default record fields before adding new ones.
    // This is quite specific because we want to keep the first two entries.
    if (body.children.length > 2) {
        // Reverse iteration is required because the list changes are dynamic.
        for (let i=body.children.length-1; i>1; i--) {
            let child = body.children[i]
            body.removeChild(child)
        }
    }
    // Now add the default record fields.
    if (!!window.prefs.defaultRecordFields) {
        let items = window.prefs.defaultRecordFields.split(',')
        for (let i=0; i<items.length; i++) {
            let name = items[i].trim()
            if (window.prefs.predefinedRecordFields.hasOwnProperty(name)) {
                let type = window.prefs.predefinedRecordFields[name]
                let value = ''
                let fld = mkRecordEditField(name, type, body, value)
                body.xAppend(fld)
            }
        }
    }
}

function checkDefaultRecordFields(show) {
    let valid = ''
    let missing = false
    if (!!window.prefs.defaultRecordFields) {
        let items = window.prefs.defaultRecordFields.split(',')
        for (let i=0; i<items.length; i++) {
            let name = items[i].trim()
            if (!window.prefs.predefinedRecordFields.hasOwnProperty(name)) {
                missing = true
                alert(`ERROR: Default record field "${name}"\n`+
                      'is not a valid field it will be ignored.')
            } else {
                if (valid.length > 0) {
                    valid += ',' + name
                } else  {
                    valid = name
                                                   }
            }
        }
        // Used the list built up list with the trimmed entries
        window.prefs.defaultRecordFields = valid
    }
    addDefaultRecordFields()
    return !missing
}

// set the help links
function setHelpLinks() {
    let helpLink = `<a href="${window.prefs.helpLink}" target="_blank">Help</a>`
    xgetn('.x-help-link').forEach( (e) => { e.innerHTML = helpLink })
    let projectLink = `<a href="${window.prefs.projectLink}" target="_blank">Project</a>`
    xgetn('.x-project-link').forEach( (e) => { e.innerHTML = projectLink })
}

// Set the preferences
// The window.prefs entries are determined automatically from the
// data-pref-id attribute.
function savePrefs(el) {
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
                window.prefs.customAboutInfo = pref.value
            } else {
                window.prefs[key] = pref.value
                //console.log(`${type} - window.prefs["${key}"] = "${value}"`)
            }
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
    let sorted = sortDictByKey(window.prefs.predefinedRecordFields)
    window.prefs.predefinedRecordFields = sorted
    refreshAbout()
    enablePrinting()

    // WIP:
    // The logic is here is a bit tricky.
    // The idea is to only disable the "Save File" entry on load not
    // immediately after it is set in preferences. The reason for this
    // is that disabling it immediately makes it impossible to
    // actually save the file but you also want to be able to enable it
    // immediately. So the idea is to defer the disable operation but not
    // the enable operation.
    if (window.prefs.enableSaveFile) {
        enableSaveFile()
    }

    setDarkLightTheme(window.prefs.themeName)
    searchRecords()  // refresh
    return checkDefaultRecordFields(true)
}

function setActive(event) {
    let dm = event.target.xGetParentWithClass('dropdown-menu')
    let ppa = dm.xGet('.active')
    ppa.classList.remove('active')
    event.target.classList.add('active')
}

function prefDefaultRecordFields(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Default Record Fields'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-start')
                    .xAttrs({'type': 'text',
                             'value': window.prefs.defaultRecordFields,
                             'title': 'list of default fields',
                             'data-pref-id': 'defaultRecordFields',
                            }),
            ),
        ),
    )
}

function prefLockPreferencesPassword(labelClasses, inputClasses) {
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, 'Lock Preferences Password'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('input')
                    .xClass('form-control', 'text-start')
                    .xAttrs({'type': 'text',
                             'value': window.prefs.lockPreferencesPassword,
                             'title': 'password that locks preferences',
                             'data-pref-id': 'lockPreferencesPassword',
                            }),
            ),
        ),
    )
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
                             'placeholder': 'HTML custom information that shows up in the About page',
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
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'logStatusToConsole',
                           'Log Status to the Console',
                           'duplicate status to the console')
}

function prefClearBeforeLoad(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'clearBeforeLoad',
                           'Clear Records On Load',
                           'clear records before loading')
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
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'cloneFieldValues',
                           'Clone Field Values when Cloning Records',
                           'clone field values')
}
function prefRequireRecordFields(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'requireRecordFields',
                           'Require Record Fields',
                           'require at least one field in a record')
}

function prefEditableFieldName(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'editableFieldName',
                           'Enable Editable Field Name',
                           'allow each field name to be edited')
}

function prefEnablePrinting(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'enablePrinting',
                           'Enable Printing',
                           'enable printing')
}

function prefEnableSaveFile(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'enableSaveFile',
                           'Enable Save File',
                           'enable save file')
}

function prefFilePassCacheStrategy(labelClasses, inputClasses) {
    let value = window.prefs.filePassCache
    let list_items = []
    Object.entries(VALID_CACHE_STRATEGIES).forEach(([key1,value1]) => {
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
                window.prefs.filePassCache = new_value
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
        prefLabel(labelClasses, 'filePass Cache Strategy'),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                dropdown
            ),
            xmk('br')
        )
    )
}

function prefSearchCaseInsensitive(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'searchCaseInsensitive',
                           'Case Insensitive Searches',
                           'do case insensitive searches')
}

function prefSearchRecordTitles(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'searchRecordTitles',
                           'Search Record Titles',
                           'search record titles')
}

function prefSearchRecordFieldNames(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'searchRecordFieldNames',
                           'Search Record Field Names',
                           'search record field names')
}

function prefSearchRecordFieldValues(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'searchRecordFieldValues',
                           'Search Record Field Values',
                           'search record field values')
}

function prefHideInactiveRecords(labelClasses, inputClasses) {
    return mkPrefsCheckBox(labelClasses,
                           inputClasses,
                           'hideInactiveRecords',
                           'Hide Inactive Records',
                           'hide inactive records')
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


function mkPrefsCheckBox(labelClasses, inputClasses, id, title, popup) {
    let checkbox = window.prefs[id] ? 'bi-check2-square' : 'bi-square'
    return xmk('div').xClass('row').xAppend(
        prefLabel(labelClasses, title),
        xmk('div').xClass(...inputClasses).xAppend(
            xmk('div').xClass('input-group').xAppend(
                xmk('button')
                    .xClass('form-control', 'btn', 'btn-lg')
                    .xAttrs({'type': 'button',
                             'title': popup,
                             'data-pref-id': id,
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
                            let msg = 'cannot edit field name'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        } else {
                            icon.classList.remove('bi-square')
                            icon.classList.add('bi-check2-square')
                            let msg = 'edit field name'
                            button.xAttr('title', msg)
                            icon.xAttr('title', msg)
                        }
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

function mkRecordFields(recordFields) {
    // Display the pre-defined record, allow them to be modified or deleted.
    let fldsList = xmk('div').xId('x-prefs-fld-div')
    let sorted_dict = sortDictByKey(recordFields)
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
                xmk('span').xInnerHTML('&nbsp;&nbsp;'),
                xmk('div').xClass('col', 'col-4').xAppend(
                    dropdown
                    //xmk('input').xClass('form-control', 'x-fld-value').xAttrs({'value': value})
                ),
                xmk('div').xClass('col', 'col-1', 'ms-auto').xAppend(
                    xmk('button')
                        .xClass('btn', 'btn-lg', 'form-control')
                        .xAttrs({
                            'type': 'button',
                            'title': tooltip,
                        })
                        .xAppend(icon('bi-trash3-fill', tooltip))
                        .xAddEventListener('click', (event) => {
                            let newRecordFields = getRecordFieldsFromDOM()
                            let row = event.target.xGetParentWithClass('row')
                            let name = row.xGet('.x-fld-name').value.trim() // field name
                            row.remove()
                            delete newRecordFields[name]
                            delete_occurred = true
                            let div = document.body.xGet('#x-prefs-fld-div')
                            div.replaceWith(mkRecordFields(newRecordFields))
                            setDarkLightTheme(window.prefs.themeName) // fix the new DOM elements
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
                     let new_value = 'text'
                     let base = 'AAA'
                     // load record fields
                     let newRecordFields = getRecordFieldsFromDOM()
                     let idn = 0
                     let new_key = base + idn.toString(16).padStart(4, '0')
                     while (new_key in recordFields) {
                         idn += 1
                         new_key = base + idn.toString(16).padStart(4, '0')
                     }
                     //console.log(newRecordFields)
                     newRecordFields[new_key] = new_value
                     let div = document.body.xGet('#x-prefs-fld-div')
                     div.replaceWith(mkRecordFields(newRecordFields))
                     setDarkLightTheme(window.prefs.themeName) // fix the new DOM elements
                 }),
         ),
    )
    fldsList.xPrepend(newfld)
    return fldsList
}

function getRecordFieldsFromDOM() {
    let recflds = {}
    let div = document.body.xGet('#x-prefs-fld-div')
    let rows = div.xGetN('.x-pref-fld-row')
    // get the preference values from the DOM
    for (const row of rows) {
        let key = row.xGet('.x-fld-name').value.trim()
        let value = row.xGet('.dropdown-toggle').innerHTML.trim() // can never be empty
        recflds[key] = value
    }

    // Set the pre-defined fields for use in creating records.
    let sorted_recflds = sortDictByKey(recflds)
    return sorted_recflds
}
