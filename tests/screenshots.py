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
    get_driver, choose_menu_option, scroll_and_click,
    get_parent, get_children, set_theme,
)
from selenium.webdriver.common.by import By  # pylint: disable=wrong-import-position
from selenium.common.exceptions import (  # pylint: disable=wrong-import-position
    NoAlertPresentException, UnexpectedAlertPresentException,
)

# get_driver() uses 1920x1080, and chromedriver's element screenshot stops at
# the viewport: a dialogue taller than the window is silently cut off, and the
# result still looks like a perfectly good screenshot. The Administration,
# Miscellaneous and Record Fields tabs all came out at exactly 1080-minus-chrome
# until this was raised.
#
# Only the height changes. Width drives the responsive breakpoints, so 1920
# stays as it is to keep the layout identical to the e2e tests.
WINDOW = (1920, 3000)

# Full-page captures use a narrow window instead. The hand-made images this
# replaces were all 800x1600, which is PAM in a phone-shaped viewport — the
# "iPhone" captures have no device frame or iOS chrome, they are just a narrow
# browser. Keeping the same size keeps the README's width="400" renderings
# looking as they did.
NARROW = (800, 1600)

# Height sentinel meaning "shrink until the content just fits".
#
# The example vault fills less than half of an 800x1600 viewport, so those
# captures carry a large empty band below the records. The footer is
# `fixed-bottom` and #mid-section is `h-100 overflow-auto`, so reducing the
# viewport height pulls the footer up under the last record rather than
# clipping anything: the result is a real screenshot of a shorter window, not
# a cropped image.
#
# Deliberately NOT applied to the iPhone captures; see IPHONE below.
FIT = 'fit'

# Never shrink below this. A viewport too short to hold the fixed header and
# footer produces a nonsense image rather than a compact one.
MIN_FIT_HEIGHT = 320

# A real iPhone viewport: 393x852 CSS pixels, the iPhone 15 / 16 logical size.
#
# CSS pixels, not device pixels. An iPhone 15 is physically 1179x2556, but
# setting a 786-wide viewport would lay the page out at tablet width and
# render nothing like a phone — PAM is responsive, so the CSS width is what
# determines the layout. The resulting image is 393x852 at 1x; a retina-density
# capture would need --force-device-scale-factor on the driver, which
# get_driver() does not set and which the e2e tests share.
#
# The README says of these two captures "it looks something like this on my
# iphone", so the empty space below the records is not waste — it is what the
# claim asserts, and eight records really do leave a phone screen mostly
# empty. The other full-page shots are fitted to content precisely because
# they make no such claim.
#
# Without this they would be identical to pam-example-records and
# pam-basic-sections: same theme, same data, same viewport. The genuine phone
# dimensions are what earn them separate files.
IPHONE = (393, 852)

# Chrome will not make a window narrower than about 500px on macOS, so a
# 393px viewport is unreachable by resizing. Device emulation via the Chrome
# DevTools Protocol sets the viewport independently of the window, which also
# makes a 2x capture possible — the retina density that plain resizing could
# not give.
IPHONE_SCALE = 2

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


def load_examples(driver, timeout=10.0):
    """Load the example records, waiting for the outcome rather than a delay.

    load_example_records() in test_chrome.py accepts the confirm() alert after
    a fixed 0.5s sleep, inside a try that swallows NoAlertPresentException. If
    the alert is slow the accept is skipped, and the alert then blocks the
    next WebDriver command with UnexpectedAlertPresentException — which is how
    this surfaced: not on the load, but on a set_window_size two shots later.

    A screenshot run reloads between every capture, so it hits that race far
    more often than the test suite does.
    """
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    example = next((b for b in buttons if 'Load Example Records' in b.text), None)
    if example is None:
        raise RuntimeError('no "Load Example Records" button in the Load File dialogue')
    example.click()

    deadline = time.time() + timeout
    accepted = False
    while time.time() < deadline:
        try:
            driver.switch_to.alert.accept()
            accepted = True
            time.sleep(0.4)
        except NoAlertPresentException:
            if accepted and driver.find_elements(By.CLASS_NAME, 'accordion-button'):
                time.sleep(0.4)
                return
            time.sleep(0.2)
    raise RuntimeError(
        f'example records did not load within {timeout}s '
        f'(confirm accepted: {accepted})')


