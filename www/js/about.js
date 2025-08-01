// about dialogue
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { mkPopupModalDlgButton, mkPopupModalDlg } from './utils.js'
import { BOOTSTRAP_VERSION,
         VERSION,
         COMMIT_ID,
         COMMIT_DATE,
         COMMIT_BRANCH } from './version.js'  // automatically generated by make

function mkAbout() {
    let custom = window.prefs.customAboutInfo
    let el = 'div'
    let body = xmk('center')
        .xId('about')
        .xAppendChild(
            xmk(el).xInnerHTML('PAM &copy; 2022'),
            xmk(el).xInnerHTML(`Version ${VERSION}`),
            xmk(el).xInnerHTML(`Branch ${COMMIT_BRANCH}`),
            xmk(el).xInnerHTML(`Commit ${COMMIT_DATE} (${COMMIT_ID})`),
            xmk(el).xInnerHTML(`Bootstrap Version ${BOOTSTRAP_VERSION}`),
            //xmk(el).xInnerHTML('Personal Accounts Manager'),
            xmk(el).xInnerHTML('Written by Joe Linoff'),
            xmk(el).xClass('x-project-link').xInnerHTML(`<a href="${window.prefs.projectLink}" target="_blank">Project</a>`),
            //xmk(el).xInnerHTML('<i>A web app that allows you to securely manage your ' +
            //                    'personal accounts data without ever communicating with a server.</i>'),
            /*xmk(el).xClass('fs-6').xAppend(
                xmk('div').xInnerHTML(`total: ${window.screen.width}x${window.screen.height}`),
                xmk('div').xInnerHTML(`avail: ${window.screen.availWidth}x${window.screen.availHeight}`),
                xmk('div').xInnerHTML(`inner: ${window.innerWidth}x${window.innerHeight}`),
            ),*/
            xmk(el).xId('x-about-info').xInnerHTML(custom),
            xmk(el).xClass('fs-6', 'fw-lighter').xId('x-about-file-info').xInnerHTML(''),
        )
    return body
}

export function menuAboutDlg() {
    let custom = window.prefs.customAboutInfo
    let body = mkAbout()
    let b1 = mkPopupModalDlgButton('Close',
                                 'btn-secondary',
                                 'close the dialogue',
                                 (el) => {
                                     return true
                                 })
    let e = mkPopupModalDlg('menuAboutDlg', 'About', body, b1)
    return e
}

export function refreshAbout() {
    let oldAbout = xget('#about')
    let loadInfo = oldAbout.xGet('#x-about-file-info').innerHTML
    let newAbout = mkAbout()
    newAbout.xGet('#x-about-file-info').xInnerHTML(loadInfo)
    oldAbout.replaceWith(newAbout)
}

export function clearAbout() {
    let oldAbout = xget('#about')
    let newAbout = mkAbout()
    oldAbout.replaceWith(newAbout)
}

export function setAboutFileInfo(string) {
    document.getElementById('x-about-file-info').innerHTML = string
}
