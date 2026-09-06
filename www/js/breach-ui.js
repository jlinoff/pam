// The Breached Passwords report.
//
// Two states, and the disabled one matters more than it looks: it is what most
// users will see, because the preference is off by default. A menu entry that
// vanished when the preference was off would make the feature discoverable
// only by reading the README, so the entry stays and explains itself instead.

import { xmk } from './lib.js'
import { mkPopupModalDlg, mkPopupModalDlgButton } from './utils.js'
import { statusBlip } from './status.js'
import { getCurrentRecords } from './vault-ui.js'
import { partitionByActive, secretFields } from './vault.js'
import { checkAll, REJECT, UNDETERMINED } from './breach.js'

export const BREACH_DLG_ID = 'menuBreachDlg'

// Set while a check is running so Cancel can stop it between requests. A run
// over a few hundred passwords takes about a minute, which is long enough that
// starting one and being unable to stop it would be a poor bargain.
let cancelRequested = false
let running = false

/**
 * The passwords a vault-wide check would examine.
 *
 * Honours hideInactiveRecords for the same reason the reuse report does: a
 * deactivated record is a retired credential, and a breach affecting one is
 * not something to act on. It also means fewer requests, though that is a
 * side effect rather than the reason.
 *
 * Deduplicated by value, so a password used by three entries costs one
 * request rather than three. Every entry sharing it still gets reported.
 *
 * @returns {Array} [{value, entries: [{title, name}]}]
 */
export function passwordsToCheck() {
    const records = getCurrentRecords()
    const [active] = partitionByActive(records)
    const scope = window.prefs.hideInactiveRecords ? active : records

    const byValue = new Map()
    for (const field of secretFields(scope)) {
        if (!byValue.has(field.value)) {
            byValue.set(field.value, [])
        }
        byValue.get(field.value).push({title: field.title, name: field.name})
    }
    return Array.from(byValue.entries()).map(([value, entries]) => ({value, entries}))
}

/**
 * The body shown when the preference is off.
 *
 * This is a disclosure, not an error. It appears at the moment someone is
 * deciding whether to turn the feature on, which is the only moment the
 * trade-off is worth their attention.
 */
function disabledBody() {
    return xmk('div').xClass('container').xAppend(
        xmk('p').xInnerHTML(
            'Breach checking is <b>off</b>. Nothing has been sent and nothing ' +
            'will be until you turn it on.'),
        xmk('p').xInnerHTML(
            'When enabled, PAM checks your stored passwords against the ' +
            '<a href="https://haveibeenpwned.com/" target="_blank" rel="noopener">' +
            'Have I Been Pwned</a> corpus of passwords exposed in known ' +
            'breaches. It sends the first five characters of each password\'s ' +
            'SHA-1 hash \u2014 twenty bits \u2014 to ' +
            '<code>api.pwnedpasswords.com</code>, which returns every hash ' +
            'beginning with that prefix. The comparison happens here, in your ' +
            'browser.'),
        xmk('p').xInnerHTML(
            '<b>The password itself never leaves this device</b>, nor does its ' +
            'full hash, the record it belongs to, or anything else in your ' +
            'vault. The server learns only that someone asked about one of ' +
            'roughly 850,000 possible passwords.'),
        xmk('p').xInnerHTML(
            'That is a real privacy property, and it is not nothing. A request ' +
            'is made. An IP address is visible to the other end. Checking a ' +
            'whole vault sends one request per distinct password.'),
        xmk('p').xClass('fst-italic').xInnerHTML(
            'Turn it on in <b>Preferences \u2192 Administration \u2192 ' +
            'Enable Password Breach Check</b>. A ' +
            '<b>\u26A0 BREACH CHECK</b> badge appears in the toolbar while it ' +
            'is active.'))
}

/**
 * The body shown when the preference is on, before a check has been run.
 *
 * Nothing is sent on opening the dialogue. The request only happens when the
 * user presses the button, because a report that phoned home merely because
 * you looked at it would be a surprise.
 */
function readyBody() {
    const candidates = passwordsToCheck()
    let scope = ''
    if (window.prefs.hideInactiveRecords) {
        scope = ' Inactive records are excluded, per the Hide Inactive Records preference.'
    }

    const body = xmk('div').xClass('container').xId('x-breach-body')
    if (candidates.length === 0) {
        // The progress and results containers are included even here. They
        // were not, and the consequence was that Check on an empty vault
        // reported "internal error: the breach report body is not present" —
        // a correct message about the wrong thing.
        return body.xAppend(
            xmk('p').xInnerHTML('There are no stored passwords to check.' + scope),
            xmk('div').xId('x-breach-progress'),
            xmk('div').xId('x-breach-results'))
    }
    const requests = candidates.length === 1 ? '1 request' : `${candidates.length} requests`
    return body.xAppend(
        xmk('p').xInnerHTML(
            `Checking will send <b>${requests}</b> to ` +
            '<code>api.pwnedpasswords.com</code>, one per distinct password. ' +
            'Only a 20-bit hash prefix is sent; the comparison happens here.' +
            scope),
        xmk('p').xClass('fst-italic').xInnerHTML(
            'Nothing has been sent yet. Press <b>Check</b> to start.'),
        xmk('div').xId('x-breach-progress'),
        xmk('div').xId('x-breach-results'))
}