# JavaScript used by fit_viewport_to_content(), kept as constants so the
# quoting stays readable.
MEASURE_JS = (
    "const mid = document.getElementById('mid-section');"
    "const acc = document.getElementById('records-accordion');"
    "if (!mid || !acc) { return null; }"
    "const cs = window.getComputedStyle(mid);"
    "const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);"
    "return Math.ceil(acc.scrollHeight + pad);"
)
OVERFLOW_JS = (
    "const mid = document.getElementById('mid-section');"
    "return mid ? mid.scrollHeight - mid.clientHeight : 0;"
)


def set_device_metrics(driver, width, height, scale=1, mobile=True):
    """Emulate a device viewport through the DevTools Protocol.

    set_window_size() cannot produce a phone-width viewport: Chrome enforces a
    minimum window width around 500px on macOS, so asking for 393 yields 500.
    Emulation.setDeviceMetricsOverride sets the viewport directly, and takes a
    deviceScaleFactor, so the capture can be retina density as well.

    Chrome-specific, which is fine — the whole harness is ChromeDriver.
    """
    driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {
        'width': width,
        'height': height,
        'deviceScaleFactor': scale,
        'mobile': mobile,
    })
    time.sleep(0.4)


def clear_device_metrics(driver):
    """Drop any device emulation, so later shots size normally."""
    driver.execute_cdp_cmd('Emulation.clearDeviceMetricsOverride', {})
    time.sleep(0.3)


def fit_viewport_to_content(driver, width, start_height):
    """Shrink the viewport height until the records just fit.

    #mid-section is `h-100` with vertical padding that clears the fixed header
    and footer, so the height it needs is the accordion's natural height plus
    that padding. Computed directly rather than by binary search — one resize
    instead of eight — then verified, because a computed value that turns out
    too small would silently clip the last record.
    """
    set_viewport_size(driver, width, start_height)
    needed = driver.execute_script(MEASURE_JS)
    if not needed:
        return start_height

    height = max(MIN_FIT_HEIGHT, min(int(needed), start_height))
    set_viewport_size(driver, width, height)

    # Verify rather than trust the arithmetic. If the middle section still
    # scrolls, the content is taller than computed and the bottom would be cut
    # off. Grow by the shortfall and check again.
    for _ in range(3):
        overflow = driver.execute_script(OVERFLOW_JS)
        if overflow <= 0:
            return height
        height = min(height + overflow + 8, start_height)
        set_viewport_size(driver, width, height)
    raise RuntimeError(
        f'could not fit the content into {width}x{height} without scrolling')


def set_viewport_size(driver, width, height):
    """Size the window so the *viewport* ends up width x height.

    set_window_size() sets the outer window, which is taller and wider than
    the viewport by however much chrome the browser is drawing — 143px of
    height here. Measuring the difference and correcting for it is the only
    portable way to get a known viewport size, since the offset varies by
    platform and Chrome version.
    """
    try:
        driver.set_window_size(width, height)
    except UnexpectedAlertPresentException:
        # Something left a dialog open. Clear it and say so rather than
        # failing three frames deep in Selenium.
        driver.switch_to.alert.accept()
        raise RuntimeError(
            'an unhandled browser alert was open when resizing the window; '
            'a previous capture left one behind') from None
    time.sleep(0.3)
    for _ in range(5):
        inner = driver.execute_script(
            'return [window.innerWidth, window.innerHeight];')
        dw = width - inner[0]
        dh = height - inner[1]
        if dw == 0 and dh == 0:
            return
        outer = driver.get_window_size()
        driver.set_window_size(outer['width'] + dw, outer['height'] + dh)
        time.sleep(0.3)
    raise RuntimeError(
        f'could not size the viewport to {width}x{height}; got '
        f'{inner[0]}x{inner[1]}. The window may be at a platform minimum or '
        'maximum.')


