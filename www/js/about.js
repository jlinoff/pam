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
    let body = xmk('center')
        .xId('about')
        .xAppendChild(
            xmk('p').xInnerHTML('PAM &copy; 2022'),
            xmk('p').xInnerHTML(`Version ${VERSION} (${COMMIT_BRANCH})`),
            xmk('p').xInnerHTML(`Bootstrap Version ${BOOTSTRAP_VERSION}`),
            xmk('p').xInnerHTML('Personal Accounts Manager'),
            xmk('p').xInnerHTML('Written by Joe Linoff'),
            xmk('p').xClass('x-project-link').xInnerHTML(`<a href="${window.prefs.projectLink}" target="_blank">Project</a>`),
            xmk('p').xInnerHTML('<i>A web app that allows you to securely manage your ' +
                                'personal accounts data without ever communicating with a server.</i>'),
            xmk('p').xClass('fs-6').xAppend(
                xmk('div').xInnerHTML(`total: ${window.screen.width}x${window.screen.height}`),
                xmk('div').xInnerHTML(`avail: ${window.screen.availWidth}x${window.screen.availHeight}`),
                xmk('div').xInnerHTML(`inner: ${window.innerWidth}x${window.innerHeight}`),
            ),
            xmk('p').xId('x-about-info').xInnerHTML(custom),
            xmk('p').xClass('font-monospace', 'fs-6').xInnerHTML(`${COMMIT_ID} - ${COMMIT_DATE}`),
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
    let newAbout = mkAbout()
    oldAbout.replaceWith(newAbout)
}