/**
 * Build the dialogue. Rebuilt on show, because which body to use depends on a
 * preference that can change between openings.
 */
export function menuBreachDlg() {
    const enabled = window.prefs.enablePasswordBreachCheck
    const body = enabled ? readyBody() : disabledBody()

    // Returns false so the dialogue stays open: the results are the point, and
    // mkPopupModalDlgButton() hides the modal on a truthy return.
    // startBreachCheck() is async: an exception inside it becomes a rejected
    // promise, which would otherwise vanish without the button appearing to do
    // anything. Surface it.
    const check = mkPopupModalDlgButton(
        'Check', 'btn-primary', 'check every stored password against the corpus',
        () => {
            startBreachCheck().catch((error) => {
                statusBlip(`breach check failed: ${error}`)
            })
            return false
        })
    check.xId('x-breach-check-button')

    const cancel = mkPopupModalDlgButton(
        'Cancel', 'btn-warning', 'stop the check after the current request',
        () => { cancelRequested = true; return false })
    cancel.xId('x-breach-cancel-button')
    cancel.xStyle({'display': 'none'})

    // The x-fld-record-close class is derived from the label by the helper,
    // so the e2e tests find this the same way they find every other Close.
    // The fourth argument is required, not optional: the helper's click
    // handler calls callback(...) unconditionally and only hides the modal on
    // a truthy return. Omitting it throws inside the handler, so the button
    // does nothing at all — which is what happened the first time.
    const close = mkPopupModalDlgButton('Close', 'btn-secondary',
                                        'close the dialogue',
                                        () => { return true })
    const dlg = mkPopupModalDlg(BREACH_DLG_ID, 'Breached Passwords', body,
                                check, cancel, close)

    dlg.xAddEventListener('show.bs.modal', () => {
        refreshBreachDlgBody()
    })

    // Closing the dialogue stops the run.
    //
    // Without this, closing left the check going: the loop kept sending
    // requests the user was no longer watching, and reopening rebuilt the body
    // and orphaned the progress element the run was writing to. The `running`
    // flag then blocked a new run, so Check did nothing — the symptom that
    // led here.
    //
    // Stopping is also the honest behaviour on its own terms. The user closed
    // the report; continuing to contact a third party on their behalf is not
    // something to do quietly.
    dlg.xAddEventListener('hide.bs.modal', () => {
        cancelRequested = true
    })
    return dlg
}

/**
 * Show or hide the buttons for the current state.
 */
function setButtons(state) {
    const check = document.getElementById('x-breach-check-button')
    const cancel = document.getElementById('x-breach-cancel-button')
    if (check) {
        // Hidden when there is nothing to check, as well as when the feature
        // is off. A button that can only report that it has no work to do is
        // an invitation to press it and learn nothing.
        const ready = state === 'ready' && window.prefs.enablePasswordBreachCheck
        const show = ready && passwordsToCheck().length > 0
        check.style.display = show ? 'inline-block' : 'none'
    }
    if (cancel) {
        cancel.style.display = state === 'running' ? 'inline-block' : 'none'
    }
}

/**
 * Run the check and render its results.
 */
export async function startBreachCheck() {
    if (running) {
        // Not a silent return. This is reachable: closing the dialogue does
        // not stop a run instantly — the loop finishes its current request
        // first — so a quick close and reopen can land here.
        statusBlip('a breach check is already running')
        return
    }
    // No silent return. If these are missing the button appears to do nothing,
    // which is indistinguishable from a broken check — say so instead.
    const progress = document.getElementById('x-breach-progress')
    const results = document.getElementById('x-breach-results')
    if (!progress || !results) {
        statusBlip('internal error: the breach report body is not present')
        return
    }

    running = true
    cancelRequested = false
    setButtons('running')
    results.innerHTML = ''

    const candidates = passwordsToCheck()
    progress.innerHTML = `Checking 0 of ${candidates.length}\u2026`

    let outcome = null
    try {
        outcome = await checkAll(candidates, window.fetch.bind(window), {
            onProgress: (done, total) => {
                progress.innerHTML = `Checking ${done} of ${total}\u2026`
            },
            isCancelled: () => cancelRequested,
        })
    } finally {
        running = false
        setButtons('ready')
    }
    renderBreachResults(progress, results, outcome, candidates.length)
}

