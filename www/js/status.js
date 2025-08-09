// status messages
import { xget } from './lib.js'
import { clog } from './utils.js'

var STATUS_TIMEOUT = 1500
//var STATUS_ICON = '<i class="bi bi-info-square-fill"></i>'
var STATUS_ICON = '<i class="bi bi-exclamation-octagon"></i>'

// Report a status message.
export function status(msg) {
    let e = xget('#status')
    e.innerHTML = STATUS_ICON + '&nbsp;' + msg
    clog(msg)
}

// Report a status message for a period of time, then clear it.
export function statusBlipCustom(msg, ms) {
    status(msg)
    setTimeout(() => {xget('#status').innerHTML = '&nbsp;'}, ms)
}

// Report a status message for 1.5s, then clear it.
export function statusBlip(msg) {
    status(msg)
    setTimeout(() => {xget('#status').innerHTML = '&nbsp;'}, window.prefs.statusMsgDurationMS)
}
