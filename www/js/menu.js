// menus.
import { xmk } from './lib.js'
import { statusBlip } from './status.js'
import { icon, clog, hide, show, mkPopupModalDlgButton, mkPopupModalDlg } from './utils.js'
import { checkRecordEditDlg,
         clearRecords,
         cleanRecordEditDlg,
         insertRecord,
         saveRecordEditDlg } from './record.js'
import { mkRecordEditDlg } from './field.js'
import { menuAboutDlg } from './about.js'
import { menuPrefsDlg, addDefaultRecordFields, resetPrefs } from './prefs.js'
import { menuSaveDlg, enableSaveFile } from './save.js'
import { menuLoadDlg } from './load.js'
import { printRecords } from './print.js'
import { enableRawJSONEdit } from './raw.js'

function menuEntryDivider() {
    return xmk('li').xAppend(xmk('hr').xClass('dropdown-divider'))
}

function menuEntry(target, text, iconName, title) {
    let e = xmk('li')
        .xAppend(
            xmk('button')
                .xClass('dropdown-item')
                .xAttrs({
                    'data-bs-target': '#' + target,
                    'data-bs-toggle' : 'modal',
                    'type': 'button',
                    'title': title,
                })
                .xAppend(
                    icon(iconName),
                    xmk('span').xInnerHTML('&nbsp;' + text),
                )
        )
    return e
}

function menuClearDlg() {
    let body = xmk('span')
        .xAppendChild(
            xmk('p').xInnerHTML('Really, really clear all existing records and preferences?'),
            xmk('div').xClass('row')
                .xAppend(
                    xmk('div').xClass('col-auto')
                        .xAppend(
                            xmk('p').xInnerHTML('<span class="fs-3">YES</span>'),
                        ),
                    xmk('div').xClass('col', 'ml-3')
                        .xAppend(
                            xmk('span').xInnerHTML('Click&nbsp;'),
                            xmk('button').xClass('btn', 'btn-primary', 'btn-sm', 'disabled')
                                .xInnerHTML('Clear'),
                            xmk('span')
                                .xInnerHTML('&nbsp;to really do it. This is operation is NOT reversible!')
                        ),
                    xmk('div').xClass('w-100'),
                    xmk('div').xClass('col-auto')
                        .xAppend(
                            xmk('p').xInnerHTML('<span class="fs-3">NO</span>'),
                        ),
                    xmk('div').xClass('col', 'ml-3')
                        .xAppend(
                            xmk('span').xInnerHTML('Click&nbsp;'),
                            xmk('button').xClass('btn', 'btn-secondary', 'btn-sm', 'disabled')
                                .xInnerHTML('Close&nbsp;'),
                            xmk('span')
                                .xInnerHTML('&nbsp;to exit this dialogue with no changes.')
                        ),
                ),
        )
    let b1 = mkPopupModalDlgButton('Close',
                                 'btn-secondary',
                                 'close the dialogue with no changes',
                                 (el) => {
                                    clog(el)
                                    return true
                                })
    let b2 = mkPopupModalDlgButton('Clear',
                                 'btn-primary',
                                 'clear all records and close the dialogue',
                                 (el) => {
                                     clog(el)
                                     clearRecords()
                                     resetPrefs()
                                     statusBlip('all records cleared')
                                     return true
                                })
    let e = mkPopupModalDlg('menuClearDlg', 'Clear All Records', body, b1, b2)
    return e
}