class Viewport:
    """The whole visible page as a capture target.

    Wraps the driver so it presents the same `size` and `screenshot_as_png`
    interface a WebElement does, which keeps capture() — including its zero-size
    and truncation guards — working unchanged for full-page shots.
    """

    def __init__(self, driver):
        self._driver = driver

    @property
    def size(self):
        """Inner viewport dimensions, matching WebElement.size.

        Not get_window_size(): that reports the OUTER window, which includes
        browser chrome. A screenshot captures the viewport, so comparing the
        two made the truncation guard fire on a capture that was complete.
        """
        inner = self._driver.execute_script(
            'return {width: window.innerWidth, height: window.innerHeight};')
        return inner

    @property
    def screenshot_as_png(self):
        """The visible page, matching WebElement.screenshot_as_png."""
        return self._driver.get_screenshot_as_png()

    def is_displayed(self):
        """Always true; present so the zero-size guard can report on it."""
        return self._driver is not None


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


# ---------------------------------------------------------------------------
# Phase 2: full-viewport states
# ---------------------------------------------------------------------------

def shot_records_dark(driver):
    '''All records, unexpanded, dark theme, phone-shaped viewport.'''
    set_theme(driver, 'dark')
    time.sleep(SETTLE)
    return Viewport(driver)


def shot_records_light(driver):
    '''The same view in the light theme.'''
    set_theme(driver, 'light')
    time.sleep(SETTLE)
    return Viewport(driver)


def search_for(driver, term):
    '''Type a term into the search box and let the filter settle.'''
    box = driver.find_element(By.ID, 'search')
    box.clear()
    box.send_keys(term)
    time.sleep(SETTLE)
    return Viewport(driver)


def shot_search_g(driver):
    '''Search for "g" — a plain substring match across titles.'''
    set_theme(driver, 'dark')
    return search_for(driver, 'g')


def shot_search_g_re(driver):
    '''Search for "^g" — the same box, used as a regular expression.'''
    set_theme(driver, 'dark')
    return search_for(driver, '^g')


def shot_status_msg(driver):
    '''A record expanded, with a transient status message showing.

    The message clears after statusMsgDurationMS, so that preference is
    raised first — otherwise the capture races the timeout and intermittently
    produces an image with no message in it.
    '''
    set_theme(driver, 'dark')
    driver.execute_script('window.prefs.statusMsgDurationMS = 60000')

    buttons = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    facebook = next((b for b in buttons if 'Facebook' in b.text), None)
    if facebook is None:
        raise RuntimeError('no Facebook record to expand')
    scroll_and_click(driver, facebook)
    time.sleep(SETTLE)

    item = facebook.find_element(
        By.XPATH, './ancestor::div[contains(@class, "accordion-item")]')

    # The title lives on the <i> inside the button, not on the button:
    # icon(name, tooltip) in utils.js sets it there. Click the icon and let
    # the event bubble to the button.
    icons = [e for e in item.find_elements(
        By.CSS_SELECTOR, 'i[title="copy to clipboard"]') if e.is_displayed()]
    if not icons:
        raise RuntimeError(
            'no visible copy icon on the expanded record — the record may not '
            'have expanded, or the icon tooltip text has changed')
    scroll_and_click(driver, icons[0])
    time.sleep(SETTLE)
    return Viewport(driver)


# ---------------------------------------------------------------------------
# Phase 3: dialogues needing preference or state setup
# ---------------------------------------------------------------------------

