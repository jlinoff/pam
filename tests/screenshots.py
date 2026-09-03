#!/usr/bin/env python3
'''
Capture the README screenshots that go stale whenever the UI changes.

The README is the in-app help: `make app-help` renders it into
www/help/index.html. A stale screenshot is stale help, not just a stale doc.

WHAT THIS DOES NOT DO
---------------------
It does not regenerate all 56 pam-*.png images. Conceptual diagrams, annotated
figures and mid-workflow captures cannot be scripted and stay hand-made. This
covers the preference tabs and the standard dialogues — the ones that go out of
date every time a setting is added, which is the recurring cost.

DETERMINISM
-----------
Rendering is not reproducible across machines: font hinting, DPI and the Chrome
version all affect the bytes. Regenerating on a different machine produces
different PNGs with identical content. So:

  - one person regenerates, or it runs in a pinned container
  - files are written only when the bytes actually change, to keep binary churn
    out of git
  - volatile content (version, commit id, branch) is stubbed before capture,
    otherwise those images churn on every commit

USAGE
-----
    make screenshots            # capture, write only what changed
    make screenshots CHECK=1    # report what would change, write nothing
'''

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Reusing the e2e helpers rather than duplicating them: the driver options,
# the menu walk and the example-record load are all already solved there.
# pytest only collects test_*.py, so this module is not picked up as a test.
from test_chrome import (  # pylint: disable=wrong-import-position
    get_driver, choose_menu_option, scroll_and_click, load_example_records,
    get_parent, get_children,
)
from selenium.webdriver.common.by import By  # pylint: disable=wrong-import-position

# get_driver() uses 1920x1080, and chromedriver's element screenshot stops at
# the viewport: a dialogue taller than the window is silently cut off, and the
# result still looks like a perfectly good screenshot. The Administration,
# Miscellaneous and Record Fields tabs all came out at exactly 1080-minus-chrome
# until this was raised.
#
# Only the height changes. Width drives the responsive breakpoints, so 1920
# stays as it is to keep the layout identical to the e2e tests.
WINDOW = (1920, 3000)

HERE = os.path.dirname(os.path.abspath(__file__))
HELP = os.path.join(os.path.dirname(HERE), 'www', 'help')
URL = 'http://localhost:8081/'

# The About dialogue carries two sources of per-run churn:
#
#   1. Version, Branch and Commit, which change on every commit. These are
#      anonymous <div>s inside #about with no ids, so they are matched by their
#      text prefix rather than selected directly.
#   2. The file-info line, which embeds now.toISOString() and an elapsed-time
#      string, so it differs on every single run.
#
# Left alone, About would be rewritten by every capture and every rewrite is a
# new blob in git history. The fingerprint lines are NOT stubbed: they are
# deterministic given the example records, and showing a real one is the point.
STUB_PREFIXES = {
    'Version ': 'Version 2.3.0',
    'Branch ': 'Branch main',
    'Commit ': 'Commit 2026-01-01 00:00:00 -0800 (abc1234)',
}
STUB_FILE_INFO = ('Loaded 8 active and 1 inactive records on '
                  '2026-01-01T00:00:00.000Z.<br>'
                  'Records were last updated on 2026-01-01T00:00:00.000Z (just now).')


def stub_volatile(driver):
    '''Replace per-run text so the About capture is stable across builds.

    Returns the number of substitutions made, so a silent no-op — the shape of
    the dialogue changing under us — is visible rather than producing a churning
    image nobody notices.
    '''
    return driver.execute_script(
        'let n = 0;'
        'const about = document.getElementById("about");'
        'if (about) {'
        '  for (const div of about.querySelectorAll("div")) {'
        '    for (const [prefix, value] of Object.entries(arguments[0])) {'
        '      if (div.innerHTML.startsWith(prefix)) { div.innerHTML = value; n++; }'
        '    }'
        '  }'
        '}'
        'const info = document.getElementById("x-about-file-info");'
        'if (info && info.innerHTML) { info.innerHTML = arguments[1]; n++; }'
        'return n;', STUB_PREFIXES, STUB_FILE_INFO)


# Bootstrap's modal fade is 300ms and choose_menu_option() waits 500ms. That is
# enough for a click but leaves no margin for a screenshot, and a capture taken
# mid-fade is a half-transparent dialogue that differs on every run.
SETTLE = 0.6


def modal_content(dlg):
    '''Crop target for a dialogue capture.

    choose_menu_option() returns the outer .modal element, which is
    position:fixed and fills the viewport — photographing it yields a
    1920x1080 image with a small dialogue in the middle. .modal-content is the
    visible box.
    '''
    return dlg.find_element(By.CLASS_NAME, 'modal-content')


def open_prefs_tab(driver, tab_id):
    '''Open Preferences and select one tab. Returns the crop target.'''
    dlg = choose_menu_option(driver, 'Preferences')
    button = dlg.find_element(By.ID, f'{tab_id}-btn')
    scroll_and_click(driver, button)
    time.sleep(SETTLE)
    return modal_content(dlg)


# Each entry is (filename, capture function). The function receives the driver
# and returns the element to photograph. Adding a screen later is one line.
def shot_menu(driver):
    '''The main dropdown menu, opened.

    Reached the same way choose_menu_option() reaches it, rather than by
    find_element(By.CLASS_NAME, 'dropdown-menu'): several elements carry that
    class — the New Record field-type list among them — and find_element
    returns the first, which is hidden and therefore zero width.
    '''
    menu = driver.find_element(By.ID, 'menu')
    scroll_and_click(driver, menu)
    time.sleep(SETTLE)
    return get_children(get_parent(menu))[1]