// menu
export function mkMenu() {
    // append trailing space to avoid scroll bar overlap
    let e = xmk('div')
        .xClass('dropdown')
        .xAppend(
            xmk('button')
                .xId('menu')
                .xClass('btn', 'btn-lg', 'dropdown-toggle') //, 'text-info')
                .xAttrs({
                    'aria-expanded': 'false',
                    'data-bs-toggle': 'dropdown',
                    'type': 'button',
                })
                .xAppend(icon('bi-list', 'menu')),
            xmk('ul')
                .xClass('dropdown-menu', 'fs-5')
                .xAttrs({
                    'aria-labelledby': 'menu',
                })
                .xAppend(
                    menuEntry('menuAboutDlg',
                              'About',
                              'bi-info-circle',
                              'Information about this app.'),
                    menuEntry('menuPrefsDlg',
                              'Preferences',
                              'bi-gear',
                              'app preferences')
                        .xAddEventListener('click', async (event) => {
                            if(!window.prefs.lockPreferencesPassword) {
                                window.prefs.lockPreferencesPassword = ''
                            }
                            if (window.prefs.lockPreferencesPassword.length > 0) {
                                hide('top-section')
                                hide('mid-section')
                                hide('x-generate-password')
                                hide('x-edit-raw-json-data')
                                // wait for the dlg to appear
                                const dlg = await waitForElement('#menuPrefsDlg')
                                dlg.addEventListener('shown.bs.modal', () => {
                                    let modal = bootstrap.Modal.getInstance(dlg)
                                    modal.hide()
                                }, { once: true })
                                const pw = await promptForPrefsPassword()
                                if (pw === window.prefs.lockPreferencesPassword) {
                                    // password was valid, this is an administrator
                                    // make sure that the "Save File" option is visible.
                                    let modal = bootstrap.Modal.getInstance(dlg)
                                    modal.show()
                                    let tmp = window.prefs.enableSaveFile
                                    window.prefs.enableSaveFile = true
                                    enableSaveFile()
                                    window.prefs.enableSaveFile = tmp
                                }
                                show('top-section')
                                show('mid-section')
                                show('x-generate-password')
                                enableRawJSONEdit()
                            }
                        }),
                    menuEntryDivider(),
                    menuEntry('menuNewDlg',
                              'New Record',
                              'bi-plus-circle-fill',
                              'create a new record'),
                    menuEntry('menuClearDlg',
                              'Clear Records',
                              'bi-trash3-fill',
                              'clear all records'),
                    menuEntryDivider(),
                    menuEntry('menuLoadDlg',
                              'Load File',
                              'bi-file-arrow-up-fill',
                              'load records from a file'),
                    /*menuEntry('menuSaveDlg',
                              'Save File',
                              'bi-file-arrow-down-fill',
                              'save records to a file'),*/
                    xmk('button')
                        .xClass('dropdown-item', 'x-save-file-menu-item')
                        .xAttrs({
                            'data-bs-target': '#menuSaveDlg',
                            'data-bs-toggle' : 'modal',
                            'type': 'button',
                            'title': 'save records to a file',
                        })
                        .xAppend(
                            icon('bi-file-arrow-down-fill'),
                            xmk('span').xInnerHTML('&nbsp;' + 'Save File'),
                        ),
                    xmk('li').xAppend(xmk('hr').xClass('dropdown-divider', 'x-print')),
                    xmk('button') // Print
                        .xAttrs({'type': 'button'})
                        .xClass('dropdown-item', 'x-print')
                        .xAppend(
                            icon('bi-printer', 'report'),
                            xmk('span').xInnerHTML('&nbsp;Print'))
                        .xAddEventListener('click', (event) => {
                            printRecords()
                        }),
                    menuEntryDivider(),
                    xmk('button') // Help
                        .xAttrs({'type': 'button'})
                        .xClass('dropdown-item')
                        .xAppend(
                            icon('bi-question-circle', 'app help'),
                            xmk('span').xInnerHTML('&nbsp;Help'))
                        .xAddEventListener('click', (event) => {
                            window.open(window.prefs.helpLink, '_blank')
                        }),
                ),
        )

    // Dropdown menu dialogue boxes.
    document.body.xAppendChild(menuAboutDlg())
    document.body.xAppendChild(menuPrefsDlg())
    document.body.xAppendChild(menuNewDlg())
    document.body.xAppendChild(menuClearDlg())
    document.body.xAppendChild(menuLoadDlg())
    document.body.xAppendChild(menuSaveDlg())
    return e
}