# Matches what the hand-made pam-about-custom.png showed, so the README prose
# describing "a simple custom message that uses bootstrap formatting classes"
# still matches the picture.
CUSTOM_ABOUT = ('<div class="bg-primary text-white p-3 rounded">'
                '<h4>Custom Stuff</h4><div>custom stuff here!</div></div>')


def shot_about_custom(driver):
    '''About with a custom message set through the preferences.

    mkAbout() reads customAboutInfo when it builds, and menuAboutDlg() runs
    once at startup — so setting the preference is not enough on its own.
    refreshAbout() rebuilds the dialogue body from the current value, which is
    what the Preferences dialogue itself calls after a save.
    '''
    driver.execute_script('window.prefs.customAboutInfo = arguments[0];', CUSTOM_ABOUT)
    driver.execute_async_script(
        'var done = arguments[arguments.length - 1];'
        "import('/js/about.js').then(function(m) {"
        '  m.refreshAbout(); done(true);'
        '}).catch(function(e) { done(String(e)); });'
    )
    time.sleep(0.4)
    dlg = choose_menu_option(driver, 'About')
    time.sleep(SETTLE)
    stub_volatile(driver)
    content = modal_content(dlg)
    if 'Custom Stuff' not in content.text:
        raise RuntimeError(
            'the custom About message did not render — customAboutInfo may no '
            'longer be read when the dialogue is built')
    return content


def shot_file_save(driver):
    '''The Save File dialogue.'''
    dlg = choose_menu_option(driver, 'Save File')
    time.sleep(SETTLE)
    return modal_content(dlg)


def shot_file_load(driver):
    '''The Load File dialogue.'''
    dlg = choose_menu_option(driver, 'Load File')
    time.sleep(SETTLE)
    return modal_content(dlg)


def shot_password_generator_standalone(driver):
    '''The standalone password generator, opened from the footer Pwd Gen button.

    NOT pam-password-generator.png. That file documents the *record field*
    generator — the gear icon on a password field inside a record — which is a
    different dialogue reached a different way, and belongs in the
    record-interaction phase. The standalone generator is described in the
    README prose but has never had an image, so this one is new.
    '''
    button = driver.find_element(By.ID, 'x-generate-password')
    scroll_and_click(driver, button)
    time.sleep(SETTLE)
    dlg = driver.find_element(By.ID, 'mainPasswordGeneratorDlg')
    return dlg.find_element(By.CLASS_NAME, 'modal-content')


def shot_prefs_printing_check(driver):
    '''The Enable Printing preference, on the Administration tab.'''
    return open_prefs_tab(driver, 'prefs-tab-admin')


def shot_menu_with_print(driver):
    '''The menu with Print showing, which needs enablePrinting set first.

    enablePrinting() toggles Bootstrap's d-none on the .x-print entries rather
    than an inline style, so the preference alone is not enough — the function
    has to run.
    '''
    driver.execute_script('window.prefs.enablePrinting = true;')
    driver.execute_async_script(
        'var done = arguments[arguments.length - 1];'
        "import('/js/print.js').then(function(m) {"
        '  m.enablePrinting(); done(true);'
        '}).catch(function(e) { done(String(e)); });'
    )
    time.sleep(0.4)
    menu = driver.find_element(By.ID, 'menu')
    scroll_and_click(driver, menu)
    time.sleep(SETTLE)
    items = get_children(get_parent(menu))[1]
    labels = [i.get_attribute('textContent').strip()
              for i in items.find_elements(By.CLASS_NAME, 'dropdown-item')]
    if 'Print' not in labels:
        raise RuntimeError(f'Print is not in the menu: {labels}')
    return items