/**
 * Render the outcome of a run.
 *
 * The three states are kept distinct in the output, because collapsing
 * "could not check" into "no problem found" is the failure this whole feature
 * is built to avoid.
 */
export function renderBreachResults(progress, results, outcome, total) {
    results.innerHTML = ''

    if (outcome.probeFailed) {
        progress.innerHTML = ''
        results.appendChild(xmk('p').xClass('fw-bold').xInnerHTML(
            '\u26A0 Could not reach the breach corpus, so <b>nothing was ' +
            'checked</b>. This is not the same as finding no problems.'))
        results.appendChild(xmk('p').xClass('fst-italic').xInnerHTML(outcome.reason))
        return
    }

    const breached = outcome.results.filter((r) => r.verdict === REJECT)
    const unknown = outcome.results.filter((r) => r.verdict === UNDETERMINED)
    const checked = outcome.results.length

    if (outcome.cancelled) {
        progress.innerHTML =
            `Stopped after ${checked} of ${total}. The rest were not checked.`
    } else {
        progress.innerHTML = `Checked ${checked} of ${total}.`
    }

    if (breached.length === 0 && unknown.length === 0) {
        results.appendChild(xmk('p').xInnerHTML(
            'No password that was checked appears in the corpus, and none is ' +
            'structurally weak.'))
        return
    }

    if (breached.length > 0) {
        // Two different problems with different urgency, so the summary counts
        // them separately. A password in the corpus is published: whoever has
        // the dump has it, and it should change today. A structurally weak one
        // is a bad bet that has not necessarily been lost yet.
        const inCorpus = breached.filter((r) => r.inCorpus)
        const weakOnly = breached.filter((r) => !r.inCorpus)
        const parts = []
        if (inCorpus.length > 0) {
            parts.push(`${inCorpus.length} found in the breach corpus`)
        }
        if (weakOnly.length > 0) {
            parts.push(`${weakOnly.length} structurally weak`)
        }
        results.appendChild(xmk('p').xClass('fw-bold').xInnerHTML(
            `${breached.length} password(s) should be changed \u2014 ` +
            parts.join(', ') + ':'))

        const list = xmk('ul')
        for (const item of breached) {
            // The label comes from the inCorpus flag, not from reading the
            // reason text. A report of 85 problems is unusable if every entry
            // renders the same and the reader has to parse prose to tell a
            // breach from a short password.
            const label = item.inCorpus ? 'BREACHED' : 'WEAK'
            const tone = item.inCorpus ? 'bg-danger' : 'bg-warning text-dark'
            for (const entry of item.entries) {
                list.appendChild(xmk('li').xAppend(
                    xmk('span').xClass('badge', ...tone.split(' '), 'me-2')
                        .xTextContent(label),
                    xmk('span').xClass('fw-bold').xTextContent(entry.title),
                    xmk('span').xClass('text-secondary')
                        .xTextContent(' \u2014 ' + entry.name),
                    xmk('div').xClass('text-secondary', 'ms-1').xTextContent(
                        item.reasons.join('; '))))
            }
        }
        results.appendChild(list)
    }

    if (unknown.length > 0) {
        // Named separately and never merged with the clean result.
        results.appendChild(xmk('p').xClass('fw-bold').xInnerHTML(
            `\u26A0 ${unknown.length} password(s) could not be checked. ` +
            'Nothing was learned about these.'))
        const list = xmk('ul')
        for (const item of unknown) {
            for (const entry of item.entries) {
                list.appendChild(xmk('li').xAppend(
                    xmk('span').xClass('fw-bold').xTextContent(entry.title),
                    xmk('span').xClass('text-secondary')
                        .xTextContent(' \u2014 ' + entry.name)))
            }
        }
        results.appendChild(list)
    }
}

/**
 * Replace the dialogue body to match the current preference state.
 */
export function refreshBreachDlgBody() {
    const dlg = document.getElementById(BREACH_DLG_ID)
    if (!dlg) {
        statusBlip('internal error: the breach dialogue is not in the document')
        return
    }
    const container = dlg.querySelector('.modal-body')
    if (!container) {
        statusBlip('internal error: the breach dialogue has no body')
        return
    }
    const enabled = window.prefs.enablePasswordBreachCheck
    container.innerHTML = ''
    container.appendChild(enabled ? readyBody() : disabledBody())
    setButtons('ready')
}