// create a new record
export function menuNewDlg() {
    // Create the dynamic grid for the popup modal dialogue that is
    // used to define the new record.
    // Each record is defined by a title and fields.
    // The user updates the title and fields interactively.
    // Once they are done, they click the "Save" button
    // to save the record to the top level records accordion or
    // they click the "Close" button to abort.
    let body = mkRecordEditDlg('')
    let closeButton = mkPopupModalDlgButton('Close',
                                          'btn-secondary',
                                          'close the dialogue with no changes',
                                          (event) => {
                                              //console.log(event)
                                              cleanRecordEditDlg(event)
                                              addDefaultRecordFields()
                                              return true
                                          })
    let saveButton = mkPopupModalDlgButton('Save',
                                         'btn-primary',
                                         'save the changes and close the dialogue',
                                         (event) => {
                                             //console.log(event)
                                             checkRecordEditDlg(event, false)
                                             let container = event.xGet('.container')
                                             if (container.getAttribute('data-check-failed')) {
                                                 let msg = container.getAttribute('data-check-failed')
                                                 alert(`ERROR: ${msg}\nCANNOT SAVE RECORD`)
                                                 container.removeAttribute('data-check-failed')
                                                 addDefaultRecordFields()
                                                 return false
                                             } else {
                                                 let active = true
                                                 let created = new Date().toISOString()
                                                 saveRecordEditDlg(event, active, created)
                                                 cleanRecordEditDlg(event)
                                                 addDefaultRecordFields()
                                                 return true
                                             }
                                         })
    let e = mkPopupModalDlg('menuNewDlg', 'New Record', body, closeButton, saveButton)
    return e
}

// Paste the waitForElement function here...
function waitForElement(selector) {
    return new Promise(resolve => {
        const element = document.querySelector(selector)
        if (element) {
            resolve(element)
            return
        }
        // Tell JSHint to allow the function inside this loop
        /*jshint loopfunc:true */
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                const addedNodes = Array.from(mutation.addedNodes)
                const matchingNode = addedNodes.find(node => node.matches && node.matches(selector))
                if (matchingNode) {
                    observer.disconnect()
                    resolve(matchingNode)
                    return
                }
            }
        })
        observer.observe(document.body, { childList: true, subtree: true })
    })
}

function promptForPrefsPassword() {
    // This function returns a new Promise. The promise's logic is defined
    // inside the function passed to the constructor.
    return new Promise(resolve => {
        // 1. Create the elements for the prompt
        const id = 'x-prefs-password-prompt-input'

        const container = document.createElement('div')
              .xStyle({'margin-left':'1em'})
              .xClass('row')
              .xAppend(
                  xmk('input')
                      .xId(id)
                      .xClass('m-2', 'w-75', 'fs-1', 'form-control-large')
                      .xAttrs({'type': 'password',
                               'placeholder': 'Enter Preferences Lock Password...'})
                      .xAddEventListener('keydown', (event) => {
                          if (event.key === 'Enter') {
                              // Get the value from the input field
                              const inputValue = document.getElementById(id).value

                              // Clean up: remove the prompt from the DOM
                              container.remove()

                              // Resolve the promise, forwarding the input value
                              resolve(inputValue)
                          }
                      }),
                  xmk('button')
                      .xClass('btn', 'btn-lg', 'px-0', 'ms-2', 'w-auto')
                      .xAttr('type', 'button')
                      .xAddEventListener('click', (event) => {
                          let button = event.target.parentElement
                          let row = event.target.xGetParentWithClass('row')
                          let input = row.xGet('input')
                          let icon = button.xGet('i')
                          let show = icon.classList.contains('bi-eye')
                          if (show) {
                              icon.classList.remove('bi-eye')
                              icon.classList.add('bi-eye-slash')
                              input.xAttr('type', 'text')
                          } else {
                              icon.classList.remove('bi-eye-slash')
                              icon.classList.add('bi-eye')
                              input.xAttr('type', 'password')
                          }
                      })
                      .xAppend(
                          icon('bi-eye', 'show/hide password name')
                      ),
                  xmk('div').xAppend(
                      xmk('button')
                          .xClass('btn', 'btn-lg', 'btn-primary', 'px-2', 'ms-0', 'w-auto')
                          .xAttrs({'type': 'submit'})
                          .xInnerText('Submit')
                          .xAddEventListener('click', () => {
                              // Get the value from the input field
                              const inputValue = document.getElementById(id).value

                              // Clean up: remove the prompt from the DOM
                              container.remove()

                              // Resolve the promise, forwarding the input value
                              resolve(inputValue)
                          }),
                  ),
              )

        // 3. Assemble and add the prompt to the page
        document.body.appendChild(container)

        // 4. Focus the input field for a better user experience
        document.getElementById(id).focus()
    });
}

/**
 * Displays the browser's native prompt to ask for a password.
 * This is a reliable fallback when custom modals are blocked by the environment.
 *
 * @param {string} message The message to display to the user in the prompt.
 * @returns {Promise<string|null>} A Promise that resolves with the entered password or null if the user cancels.
 */
