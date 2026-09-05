// vault-ui.js — the DOM-facing half of the vault queries.
//
// vault.js stays pure so it can be unit tested with plain object literals.
// Everything here reads or writes the document, and is kept separate for
// that reason.

import { xmk, xget } from './lib.js'
import { mkPopupModalDlgButton, mkPopupModalDlg } from './utils.js'
import { convertInternalDataToJSON } from './save.js'
import { vaultFingerprint, reuseGroups, reuseCount, partitionByActive } from './vault.js'

// Last computed values. The fingerprint is asynchronous (crypto.subtle) but
// the About dialogue is built synchronously, so it reads this cache and gets
// refreshed when the value arrives.
// Two independent fingerprints rather than one over everything.
//
// Splitting them means a mismatch says WHERE the vaults differ: matching
// active lines with differing inactive lines tells you your live credentials
// are in sync and the difference is confined to archived records. A single
// hash over both would say only that something changed.
//
// The inactive fingerprint is published even when hideInactiveRecords is set.
// Hiding it would let two vaults that differ only in inactive records show
// identical fingerprints and be reported the same — and a deactivated record
// is one the user chose to keep rather than delete. A 64-bit digest reveals
// no titles, no fields and no count, so this does not surface the records
// themselves; it only makes their absence detectable.
let cachedActiveFingerprint = ''
let cachedInactiveFingerprint = ''
let cachedHasInactive = false
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
    return cachedActiveFingerprint
}

export function getCachedInactiveFingerprint() {
    return cachedInactiveFingerprint
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
    let [active, inactive] = partitionByActive(records)
    cachedHasInactive = inactive.length > 0

    // The reuse report honours hideInactiveRecords. A deactivated record is a
    // retired credential: a collision with one is not something to act on, and
    // reporting it would be noise that teaches people to ignore the badge.
    let reported = window.prefs.hideInactiveRecords ? active : records
    cachedReuseGroups = reuseGroups(reported)
    cachedReuseCount = reuseCount(reported)
    updateReuseIndicator()
    refreshReuseDlgBody()

    Promise.all([
        vaultFingerprint(active),
        inactive.length ? vaultFingerprint(inactive) : Promise.resolve(''),
    ]).then((fingerprints) => {
        cachedActiveFingerprint = fingerprints[0]
        cachedInactiveFingerprint = fingerprints[1]
        let element = document.getElementById('x-about-fingerprint')
        if (element) {
            element.innerHTML = fingerprintHTML()
        }
    }).catch(() => {
        // crypto.subtle is unavailable outside a secure context. Say so
        // rather than showing a stale or empty value.
        cachedActiveFingerprint = ''
        cachedInactiveFingerprint = ''
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
    if (!cachedActiveFingerprint) {
        return 'Fingerprint unavailable'
    }
    let html = 'Fingerprint (active) <code>' + cachedActiveFingerprint + '</code>'
    if (cachedHasInactive && cachedInactiveFingerprint) {
        // Shown only when there are inactive records. With none there is
        // nothing outside the active view, so the line would be noise — and
        // its appearance is itself the signal that something sits outside it.
        html += '<br>Fingerprint (inactive) <code>' +
                cachedInactiveFingerprint + '</code>'
    }
    return html
}

// Build the contents of the duplicates dialogue.
//
// Entries are listed by record title and field name. The shared password is
// the grouping key and is never rendered: you learn that two entries collide
// without being shown the secret they collide on.
function mkReuseDlgBody() {
    let body = xmk('div').xId('x-reuse-dlg-body')
    let scope = ''
    if (window.prefs.hideInactiveRecords) {
        scope = ' Inactive records are excluded, per the Hide Inactive Records preference.'
    }
    if (cachedReuseCount === 0) {
        return body.xAppendChild(
            xmk('p').xInnerHTML('No stored password is used more than once.' + scope))
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
            'the entries below.' + scope))
    for (let i = 0; i < cachedReuseGroups.length; i++) {
        let group = cachedReuseGroups[i]
        let list = xmk('ul').xClass('x-reuse-group')
        for (const member of group) {
            let item = xmk('li')
            if (member.active === false) {
                // The title's own INACTIVE marker is stripped by vault.js, so
                // draw the distinction as an element rather than rendering a
                // user-controlled string as markup.
                item.xAppendChild(
                    xmk('span')
                        .xClass('badge', 'bg-secondary', 'me-2')
                        .xTextContent('INACTIVE'))
            }
            item.xAppend(
                xmk('span').xClass('fw-bold').xTextContent(member.title),
                xmk('span').xClass('text-secondary').xTextContent(' \u2014 ' + member.name))
            list.xAppendChild(item)
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
