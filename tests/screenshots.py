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
    make screenshots                # capture, write only what changed
    make screenshots-check          # report what would change, write nothing
    make screenshots SHOT=google    # only filenames containing "google"

The SHOT filter is for iterating. A full pass is around 28 captures at roughly
eight seconds each, because the page is reloaded and the example records are
reloaded between every shot. That reset is deliberate — see main() — but it
makes the full run slow enough that developing one capture against it is
painful. Always run without a filter before committing.
'''

# pylint: disable=too-many-lines
# One shot per image, each with the reasoning for why it is set up the way it
# is. Splitting by phase would scatter the shared helpers — modal_content,
# blur, visible_icons, expand_record — across modules that all need them.

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
    '''All records, unexpanded, dark theme.

    One capture, referenced from four places in the README: the unexpanded
    record list, the Layout section, the search example and the Load File
    example. They were previously three separate files with byte-identical
    contents — check_images.py reports that as IDENTICAL FILES, which is how
    the duplication was found.
    '''
    set_theme(driver, 'dark')
    time.sleep(SETTLE)
    return Viewport(driver)


def shot_records_light(driver):
    '''The same view in the light theme.'''
    set_theme(driver, 'light')
    time.sleep(SETTLE)
    return Viewport(driver)


def search_for(driver, term):
    '''Type a term into the search box and let the filter settle.

    This leaves focus in the search box, which is the same setup that made
    pam-password-hidden.png churn on the blinking caret. These two captures
    have been stable across repeated double-runs, so the caret is evidently
    not landing in the image here — but if pam-search-g*.png ever starts
    reporting CHANGED on an unchanged vault, blur before capturing.
    '''
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
    """A record expanded, with a status message showing in the footer.

    The message is raised by calling PAM's own statusBlip() rather than by
    clicking the copy button. Clicking copy does not work here:
    copyTextToClipboard() awaits navigator.clipboard.writeText(), and in
    headless Chrome without document focus that promise never settles — it
    neither resolves nor rejects, so no message appears and no error is
    raised. The capture came out byte-identical to pam-record-expanded.png,
    which is how the silent failure was noticed.

    The text matches what a real copy of Facebook's password produces, and the
    rendering path is PAM's own; only the trigger is synthetic.

    statusMsgDurationMS is raised first so the message does not clear before
    the capture.
    """
    set_theme(driver, 'dark')
    driver.execute_script('window.prefs.statusMsgDurationMS = 600000')
    expand_record(driver, 'Facebook')

    shown = driver.execute_async_script(
        'var done = arguments[arguments.length - 1];'
        "import('/js/status.js').then(function(m) {"
        "  m.statusBlip('copied 25 bytes to clipboard');"
        "  var el = document.getElementById('status');"
        '  done(el ? el.innerHTML : null);'
        '}).catch(function(e) { done("error: " + e); });'
    )
    if not shown or 'copied' not in shown:
        raise RuntimeError(f'no status message rendered: {shown!r}')
    time.sleep(SETTLE)
    return Viewport(driver)


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


# Deterministic randomness for the password-generator capture.
#
# The generators are the one surface whose output changes on every run by
# design, so that image would be rewritten by every `make screenshots` — a new
# binary blob in git each time, and `screenshots-check` could never report a
# clean set. A check target that always shows one stale file trains you to
# ignore it.
#
# Injected into the BROWSER SESSION and nowhere else. www/js/password.js ships
# unchanged and carries no test hook: a seam in the released code that made
# generated passwords predictable would be a real weakening of the one function
# whose whole value is that its output cannot be guessed. The override lives
# here, in the harness, where nothing outside this script can reach it.
#
# A small LCG rather than a constant, so the passwords still look like
# passwords rather than a repeated character. getCrypticPassword() uses
# crypto.getRandomValues; getRandomWord() uses Math.random. Both are replaced.
# The leading `return` is required: execute_script() wraps the script in a
# function body, so a bare IIFE evaluates and its value is discarded — the
# probe below then reads as undefined and the capture aborts.
SEED_RNG_JS = (
    "return (function () {"
    "  let state = 0x2545f491 >>> 0;"
    "  const next = function () {"
    "    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;"
    "    return state;"
    "  };"
    "  Math.random = function () { return next() / 4294967296; };"
    "  Object.defineProperty(window.crypto, 'getRandomValues', {"
    "    configurable: true,"
    "    value: function (array) {"
    "      for (let i = 0; i < array.length; i++) { array[i] = next() & 0xff; }"
    "      return array;"
    "    }"
    "  });"
    "  const probe = new Uint8Array(4);"
    "  window.crypto.getRandomValues(probe);"
    "  return probe[0] !== 0 || probe[1] !== 0;"
    "})();"
)


def shot_password_generator_standalone(driver):
    '''The standalone password generator, opened from the footer Pwd Gen button.

    NOT pam-password-generator.png. That file documents the *record field*
    generator — the gear icon on a password field inside a record — which is a
    different dialogue reached a different way, and belongs in the
    record-interaction phase. The standalone generator is described in the
    README prose but has never had an image, so this one is new.

    The randomness is made deterministic first, in the browser session only,
    so this capture does not churn on every run. See SEED_RNG_JS.
    '''
    if not driver.execute_script(SEED_RNG_JS):
        raise RuntimeError(
            'could not override the browser RNG; this capture would churn on '
            'every run')
    button = driver.find_element(By.ID, 'x-generate-password')
    scroll_and_click(driver, button)
    time.sleep(SETTLE)
    dlg = driver.find_element(By.ID, 'mainPasswordGeneratorDlg')
    return dlg.find_element(By.CLASS_NAME, 'modal-content')


def shot_prefs_administration(driver):
    '''Preferences, Administration tab.

    Named for the tab's UI label rather than an abbreviation. This tab had no
    screenshot at all before, despite holding four security-relevant settings,
    and it supersedes pam-prefs-enable-printing-check.png — Enable Printing is
    one of the settings shown here.
    '''
    return open_prefs_tab(driver, 'prefs-tab-admin')


def shot_prefs_record_fields(driver):
    '''Preferences, Record Fields tab.'''
    return open_prefs_tab(driver, 'prefs-tab-fields')

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


# ---------------------------------------------------------------------------
# Phase 4: record interaction states
# ---------------------------------------------------------------------------

def blur(driver):
    """Drop focus, so a blinking text caret cannot land in a capture."""
    driver.execute_script(
        'if (document.activeElement) { document.activeElement.blur(); }')
    time.sleep(0.5)


def visible_icons(root, title):
    """Visible <i> elements carrying a given tooltip.

    icon(name, tooltip) in utils.js puts the title on the <i>, not on the
    button around it, so selecting the button by title finds nothing. Clicking
    the icon bubbles to the button.
    """
    return [e for e in root.find_elements(By.CSS_SELECTOR, f'i[title="{title}"]')
            if e.is_displayed()]


def open_new_record_with_password_field(driver):
    """New Record dialogue holding a single, empty password field.

    Strips the default fields, then adds `password` from the New Field
    dropdown — choosing a predefined name sets both the field name and its
    type. Returns the dialogue's .modal-content.
    """
    dlg = choose_menu_option(driver, 'New Record')
    time.sleep(SETTLE)
    driver.execute_script(
        "var menu = document.getElementById('menuNewDlg');"
        "var body = menu.getElementsByClassName('container')[0];"
        "while (body.children.length > 2) {"
        "  body.removeChild(body.children[body.children.length - 1]); }"
    )
    time.sleep(0.3)

    new_field = dlg.find_element(By.ID, 'x-new-field-type')
    scroll_and_click(driver, new_field)
    time.sleep(SETTLE)
    items = [i for i in dlg.find_elements(By.CSS_SELECTOR, 'ul.dropdown-menu .dropdown-item')
             if i.text.strip() == 'password']
    if not items:
        raise RuntimeError('no predefined "password" field in the New Field dropdown')
    scroll_and_click(driver, items[0])
    time.sleep(SETTLE)

    # Adding a field leaves focus in the new input, where the text caret
    # blinks. Blurring here covers every shot built on this helper: the
    # first attempt blurred only in shot_password_hidden, and
    # pam-password-no-generator.png churned on the very next run.
    blur(driver)
    return modal_content(dlg)


def shot_password_no_generator(driver):
    """A password field before the generator is opened: empty, gear present."""
    content = open_new_record_with_password_field(driver)
    if not visible_icons(content, 'generate a password'):
        raise RuntimeError('no gear icon on the new password field')
    return content


def shot_password_generator(driver):
    """The record field generator, opened with the gear icon.

    Not the standalone footer generator — that is
    pam-password-generator-standalone.png. This one appears inline in a record
    field, and is what the README's Password Generator section describes first.
    """
    if not driver.execute_script(SEED_RNG_JS):
        raise RuntimeError('could not override the browser RNG for this capture')
    content = open_new_record_with_password_field(driver)
    gears = visible_icons(content, 'generate a password')
    if not gears:
        raise RuntimeError('no gear icon on the new password field')
    scroll_and_click(driver, gears[0])
    time.sleep(SETTLE)
    blur(driver)
    return content


def shot_password_hidden(driver):
    """A password field with a value, masked."""
    content = open_new_record_with_password_field(driver)
    inputs = [e for e in content.find_elements(
        By.CSS_SELECTOR, 'input.x-fld-value[data-fld-type="password"]')
        if e.is_displayed()]
    if not inputs:
        raise RuntimeError('no password input on the new field')
    inputs[0].send_keys('Zq7-Mvtl%Kdn#WroP2xj')
    blur(driver)
    return content


def shot_password_shown(driver):
    """The same field with the eye icon clicked, revealing the value."""
    content = shot_password_hidden(driver)
    eyes = visible_icons(content, 'show or hide password')
    if not eyes:
        raise RuntimeError('no eye icon on the password field')
    scroll_and_click(driver, eyes[0])
    time.sleep(SETTLE)
    blur(driver)
    return content


def expand_record(driver, title):
    """Expand one record in the accordion and return its .accordion-item."""
    buttons = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    match = next((b for b in buttons if title in b.text), None)
    if match is None:
        raise RuntimeError(f'no record titled {title!r} to expand')
    scroll_and_click(driver, match)
    time.sleep(SETTLE)
    return match.find_element(
        By.XPATH, './ancestor::div[contains(@class, "accordion-item")]')


def shot_record_expanded(driver):
    """The Facebook record expanded, password masked, shown in context.

    Serves pam-record-expanded, pam-record-expanded-fields and
    pam-record-expanded-fields2: those were the same UI state with different
    red arrows drawn on. With the arrows replaced by prose they are one image.

    Captured as a fitted viewport rather than the accordion item alone. The
    item spans the full viewport width, so at a 1920 window it came out
    1904x432 — rendered at the README's width="400" that is an illegible
    strip. A narrow viewport also keeps the surrounding records and the footer
    in frame, which the prose refers to ("once you click on or tap a record it
    expands").
    """
    set_theme(driver, 'dark')
    item = expand_record(driver, 'Facebook')
    if not visible_icons(item, 'copy to clipboard'):
        raise RuntimeError('the record did not expand: no clipboard icons')
    return Viewport(driver)


def shot_record_expanded_password(driver):
    """The same record with the password revealed."""
    set_theme(driver, 'dark')
    item = expand_record(driver, 'Facebook')
    eyes = visible_icons(item, 'show password')
    if not eyes:
        raise RuntimeError('no eye icon on the expanded record')
    scroll_and_click(driver, eyes[0])
    time.sleep(SETTLE)
    return Viewport(driver)


def shot_google_record(driver):
    """The Google record expanded, shown in context.

    Illustrates the Introduction's point that records are accordion entries
    that expand when clicked. Uses the example data rather than a constructed
    record.
    """
    set_theme(driver, 'dark')
    item = expand_record(driver, 'Google')
    if not visible_icons(item, 'copy to clipboard'):
        raise RuntimeError('the Google record did not expand')
    return Viewport(driver)


def shot_google_account(driver):
    """A New Record dialogue built up as a simple account record.

    Not the Google record from the example data: the README uses this to show
    what a record with url/login/password fields looks like while you are
    creating it, so the dialogue is constructed field by field.
    """
    dlg = choose_menu_option(driver, 'New Record')
    time.sleep(SETTLE)

    title = dlg.find_element(By.CSS_SELECTOR, 'input[placeholder="Record Title"]')
    title.clear()
    title.send_keys('Google')

    driver.execute_script(
        "var menu = document.getElementById('menuNewDlg');"
        "var body = menu.getElementsByClassName('container')[0];"
        "while (body.children.length > 2) {"
        "  body.removeChild(body.children[body.children.length - 1]); }"
    )
    time.sleep(0.3)

    values = {
        'url': 'https://google.com',
        'login': 'pbrain22@gmail.com',
        'password': 'NIJMeb8OfXEfshOG$db!',
    }
    for name, value in values.items():
        new_field = dlg.find_element(By.ID, 'x-new-field-type')
        scroll_and_click(driver, new_field)
        time.sleep(0.4)
        items = [i for i in dlg.find_elements(
            By.CSS_SELECTOR, 'ul.dropdown-menu .dropdown-item')
            if i.text.strip() == name]
        if not items:
            raise RuntimeError(f'no predefined {name!r} field in the dropdown')
        scroll_and_click(driver, items[0])
        time.sleep(0.4)

        inputs = [e for e in dlg.find_elements(By.CSS_SELECTOR, 'input.x-fld-value')
                  if e.is_displayed()]
        if not inputs:
            raise RuntimeError(f'no input rendered for the {name!r} field')
        inputs[-1].send_keys(value)
        time.sleep(0.2)

    blur(driver)
    return modal_content(dlg)


def shot_google_account_prefs(driver):
    """Record Fields preferences pruned to just url, login and password.

    The Preferences dialogue rebuilds from current prefs on `show.bs.modal`,
    so setting predefinedRecordFields before opening it is enough — no
    explicit refresh is needed the way About required one.
    """
    driver.execute_script(
        "window.prefs.predefinedRecordFields = "
        "{'url': 'url', 'login': 'text', 'password': 'password'};"
    )
    content = open_prefs_tab(driver, 'prefs-tab-fields')
    rows = content.find_elements(By.CSS_SELECTOR, '#x-prefs-fld-div .x-pref-fld-row')
    if len(rows) != 3:
        raise RuntimeError(
            f'expected the field list pruned to 3 rows, found {len(rows)} — '
            'predefinedRecordFields may not be read when the tab is built')
    return content


# (filename, capture function, window size)
SHOTS = [
    ('pam-menu.png', shot_menu, WINDOW),
    ('pam-about.png', shot_about, WINDOW),
    ('pam-reused-passwords.png', shot_reused_passwords, WINDOW),
    ('pam-prefs-search.png', shot_prefs_search, WINDOW),
    ('pam-prefs-password.png', shot_prefs_passwords, WINDOW),
    ('pam-prefs-miscellaneous.png', shot_prefs_misc, WINDOW),

    ('pam-example-records.png', shot_records_dark, (800, FIT)),
    ('pam-iphone-screenshot-dark.png', shot_records_dark, IPHONE),
    ('pam-iphone-screenshot-light.png', shot_records_light, IPHONE),
    ('pam-search-g.png', shot_search_g, (800, FIT)),
    ('pam-search-g-re.png', shot_search_g_re, (800, FIT)),
    ('pam-status-msg.png', shot_status_msg, (800, FIT)),

    ('pam-about-custom.png', shot_about_custom, WINDOW),
    ('pam-file-save.png', shot_file_save, WINDOW),
    ('pam-file-load.png', shot_file_load, WINDOW),
    ('pam-password-generator-standalone.png', shot_password_generator_standalone, WINDOW),
    ('pam-prefs-administration.png', shot_prefs_administration, WINDOW),
    ('pam-prefs-record-fields.png', shot_prefs_record_fields, WINDOW),
    ('pam-prefs-enable-printing-menu.png', shot_menu_with_print, WINDOW),

    ('pam-password-no-generator.png', shot_password_no_generator, WINDOW),
    ('pam-password-generator.png', shot_password_generator, WINDOW),
    ('pam-password-hidden.png', shot_password_hidden, WINDOW),
    ('pam-password-shown.png', shot_password_shown, WINDOW),
    ('pam-record-expanded.png', shot_record_expanded, (800, FIT)),
    ('pam-record-expanded-password.png', shot_record_expanded_password, (800, FIT)),
    ('pam-google-record.png', shot_google_record, (800, FIT)),
    ('pam-google-account.png', shot_google_account, WINDOW),
    ('pam-google-account-prefs.png', shot_google_account_prefs, WINDOW),
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

    # Substring match on the filename, so SHOT=google runs the three
    # pam-google-* captures and SHOT=prefs runs the preference tabs.
    only = os.environ.get('SHOT', '').strip()
    shots = [entry for entry in SHOTS if only in entry[0]] if only else SHOTS
    if only and not shots:
        names = ', '.join(sorted(name for name, _, _ in SHOTS))
        print(f'SHOT={only!r} matches nothing.\nAvailable: {names}')
        return 1
    if only:
        print(f'SHOT={only!r}: {len(shots)} of {len(SHOTS)} captures\n')

    driver = get_driver()
    changed = []
    try:
        driver.get(URL)
        time.sleep(1)
        load_examples(driver)

        for filename, func, window in shots:
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
        print(f'{len(shots)} screenshots, none changed')
        return 0
    verb = 'would change' if check_only else 'written'
    print(f'{len(changed)} of {len(shots)} {verb}: {", ".join(changed)}')
    return 1 if check_only else 0


if __name__ == '__main__':
    sys.exit(main())