def shot_prefs_search(driver):
    '''Preferences, Search tab.'''
    return open_prefs_tab(driver, 'prefs-tab-search')


def shot_prefs_passwords(driver):
    '''Preferences, Passwords tab.'''
    return open_prefs_tab(driver, 'prefs-tab-passwords')


def shot_prefs_misc(driver):
    '''Preferences, Miscellaneous tab.'''
    return open_prefs_tab(driver, 'prefs-tab-misc')


def shot_prefs_fields(driver):
    '''Preferences, Record Fields tab.'''
    return open_prefs_tab(driver, 'prefs-tab-fields')


def shot_prefs_admin(driver):
    '''Preferences, Administration tab.

    Not previously documented at all — there is no hand-made screenshot of
    this tab, and it now holds three security-relevant settings.
    '''
    return open_prefs_tab(driver, 'prefs-tab-admin')


def shot_about(driver):
    '''The About dialogue, including the vault fingerprints.

    Volatile content is stubbed first; see stub_volatile(). The dialogue must
    be open before stubbing, since #about does not exist until then.
    '''
    dlg = choose_menu_option(driver, 'About')
    time.sleep(SETTLE)
    substitutions = stub_volatile(driver)
    if substitutions < len(STUB_PREFIXES) + 1:
        raise RuntimeError(
            f'stub_volatile replaced only {substitutions} of '
            f'{len(STUB_PREFIXES) + 1} volatile fields — the About dialogue '
            'has changed shape and this capture would churn on every run')
    return modal_content(dlg)


def shot_reused_passwords(driver):
    '''The Reused Passwords report.

    The example records include an Instagram entry deliberately sharing
    Facebook's password, so this capture has something real to show without
    any setup beyond loading them — and the feature is exercised end to end
    rather than having its output staged.
    '''
    dlg = choose_menu_option(driver, 'Reused Passwords')
    time.sleep(SETTLE)
    content = modal_content(dlg)
    if 'Facebook' not in content.text or 'Instagram' not in content.text:
        raise RuntimeError(
            'the Reused Passwords report does not list Facebook and Instagram '
            '— either the example records lost their shared password or the '
            f'report is broken. Got: {content.text[:200]!r}')
    return content


SHOTS = [
    ('pam-menu.png', shot_menu),
    ('pam-about.png', shot_about),
    ('pam-reused-passwords.png', shot_reused_passwords),
    ('pam-prefs-search.png', shot_prefs_search),
    ('pam-prefs-password.png', shot_prefs_passwords),
    ('pam-prefs-miscellaneous.png', shot_prefs_misc),
    ('pam-prefs-record-fields.png', shot_prefs_fields),
    ('pam-prefs-admin.png', shot_prefs_admin),
]


def png_size(data):
    '''Width and height from a PNG's IHDR chunk, without pulling in Pillow.'''
    return (int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big'))


def capture(driver, filename, func, check_only):
    '''Capture one screenshot. Returns 'new', 'changed' or 'same'.'''
    path = os.path.join(HELP, filename)
    element = func(driver)

    # A hidden or collapsed element yields "Cannot take screenshot with 0
    # width" from chromedriver, several frames deep and without naming the
    # shot. Check here so the message says which capture went wrong and why.
    size = element.size
    if not size['width'] or not size['height']:
        raise RuntimeError(
            f'{filename}: capture target is {size["width"]}x{size["height"]} '
            f'and displayed={element.is_displayed()} — the selector probably '
            'matched a hidden element rather than the visible one')

    png = element.screenshot_as_png

    # A capture cut off at the viewport still looks like a good screenshot —
    # it is simply missing the bottom of the dialogue, footer buttons and all.
    # Compare what was written against how tall the element actually is.
    shot_height = png_size(png)[1]
    if shot_height + 2 < size['height']:
        raise RuntimeError(
            f'{filename}: captured {shot_height}px of a {size["height"]}px '
            f'element — the window ({WINDOW[0]}x{WINDOW[1]}) is too short and '
            'the bottom of this dialogue is missing')

    if not os.path.exists(path):
        state = 'new'
    else:
        with open(path, 'rb') as handle:
            state = 'same' if handle.read() == png else 'changed'

    if state != 'same' and not check_only:
        with open(path, 'wb') as handle:
            handle.write(png)
    return state


def main():
    '''Walk the shot list. Returns 0, or 1 in check mode if anything differs.'''
    check_only = os.environ.get('CHECK') == '1'
    driver = get_driver()
    changed = []
    try:
        driver.set_window_size(*WINDOW)
        driver.get(URL)
        time.sleep(1)
        load_example_records(driver)
        time.sleep(1)

        for filename, func in SHOTS:
            state = capture(driver, filename, func, check_only)
            marker = {'new': 'NEW    ', 'changed': 'CHANGED', 'same': 'same   '}[state]
            print(f'  {marker}  {filename}')
            if state != 'same':
                changed.append(filename)
            # Every capture leaves a dialogue or menu open; clear it before the
            # next one by reloading, which is cheaper to reason about than
            # tracking which close button each surface uses.
            driver.get(URL)
            time.sleep(0.8)
            load_example_records(driver)
            time.sleep(0.8)
    finally:
        driver.quit()

    print()
    if not changed:
        print(f'{len(SHOTS)} screenshots, none changed')
        return 0
    verb = 'would change' if check_only else 'written'
    print(f'{len(changed)} of {len(SHOTS)} {verb}: {", ".join(changed)}')
    return 1 if check_only else 0


if __name__ == '__main__':
    sys.exit(main())
