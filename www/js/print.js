// Print the records in plaintext top
/**
 * Print records in plaintext to allow users to store them
 * locally. This is not secure but it allows users to keep a hard
 * copy.
 */
import { xmk, xget, xgetn, enableFunctionChaining } from './lib.js'
import { statusBlip } from './status.js'
import { VERSION } from './version.js'  // automatically generated by make

export function enablePrinting() {
    let eps = document.body.xGetN('.x-print')
    for (let ep of eps) {
        if ( window.prefs.enablePrinting ) {
            ep.xStyle({'display': 'block'})
        } else {
            ep.xStyle({'display': 'none'})
        }
    }
}

export function printRecords() {
    statusBlip(`generating print document...`)
    let html = genRecordsDocument()
    let pwin = window.open()
    pwin.document.write(html)
    pwin.print()
    pwin.close()
}

// The new Sanitizer API is not yet widely available.
function sanitize(html) {
    return html.replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll("'", '&apos;')
        .replaceAll('"', '&quot;')
}

function genRecordsDocument() {
    let recordsContainer = document.body.xGet('#records-accordion') // middle part of the document.
    if (!recordsContainer) {
        return '<h4>No records</h4>'
    }
    let accordionItems = recordsContainer.xGetN('.accordion-item')
    if (!accordionItems) {
        return '<h4>No records</h4>'
    }
    if (accordionItems.length === 0) {
        return '<h4>No records available</h4>'
    }

    // Count the number of records that will be printed.
    let count = 0
    for (let i=0; i<accordionItems.length; i++) {
        let accordionItem = accordionItems[i]
        if (accordionItem.classList.contains('d-none') === false) {
            count += 1
        }
    }
    if (count === 0) {
        return '<h4>No records selected</h4>'
    }

    // Get the search string.
    let search = document.getElementById('search').value

    // The header.
    let html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Records Report</title>
    <meta name="author" content="Joe Linoff">
    <meta http-equiv="content-type" content="text/html; charset=utf-8" />
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <center>
`
    html += '      <h2>PAM Records Report</h2>\n'
    html += '      <h4 style="margin-top:-1em;">\n'
    if (!!search) {
        search = sanitize(search)
        html += `Found ${count} Records Containing "${search}"<br />`
    } else {
        html += `All ${count} Records<br />`
    }

    if (window.prefs.lastUpdated) {
        html += `Last Updated: ${sanitize(window.prefs.lastUpdated)}<br />`
    }
    html += '      </h4>'

    // Get the record data and build the HTML contents.
    let twidth = '90%'
    let cpad = 'padding-left:0.5em;padding-right:0.5em;padding-top:0.25em;padding-bottom:0.25em'
    let tpad = 'font-size:larger;' + cpad
    let tpad1 = 'font-size:x-large;' + cpad
    tpad1 += 'background-color:lightgray !important;print-color-adjust: exact;' // title only
    let tstyle = 'font-size:larger;page-break-inside:avoid'
    let vstyle = `${tpad}`
    let fstyle = tpad
    let pstyle = 'white-space: pre-wrap;word-break: keep-all; margin-top:0; margin-bottom:0'
    let index = 0
    for (let i=0; i<accordionItems.length; i++) {
        let accordionItem = accordionItems[i]
        if (accordionItem.classList.contains('d-none') ===true) {
            continue
        }
        let button = accordionItem.xGet('.accordion-button')
        let title = button.innerHTML
        index += 1
        html += `
      <!-- <p>&nbsp;</p> -->
      <br />
      <table border="1" cellpadding="0" cellspacing="0" width="90%" style="${tstyle}">
          <thead>
            <tr>
             <th valign="middle" bgcolor="lightgray" colspan="2" style="${tpad1}">
               <b>&nbsp;${title}&nbsp;</b>
             </th>
           </tr>
         </thead>
         <tbody>
           <tr>
             <td valign="middle" align="right" style="${fstyle}">
               &nbsp;<i>__index__</i>:&nbsp;
             </td>
             <td valign="middle" align="left" style="${vstyle}">
               <pre style="${pstyle}">${index}</pre>
             </td>
           </tr>
`
        let rows = accordionItem.xGetN('.row')
        for (let i=0; i<rows.length; i++) {
            let row = rows[i]
            let nameDiv = row.xGet('.x-fld-name')
            if (!nameDiv) {
                continue // button row
            }
            let name = nameDiv.innerHTML
            let valueDiv = row.xGet('.x-fld-value')
            let type = valueDiv.getAttribute('data-fld-type')
            let value = valueDiv.innerHTML
            switch( type ) {
            case 'html':
            case 'password':
            case 'textarea':
            case 'url':
                value = valueDiv.getAttribute('data-fld-raw-value')
                break
            default:
                break
            }
            name = sanitize(name)
            if (type !== 'html') {
                // Don't try to sanitize HTML elements.
                value = sanitize(value)
            }

            // row prefix and name
            html += `
           <tr>
             <td valign="middle" align="right" style="${fstyle}">
               &nbsp;${name}:&nbsp;
             </td>
             <td valign="middle" align="left" style="${vstyle}">
`
            // row value
            html += `               <pre style="${pstyle}">${value}</pre>`
            /*if (type === 'textarea') {
                html += `               <pre style="${pstyle}">${value}</pre>`
            } else {
                html += `               ${value}`
            }*/

            // row suffix
            html += `
             </td>
           </tr>
`
        }
        html += `
         </tbody>
       </table>
`
    }
    html += `
    </center>
  </body>
</html>
`
    return html
}