# (filename, capture function, window size)
SHOTS = [
    ('pam-menu.png', shot_menu, WINDOW),
    ('pam-about.png', shot_about, WINDOW),
    ('pam-reused-passwords.png', shot_reused_passwords, WINDOW),
    ('pam-prefs-search.png', shot_prefs_search, WINDOW),
    ('pam-prefs-password.png', shot_prefs_passwords, WINDOW),
    ('pam-prefs-miscellaneous.png', shot_prefs_misc, WINDOW),
    ('pam-prefs-record-fields.png', shot_prefs_fields, WINDOW),
    ('pam-prefs-admin.png', shot_prefs_admin, WINDOW),

    ('pam-example-records.png', shot_records_dark, (800, FIT)),
    ('pam-iphone-screenshot-dark.png', shot_records_dark, IPHONE),
    ('pam-iphone-screenshot-light.png', shot_records_light, IPHONE),
    ('pam-basic-sections.png', shot_records_dark, (800, FIT)),
    ('pam-search-g.png', shot_search_g, (800, FIT)),
    ('pam-search-g-re.png', shot_search_g_re, (800, FIT)),
    ('pam-search.png', shot_records_dark, (800, FIT)),
    ('pam-status-msg.png', shot_status_msg, (800, FIT)),

    ('pam-about-custom.png', shot_about_custom, WINDOW),
    ('pam-file-save.png', shot_file_save, WINDOW),
    ('pam-file-load.png', shot_file_load, WINDOW),
    ('pam-password-generator-standalone.png', shot_password_generator_standalone, WINDOW),
    ('pam-prefs-enable-printing-check.png', shot_prefs_printing_check, WINDOW),
    ('pam-prefs-enable-printing-menu.png', shot_menu_with_print, WINDOW),
]


def png_size(data):
    '''Width and height from a PNG's IHDR chunk, without pulling in Pillow.'''
    return (int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big'))


def capture(driver, filename, func, check_only, fit=False):
    '''Capture one screenshot. Returns (state, (width, height)).

    When `fit` is set the viewport is shrunk to the content AFTER the shot
    function has run, not before. The shot is what arranges the state — it
    filters the record list, or expands a record — so fitting first measures
    the wrong thing: the search captures came out sized for all eight records
    when the filter leaves three, and the expanded record in pam-status-msg
    was sized as though it were collapsed.
    '''
    path = os.path.join(HELP, filename)
    element = func(driver)
    if fit:
        fit_viewport_to_content(driver, NARROW[0], NARROW[1])
        time.sleep(0.3)

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
    return state, png_size(png)


def main():
    '''Walk the shot list. Returns 0, or 1 in check mode if anything differs.'''
    check_only = os.environ.get('CHECK') == '1'
    driver = get_driver()
    changed = []
    try:
        driver.get(URL)
        time.sleep(1)
        load_examples(driver)

        for filename, func, window in SHOTS:
            fit = window[1] == FIT
            if window == IPHONE:
                set_device_metrics(driver, *IPHONE, scale=IPHONE_SCALE)
            else:
                clear_device_metrics(driver)
                # For a fitting shot this is only the starting size; the shot
                # runs at full height and capture() shrinks afterwards.
                set_viewport_size(driver, window[0], NARROW[1] if fit else window[1])
            state, (shot_w, shot_h) = capture(driver, filename, func, check_only, fit)
            marker = {'new': 'NEW    ', 'changed': 'CHANGED', 'same': 'same   '}[state]
            print(f'  {marker}  {filename:38} {shot_w}x{shot_h}')
            if state != 'same':
                changed.append(filename)
            # Every capture leaves state behind — an open dialogue, a search
            # term, a changed theme or preference. Reloading resets all of it,
            # which is cheaper to reason about than tracking what each surface
            # needs undone.
            #
            # Reloading does NOT reset the window, though, and a fitted shot
            # leaves it short: after pam-search-g-re the viewport is 320px
            # tall, and in that window the fixed footer overlaps the dropdown
            # menu, so the next Load File click is intercepted by the Pwd Gen
            # button. Restore a roomy viewport before the reset.
            clear_device_metrics(driver)
            set_viewport_size(driver, *WINDOW)
            driver.get(URL)
            time.sleep(0.8)
            load_examples(driver)
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
