// prefs-model.js — pure data model for PAM preferences (SIMP-001)
// No DOM dependencies. Safe to import in unit tests without a browser context.

// These are the input types that the tool knows how to handle.
export const VALID_FIELD_TYPES = {
    'datetime-local': 1,
    'email': 1,
    'html': 1,
    'number': 1,  // HTML number input; displays as plain text with clipboard button
    'password': 1,
    'phone': 1,
    'text': 1,
    'textarea': 1,
    'time': 1,
    'url': 1,
}

// These are the storage strategies that the tool understands.
export const VALID_CACHE_STRATEGIES = {  // window.prefs.filePassCache
    'none': 1,
    'global': 1,
    'local': 1,
    'session': 1,
}

// Hash a prefs password with SHA-256.
// Retained here for potential use in Phase 7 crypto work.
// NOT used for lockPreferencesPassword (see SEC-006 revert).
export async function hashPrefsPassword(password) {
    if (!password || password.length === 0) {
        return ''
    }
    const enc = new TextEncoder()
    const buf = await window.crypto.subtle.digest('SHA-256', enc.encode(password))
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Return the default preferences object.
// Pure function — no DOM access, suitable for unit testing.
export function getDefaultPrefs() {
    return {
        themeName: 'dark',
        enablePrinting: false,
        enableSaveFile: true,
        fileName: 'example.txt',
        filePass: '',
        filePassCache: 'local',
        textareaMinHeight: '5em',
        editableFieldName: false,
        searchCaseInsensitive: true,
        searchRecordTitles: true,
        searchRecordFieldNames: false,
        searchRecordFieldValues: false,
        hideInactiveRecords: true,
        passwordRangeLengthDefault: 20,
        passwordRangeMinLength: 12,
        passwordRangeMaxLength: 32,
        memorablePasswordWordSeparator: '/',
        memorablePasswordMinWordLength: 2,
        memorablePasswordMinWords: 3,
        memorablePasswordMaxWords: 5,
        memorablePasswordMaxTries: 10000,
        clearBeforeLoad: true,
        customAboutInfo: '',
        cloneFieldValues: true,
        memorablePasswordPrefix: '',
        memorablePasswordSuffix: '',
        helpLink: './help/index.html',
        projectLink: 'https://github.com/jlinoff/pam',
        loadDupStrategy: 'ignore',
        logStatusToConsole: false,
        statusMsgDurationMS: 1500,
        predefinedRecordFields: {
            'account': 'text',
            'datetime': 'datetime-local',
            'email': 'email',
            'host': 'text',
            'html': 'html',
            'key': 'password',
            'login': 'text',
            'name': 'text',
            'note': 'textarea',
            'number': 'number',
            'phone': 'phone',
            'password': 'password',
            'secret': 'password',
            'text': 'text',
            'textarea': 'textarea',
            'time': 'time',
            'url': 'url',
            'username': 'text',
            'website': 'url',
        },
        predefinedRecordFieldsDefault: 'text',
        requireRecordFields: false,
        lockPreferencesPassword: '',
        allowHtmlFieldRendering: false,
        defaultRecordFields: 'website,login,password,note',
        enableRawJSONEdit: false,
    }
}