async function showPasswordPrompt(message) {
    // window.prompt() is synchronous and blocking, but wrapping it
    // in an async function maintains the same calling interface.
    const result = window.prompt(message);

    // window.prompt returns the entered string, or null if the user clicks "Cancel".
    // This perfectly matches the desired output of our promise.
    return result;
}

/**
 * Displays a modal password prompt that overlays the screen.
 * This version uses a MutationObserver to defend its styles against
 * frameworks like Bootstrap or browser extensions.
 *
 * @param {string} message The message to display to the user in the prompt.
 * @returns {Promise<string|null>} A Promise that resolves with the password or null.
 */
function showPasswordPromptExp7(message) {
    return new Promise((resolve) => {
        const styleId = 'password-prompt-style';
        const uniqueToggleId = 'pwd-toggle-' + Date.now() + Math.random().toString().slice(2);

        // All the style and element creation logic remains the same...
        if (!document.getElementById(styleId)) {
            const modalStyles = `
                /* Minimal styles, as critical ones are applied via JS */
                .password-prompt-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background-color: rgba(0, 0, 0, 0.5); display: flex;
                    justify-content: center; align-items: center;
                    font-family: sans-serif; z-index: 2147483647;
                }
                .password-prompt-box {
                    background: white; padding: 24px; border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 90%;
                    max-width: 400px; text-align: center; color: #333;
                }
                .password-prompt-input {
                    width: 100%; padding: 8px; margin: 16px 0 8px 0;
                    border: 1px solid #ccc; border-radius: 4px;
                    box-sizing: border-box; font-size: 1.1em;
                }
                .password-prompt-toggle-container {
                    display: flex; align-items: center; justify-content: flex-start;
                    margin-bottom: 16px; font-size: 0.9em;
                }
                .password-prompt-toggle-container input { margin-right: 8px; }
                .password-prompt-button {
                    padding: 10px 20px; border: none; border-radius: 5px;
                    cursor: pointer; margin: 0 5px;
                }
                .prompt-ok { background-color: #007bff; color: white; }
                .prompt-cancel { background-color: #6c757d; color: white; }
            `;
            const styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            styleSheet.innerText = modalStyles;
            document.head.appendChild(styleSheet);
        }

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'password-prompt-overlay';
        modalOverlay.innerHTML = `
            <div class="password-prompt-box">
                <p>${message}</p>
                <input type="password" class="password-prompt-input">
                <div class="password-prompt-toggle-container">
                    <input type="checkbox" id="${uniqueToggleId}">
                    <label for="${uniqueToggleId}">Show password</label>
                </div>
                <div>
                    <button class="password-prompt-button prompt-ok">OK</button>
                    <button class="password-prompt-button prompt-cancel">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        setTimeout(() => {
            const input = modalOverlay.querySelector('.password-prompt-input');
            const okButton = modalOverlay.querySelector('.prompt-ok');
            const cancelButton = modalOverlay.querySelector('.prompt-cancel');
            const visibilityToggle = modalOverlay.querySelector(`#${uniqueToggleId}`);

            const applyStyles = () => {
                input.style.setProperty('font-family', 'monospace', 'important');
                input.style.setProperty('color', '#333', 'important');
            };

            // Apply the styles for the first time.
            applyStyles();
            input.focus();

            // ULTIMATE FIX: Create an observer to fight back against JS interference.
            const observer = new MutationObserver((mutations) => {
                // If any script changes the input's style, re-apply our style immediately.
                applyStyles();
            });

            // Tell the observer to watch the input's 'style' attribute for any changes.
            observer.observe(input, { attributes: true, attributeFilter: ['style'] });

            const closePrompt = (value) => {
                // IMPORTANT: Stop observing before removing the element to prevent errors.
                observer.disconnect();
                document.body.removeChild(modalOverlay);
                resolve(value);
            };

            visibilityToggle.addEventListener('change', () => {
                input.type = visibilityToggle.checked ? 'text' : 'password';
            });

            okButton.onclick = () => closePrompt(input.value);
            cancelButton.onclick = () => closePrompt(null);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    okButton.click();
                }
            });

            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    cancelButton.click();
                }
            });
        }, 0);
    });
}
