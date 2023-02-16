// Load file.
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { statusBlip } from './status.js'
import { icon, mkPopupModalDlg, mkPopupModalDlgButton } from './utils.js'
import { clearRecords, deleteRecord, findRecord, insertRecord, mkRecord } from './record.js'
import { mkRecordField } from './field.js'
import { menuPrefsDlg } from './prefs.js'
import { decrypt } from './crypt.js'
import { mkLoadSavePassword, setFilePass } from './password.js'
import { initPrefs } from './prefs.js'
import { enablePrinting } from './print.js'
import { setAboutFileInfo } from './about.js'

// load a file
export function menuLoadDlg() {
    let body = xmk('span')
        .xAppendChild(
            xmk('p')
                .xInnerHTML('Normally you simply click the "Load" button to load from a file but there are four special cases that allow you to load from other sources:'),
            xmk('ol').xAppend(
                xmk('li').xAppend(
                    xmk('button')
                        .xClass('btn', 'btn-sm', 'btn-secondary', 'p-1', 'ms-2')
                        .xAttrs({'type': 'button'})
                        .xStyle({'margin-bottom': '3px'})
                        .xAddEventListener('click', (event) => {setTimeout(() => loadExampleRecords(event), 500)})
                        .xInnerHTML('Load Example Records'),
                ),
                xmk('li').xAppend(
                    xmk('button')
                        .xClass('btn', 'btn-sm', 'btn-secondary', 'p-1', 'ms-2')
                        .xStyle({'margin-bottom': '3px'})
                        .xAttrs({'type': 'button'})
                        .xAddEventListener('click', (event) => loadExampleRecipe(event))
                        .xInnerHTML('Load Example Recipes'),
                ),
                xmk('li').xAppend(
                    xmk('button')
                        .xClass('btn', 'btn-sm', 'btn-secondary', 'p-1', 'ms-2')
                        .xStyle({'margin-bottom': '3px'})
                        .xAttrs({'type': 'button'})
                        .xAddEventListener('click', (event) => loadUrl(event))
                        .xInnerHTML('Load Records from URL'),
                ),
                xmk('li').xAppend(
                    xmk('button')
                        .xClass('btn', 'btn-sm', 'btn-secondary', 'p-1', 'ms-2')
                        .xStyle({'margin-bottom': '3px'})
                        .xAttrs({'type': 'button'})
                        .xAddEventListener('click', (event) => loadClipboardContent(event))
                        .xInnerHTML('Paste Records from Clipboard'),
                ),
            ),
            xmk('p')
                .xInnerHTML('Enter a password if the PAM records file was encrypted.'),
            xmk('form').xClass('container').xAppend(
                xmk('div').xClass('row').xId('load-password-row').xAppend(
                    xmk('div').xClass('col-12', 'overflow-auto').xAppend(
                        xmk('label').xClass('col-form-label').xInnerHTML('Password')
                    ),
                    xmk('div').xClass('col-12', 'overflow-auto').xAppend(
                        mkLoadSavePassword('x-load-password')
                    ),
                )
            )
        )
    let b1 = mkPopupModalDlgButton('Close',
                                   'btn-secondary',
                                   'close the dialogue with no changes',
                                   (el) => {
                                       console.log(el)
                                       return true
                                   })
    let b2 = mkPopupModalDlgButton('Load',
                                   'btn-primary',
                                   'load using the password',
                                   (el) => {
                                       //console.log(el)
                                       let password = el.xGet('#x-load-password').value.trim()
                                       setFilePass(password)
                                       loadFile(password)
                                       return true
                                })
    let e = mkPopupModalDlg('menuLoadDlg', 'Load Records From File', body, b1, b2)
    return e
}

function closeDlg() {
    let dlg = document.getElementById('menuLoadDlg')
    let buttons = dlg.getElementsByTagName('button')
    let closeButton = null
    for (let button of buttons) {
        if (button.innerHTML.trim() === 'Close') {
            closeButton = button
            break
        }
    }
    if (closeButton) {
        closeButton.click()
    }
    enablePrinting()
}

