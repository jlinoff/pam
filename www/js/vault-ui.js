// vault-ui.js — the DOM-facing half of the vault queries.
//
// vault.js stays pure so it can be unit tested with plain object literals.
// Everything here reads or writes the document, and is kept separate for
// that reason.

import { xmk, xget } from './lib.js'
import { mkPopupModalDlgButton, mkPopupModalDlg } from './utils.js'
import { convertInternalDataToJSON } from './save.js'
import { vaultFingerprint, reuseGroups, reuseCount } from './vault.js'

// Last computed values. The fingerprint is asynchronous (crypto.subtle) but
// the About dialogue is built synchronously, so it reads this cache and gets
// refreshed when the value arrives.
let cachedFingerprint = ''
let cachedReuseGroups = []
let cachedReuseCount = 0

// Set when a refresh is already scheduled, so a burst of calls collapses into
// one. Loading a file calls insertRecord() once per record, and each of those
// calls setNumRecords(); without coalescing, a 500 record file would walk the
// whole accordion 500 times.
let refreshPending = false

/**
 * Read the current records out of the DOM.
 *
 * Reuses the serialiser that save.js already relies on rather than walking
 * the accordion again, so the two cannot disagree about what a record is.
 *
 * @returns {Array} records, as convertInternalDataToJSON produces them.
 */
export function getCurrentRecords() {
    let contents = {'prefs': {}, 'records': []}
    convertInternalDataToJSON(contents, new Date())
    return contents.records
}

export function getCachedFingerprint() {
    return cachedFingerprint
}

export function getCachedReuseGroups() {
    return cachedReuseGroups
}

export function getCachedReuseCount() {
    return cachedReuseCount
}

/**
 * Show or hide the reuse badge.
 *
 * The badge is hidden when there is no reuse, so a clean vault costs no
 * screen space at all. It is also hidden when the user has turned the
 * warning off — but the count is still computed and still reported in the
 * About dialogue, so there is no state where PAM knows about reuse and has
 * no way to tell you.
 */
export function updateReuseIndicator() {
    let indicator = document.getElementById('x-reuse-indicator')
    if (!indicator) {
        return
    }
    let show = cachedReuseCount > 0 && window.prefs.showPasswordReuseWarning !== false
    indicator.style.display = show ? 'inline' : 'none'
    indicator.innerHTML = '&#x26A0; REUSED: ' + cachedReuseCount
    let plural = cachedReuseCount === 1 ? 'password is' : 'passwords are'
    indicator.setAttribute(
        'title',
        cachedReuseCount + ' stored ' + plural + ' used more than once. Click for details.')
}

/**
 * Recompute the vault statistics and update everything that displays them.
 *
 * Synchronous work happens immediately; the fingerprint arrives later and
 * refreshes the About dialogue when it does.
 */
export function refreshVaultStats() {
    refreshPending = false
    let records = []
    try {
        records = getCurrentRecords()
    } catch (exc) {
        // The accordion may not exist yet during startup. Nothing to report.
        return
    }
    cachedReuseGroups = reuseGroups(records)
    cachedReuseCount = reuseCount(records)
    updateReuseIndicator()
    refreshReuseDlgBody()

    vaultFingerprint(records).then((fingerprint) => {
        cachedFingerprint = fingerprint
        let element = document.getElementById('x-about-fingerprint')
        if (element) {
            element.innerHTML = fingerprintHTML()
        }
    }).catch(() => {
        // crypto.subtle is unavailable outside a secure context. Say so
        // rather than showing a stale or empty value.
        cachedFingerprint = ''
    })
}

/**
 * Request a refresh, coalescing repeated calls in the same tick into one.
 *
 * This is what mutation paths should call. See refreshPending above.
 */
export function scheduleVaultStatsRefresh() {
    if (refreshPending) {
        return
    }
    refreshPending = true
    setTimeout(refreshVaultStats, 0)
}

export function fingerprintHTML() {
    if (!cachedFingerprint) {
        return 'Fingerprint unavailable'
    }
    return 'Fingerprint <code>' + cachedFingerprint + '</code>'
}

// Build the contents of the duplicates dialogue.
//
// Entries are listed by record title and field name. The shared password is
// the grouping key and is never rendered: you learn that two entries collide
// without being shown the secret they collide on.
function mkReuseDlgBody() {
    let body = xmk('div').xId('x-reuse-dlg-body')
    if (cachedReuseCount === 0) {
        return body.xAppendChild(
            xmk('p').xInnerHTML('No stored password is used more than once.'))
    }
    let plural = cachedReuseCount === 1 ? 'password is' : 'passwords are'
    body.xAppendChild(
        xmk('p').xInnerHTML(
            '<b>' + cachedReuseCount + '</b> stored ' + plural + ' used more than once, ' +
            'in <b>' + cachedReuseGroups.length + '</b> group(s). ' +
            'A password shared between entries is only as safe as the least safe ' +
            'of them: if any one is breached, every entry in its group is exposed.'),
        xmk('p').xClass('fst-italic').xInnerHTML(
            'The passwords themselves are not shown. They are used only to group ' +
            'the entries below.'))
    for (let i = 0; i < cachedReuseGroups.length; i++) {
        let group = cachedReuseGroups[i]
        let list = xmk('ul').xClass('x-reuse-group')
        for (const member of group) {
            list.xAppendChild(
                xmk('li').xAppend(
                    xmk('span').xClass('fw-bold').xTextContent(member.title),
                    xmk('span').xClass('text-secondary').xTextContent(' \u2014 ' + member.name)))
        }
        body.xAppendChild(
            xmk('div').xClass('mb-3').xAppend(
                xmk('div').xClass('text-secondary').xInnerHTML(
                    'Group ' + (i + 1) + ' \u2014 ' + group.length + ' entries share a password'),
                list))
    }
    return body
}

function refreshReuseDlgBody() {
    let old = document.getElementById('x-reuse-dlg-body')
    if (old) {
        old.replaceWith(mkReuseDlgBody())
    }
}

export function menuReuseDlg() {
    let close = mkPopupModalDlgButton('Close', 'btn-secondary', 'close the dialogue',
                                      () => { return true })
    return mkPopupModalDlg('menuReuseDlg', 'Reused Passwords', mkReuseDlgBody(), close)
}
