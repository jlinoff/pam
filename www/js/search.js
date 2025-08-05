import { xmk, xget } from './lib.js'

let CACHED_SEARCH_VALUE = ''

// define search input element
export function mkSearchInputElement() {
    let e = xmk('input')
        .xId('search')
        .xClass('m-1', 'w-100')
        .xAttrs({
            'type': 'search',
            'title': 'search as you type',
            'placeholder': 'Search',
            'aria-label': 'Search'
        })
        .xAddEventListener('click', (event) => { searchRecords(event.target.value) })
        .xAddEventListener('input', (event) => { searchRecords(event.target.value) })
        .xAddEventListener('change', (event) => { searchRecords(event.target.value) })
        .xAddEventListener('paste', (event) => { searchRecords(event.target.value) })
    return e
}

function showRecord(accordionItem) {
    if (accordionItem.classList.contains('d-none')) {
        accordionItem.classList.remove('d-none')
    }
}

function hideRecord(accordionItem) {
    if (!accordionItem.classList.contains('d-none')) {
        accordionItem.classList.add('d-none')
    }
}

export function searchRecords(value) {
    if (!value) {
        // Allow the caller to use the last (cached) search value.
        value = CACHED_SEARCH_VALUE
    }
    if (value === '') {
        value = '.'
    }
    if (value === '.') {
        // This means means clear the old typed in search terms.
        clearSearch()
    }
    let regex = null
    try {
        regex = window.prefs.searchCaseInsensitive ? new RegExp(value, 'i') : new RegExp(value)
    } catch (exc) {
        // This can occur when a partial expression is being typed in.
        //alert(`ERROR! invalid search expression: "${value}"\nregexp:${exc}`)
        //console.log(`WARNING! invalid search expression: "${value}"\nregexp:${exc}`)
        value = '.'
        regex = window.prefs.searchCaseInsensitive ? new RegExp(value, 'i') : new RegExp(value)
    }
    let recordsContainer = document.body.xGet('#records-accordion') // middle part of the document.
    let accordionItems = recordsContainer.xGetN('.accordion-item')
    let num = 0
    for (let i=0; i<accordionItems.length; i++) {
        let accordionItem = accordionItems[i]
        let button = accordionItem.xGet('.accordion-button')
        let title = button.innerHTML
        let active = button.getAttribute('x-active') === 'true'
        let matched = false

        // ignore inactive records if the hide inactive records pref is set.
        if (active === false && window.prefs.hideInactiveRecords) {
            hideRecord(accordionItem)
            continue
        }

        // This record is a candidate for matching.
        // First try to match the title.
        if (title.match(regex) && window.prefs.searchRecordTitles) {
            matched = true
        } else {
            // title didn't match: search by field names
            if (!matched && window.prefs.searchRecordFieldNames) {
                let names = accordionItem.xGetN('.x-fld-name')
                for (let element of names) {
                    let name = element.innerHTML
                    if (name.match(regex)) {
                        matched = true
                        break
                    }
                }
            }

            // title and field name did not match: search by field values
            if (!matched && window.prefs.searchRecordFieldValues) {
                let values = accordionItem.xGetN('.x-fld-value')
                for (let element of values) {
                    let type = element.getAttribute('data-fld-type')
                    // how should passwords be managed? using the raw value
                    let value = element.getAttribute('data-fld-raw-value')
                    if (value.match(regex)) {
                        matched = true
                        break
                    }
                }
            }
        }

        // Cleanup. If the record matched, display it otherwise hide it.
        if (matched) {
            num += 1
            showRecord(accordionItem)
        } else {
            hideRecord(accordionItem)
        }
    }
    xget('#x-num-records').xInnerHTML(num)
    CACHED_SEARCH_VALUE = value
}

export function clearSearch() {
    document.body.xGet('#search').value = ''
    CACHED_SEARCH_VALUE = ''
}