function loadClipboardContent() {
    navigator.clipboard.readText()
        .then( (content) => {
            if (content.length > 0) {
                let size = content.length
                if (content[0] === '{') {
                    // This file is plain json, it is not encrypted
                    statusBlip(`content not encrypted (${size}B)`)
                    loadCallback(content)
                }  else {
                    statusBlip(`content encrypted (${size}B)`)
                    let password = document.body.xGet('#x-load-password').value.trim()
                    decrypt(password, content, loadCallback, invalidPasswordCallback)
                }
                closeDlg()
            } else {
                const msg = `clipboard is empty`
                statusBlip(msg)
                alert(msg)
            }
        })
        .catch ( (error) => {
            const msg = `internal error:\nnavigator.clipboard.readText() exception:\n${error}`
            statusBlip(msg)
            alert(msg)
        })
}

function loadUrlContent(url) {
    fetch(url)
        .then((response) => {
            return response.text()
        })
        .then((content) => {
            //console.log(data)
            let size = content.length
            if (content[0] === '{') {
                // This file is plain json, it is not encrypted
                statusBlip(`not encrypted ${url} (${size}B)`)
                loadCallback(content)
            }  else {
                statusBlip(`encrypted ${url} (${size}B)`)
                let password = document.body.xGet('#x-load-password').value.trim()
                decrypt(password, content, loadCallback, invalidPasswordCallback)
            }
            closeDlg()
        })
        .catch((error) => {
            alert(`failed to load ${url}: ${error.message}`)
            console.log(`ERROR: ${error.message}`)
        })
}

function loadUrl() {
    let url = prompt('URL:').trim()
    if (url.length > 4 ) {
        loadUrlContent(url)
    } else {
        alert(`WARNING! invalid url specified: ${url}`)
    }
}

function loadExampleRecords(event) {
    // figure out the base url
    let href = window.location.href
    let lidx = href.lastIndexOf('/') + 1
    let base = href.substring(0, lidx)
    let url = base + 'examples/example.txt'
    if (confirm(`Do you really want to load the example from\n${url}?`) !== true) {
        return
    }
    loadUrlContent(url)
}

function loadExampleRecipe(event) {
    // figure out the base url
    let href = window.location.href
    let lidx = href.lastIndexOf('/') + 1
    let base = href.substring(0, lidx)
    let url = base + 'examples/recipes.txt'
    if (confirm(`Do you really want to load the example from\n${url}?`) !== true) {
        return
    }
    loadUrlContent(url)
}

function loadFile(password) {
    // Create a hidden file input element element
    let input = xmk('input')
        .xAttr('type', 'file')
        .xAttr('value', 'unused.txt')
        .xAttr('accept', '.js,.pam,.txt')
        .xStyle({display: 'none'})

    // Respond to the system dialogue changes.
    input.xAddEventListener('change', (event1)=> {
        const fileList = event1.target.files
        if (fileList.length === 1) {
            var file = fileList[0]
            const reader = new FileReader()
            reader.addEventListener('load', (event2) => {
                const text = event2.target.result
                let type = file.type ? file.type : '???'
                statusBlip(`loaded ${text.length} bytes from: "${file.name}" "<code>${type}</code>".`)
            })
            reader.readAsText(file)
            reader.onload = (event3) => {
                let content = event3.target.result
                //console.log('debug', content.slice(0,10))
                const filename = file.name
                loadFileContent(filename, password, content)
            }
        }
    })

    // TODO: figure out how to handle input type="file" cancel events.
    // was not able to see "focus" events or the cancel click event.
    // for now, use a timeout hack
    input.click()
    setTimeout( () => {
        //console.log('timeout: clean up')
        input.remove()
    }, 2000)
}

// Load the file content
function loadFileContent(filename, password, content) {
    window.prefs.fileName = filename
    document.body.xGet('#x-save-filename').value = filename
    document.body.xGet('#x-save-password').value = password
    let size = content.length
    if (content[0] === '{') {
        // This file is plain json, it is not encrypted
        statusBlip(`not encrypted ${filename} (${size}B)`)
        loadCallback(content)
    } else {
        statusBlip(`encrypted ${filename} (${size}B)`)
        decrypt(password, content, loadCallback, invalidPasswordCallback)
    }
}

// Load the data.
function loadCallback(text) {
    if (!text || text.length === 0 ) {
        return
    }
    // at this point text will be a javascript string.
    let json = null
    try {
        json = JSON.parse(text)
    } catch(exc) {
        alert(`invalid record format!\n${exc}`)
        return
    }
    if (window.prefs.clearBeforeLoad) {
        clearRecords()
    }
    if ( 'prefs' in json) {
        initPrefs()  // make sure newer prefs are present
        for (const [key, value] of Object.entries(json.prefs)) {
            window.prefs[key] = value
        }
        let oldMenuPrefsDlg = document.body.xGet('#menuPrefsDlg')
        let newMenuPrefsDlg = menuPrefsDlg() // make the new menuPrefsDlg
        oldMenuPrefsDlg.replaceWith(newMenuPrefsDlg)
    }
    let warned = 0
    let num = 0
    for (let i=0; i<json.records.length; i++) {
        let row = json.records[i]
        let title = row.title
        if (findRecord(title)) {
            switch (window.prefs.loadDupStrategy) {
            case 'ignore':
                // ignore the duplicate.
                continue
                break
            case 'replace':
                // replace the duplicate record with one just loaded.
                deleteRecord(title)
                break
            case 'allow':
                // allow duplicates to co-exist
                // generate a unique suffix for to the title.
                let provisional = title + ' Clone'
                let idx = 0
                while (findRecord(provisional)) {
                    idx++
                    provisional = `${title} Clone${idx}`
                }
                title = provisional
                break
            default:
                // clearBeforeLoad makes this unnecesary but it is optional.
                if (!warned) {
                    // only warn once
                    alert('WARNING! internal state error ' +
                          `invalid loadDupStrategy "${window.prefs.loadDupStrategy}"\n` +
                          'Duplicates will be ignored')
                }
                warned++
                continue
            }
        }
        num +=1
        let recordFields = []
        for (let j=0; j<row.fields.length; j++ ) {
            let field = row.fields[j]
            recordFields.push( mkRecordField(field.name, field.type, field.value) )
        }
        let newRecord = mkRecord(title, ...recordFields)
        insertRecord(newRecord, title)
    }
    enablePrinting()
    xget('#x-num-records').xInnerHTML(num)
    //let now = new Date().toISOString()
    let now = new Date()
    let thenDateString = json['meta']['date-saved']
    let thenDate = new Date(thenDateString)
    let elapsed = now.getTime() - thenDate.getTime() // ms
    let days = elapsed / (1000 * 3600 * 24)
    setAboutFileInfo(`Loaded ${num} records on ${now.toISOString()}.<br>Records were last updated on ${thenDate.toISOString()} (${days.toFixed(3)} days ago).`)
}

function invalidPasswordCallback(error) {
    console.log('invalidPasswordCallback')
    alert(error)
    console.log(error)

    // Popup the Load dialogue to allow a retry
    let menuButton = document.body.xGet('#menu')
    menuButton.click()
    let menuItems = menuButton.parentElement.xGetN('li')
    for (let i in menuItems) {
        //menuItems.forEach( (e) => {
        let e = menuItems[i]
        let button = e.xGet('button')
        if (button) { // dividers have no buttons
            let target = button.getAttribute('data-bs-target')
            if (target === '#menuLoadDlg') {
                button.click()
                break
            }
        }
    }
}
