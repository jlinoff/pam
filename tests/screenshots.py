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

import io
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
    NoAlertPresentException, UnexpectedAlertPresentException, WebDriverException,
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

# Captures whose difference was tolerated this run, filename -> pixel count.
NOISE_REPORT = {}

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
    def sized():
        inner = driver.execute_script(
            'return [window.innerWidth, window.innerHeight];')
        return inner == [width, height]

    try:
        driver.set_window_size(width, height)
    except UnexpectedAlertPresentException:
        # Something left a dialog open. Clear it and say so rather than
        # failing three frames deep in Selenium.
        driver.switch_to.alert.accept()
        raise RuntimeError(
            'an unhandled browser alert was open when resizing the window; '
            'a previous capture left one behind') from None
    if wait_until(sized, timeout=1.0):
        return
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
    wait_for_modal(driver)
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
    wait_for_modal(driver)
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
    '''The same view in the light theme.

    The only capture that is not dark. main() sets dark before every shot, so
    this is the one place the default is overridden — and because the theme is
    now reset each time, this shot can no longer leak light into whatever runs
    after it.
    '''
    set_theme(driver, 'light')
    time.sleep(SETTLE)
    return Viewport(driver)


def search_for(driver, term):
    '''Type a term into the search box and let the filter settle.

    Blurs afterwards. Focus in the search box means a blinking caret, the same
    thing that made pam-password-hidden.png churn. These captures were stable
    for a long while and the risk was left documented rather than fixed — then
    replacing the fixed sleeps with polling changed the timing and
    pam-search-g.png started churning, exactly as predicted. A latent race is
    still a race; the only thing keeping it quiet was a sleep that happened to
    land between blinks.
    '''
    box = driver.find_element(By.ID, 'search')
    box.clear()
    box.send_keys(term)
    time.sleep(SETTLE)
    blur(driver)
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
# Written across several lines so it reads as something a user typed when it
# appears in the Custom About textarea (pam-about-custom-pref.png). HTML
# ignores the newlines, so the rendered result (pam-about-custom.png) is
# unaffected — the two images stay a matched pair of input and output.
CUSTOM_ABOUT = ('<fieldset class="border border-light bg-primary p-2">\n'
                '<legend>Custom Stuff</legend>\n'
                'custom stuff here!\n'
                '</fieldset>')


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
    wait_for_modal(driver)
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
    wait_for_modal(driver)
    return modal_content(dlg)


def shot_file_load(driver):
    '''The Load File dialogue.'''
    dlg = choose_menu_option(driver, 'Load File')
    wait_for_modal(driver)
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

def wait_until(predicate, timeout=5.0, interval=0.05):
    """Poll until a predicate holds. Returns True, or False on timeout.

    Most fixed sleeps in this file were worst-case padding for a Bootstrap fade
    that finishes in 300ms. Polling turns a flat 0.6s into a typical 0.1s while
    still waiting the full budget on a slow machine, so it is both quicker and
    safer than lowering the constant.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if predicate():
                return True
        except WebDriverException:
            pass
        time.sleep(interval)
    return False


def wait_for_page(driver, timeout=5.0):
    """Wait for the document to finish loading."""
    return wait_until(
        lambda: driver.execute_script('return document.readyState') == 'complete',
        timeout)


def wait_for_dropdown_closed(driver, timeout=3.0):
    """Wait until no Bootstrap dropdown is open or mid-transition.

    Selecting from the New Field pulldown closes it with a fade. A capture
    taken before that finishes catches a couple of rows of the menu's trailing
    edge — a 105x2 band of pixels, invisible to the eye but enough to make the
    image differ from run to run. That is what made
    pam-new-record-field-1.png churn intermittently after both the caret and
    the scroll-position fixes had been ruled out.
    """
    return wait_until(
        lambda: driver.execute_script(
            "var open = document.querySelectorAll('.dropdown-menu.show');"
            "if (open.length) { return false; }"
            "var fading = document.querySelectorAll('.dropdown-menu');"
            "for (var i = 0; i < fading.length; i++) {"
            "  var o = window.getComputedStyle(fading[i]).opacity;"
            "  if (o !== '' && o !== '1' && o !== '0') { return false; }"
            "}"
            "return true;"),
        timeout)


def wait_for_modal(driver, timeout=5.0):
    """Wait for a Bootstrap modal to finish fading in.

    A modal is interactable once it carries the `show` class and its opacity
    has reached 1. Capturing mid-fade produces a half-transparent dialogue,
    which is what the fixed SETTLE waits were guarding against.
    """
    return wait_until(
        lambda: driver.execute_script(
            "var m = document.querySelector('.modal.show');"
            "if (!m) { return false; }"
            "return window.getComputedStyle(m).opacity === '1';"),
        timeout)


def blur(driver):
    """Drop focus and reset field scrolling, so neither lands in a capture.

    Two separate sources of churn:

    - A focused input blinks a text caret, so two captures a few hundred
      milliseconds apart differ even though the content is identical.
    - A field whose content overflows keeps a scroll position. Six lines of
      ingredients in a 5em textarea, or a twenty-character password in a
      narrow input, sit wherever typing left them — and that depends on
      timing, which is why pam-new-record-field-1.png churned on some runs and
      not others.

    Resetting both is cheap and makes the capture show the start of the value,
    which is the part worth reading anyway.
    """
    driver.execute_script(
        'if (document.activeElement) { document.activeElement.blur(); }'
        "var fields = document.querySelectorAll('input, textarea');"
        'for (var i = 0; i < fields.length; i++) {'
        '  fields[i].scrollTop = 0;'
        '  fields[i].scrollLeft = 0;'
        '}')
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
    wait_for_modal(driver)
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
    wait_for_modal(driver)

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
        wait_for_dropdown_closed(driver)
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


def shot_about_custom_pref(driver):
    """The Custom About preference, filled in.

    Pairs with pam-about-custom.png: this shows the preference, that shows the
    result. Cropped to the single preference row rather than the whole
    Administration tab, which is over 2000px tall and would bury the point.

    The image it replaces showed a single "Miscellaneous" fieldset holding
    Enable Printing, filePass Cache Strategy and Custom About together — a
    layout PAM has not had since the preferences gained tabs.
    """
    content = open_prefs_tab(driver, 'prefs-tab-admin')
    field = content.find_element(
        By.CSS_SELECTOR, 'textarea[data-pref-id="customAboutInfo"]')

    # Typed rather than set through window.prefs, because nothing populates
    # this textarea from the stored value: the dialogue reads [data-pref-id]
    # elements on save, never writes to them on open. Typing is also what the
    # image is meant to show — what you enter, not what was already stored.
    field.clear()
    field.send_keys(CUSTOM_ABOUT)
    if not field.get_attribute('value').strip():
        raise RuntimeError('the Custom About field is still empty after typing')

    # Grow the box to its content and scroll it to the top. textareaMinHeight
    # defaults to 5em, so four lines overflow: the first capture scrolled to
    # the bottom and cut off the opening <fieldset> line, which is the part a
    # reader most needs to see.
    grown = driver.execute_script(
        'var t = arguments[0];'
        't.style.height = "auto";'
        't.style.height = (t.scrollHeight + 4) + "px";'
        't.scrollTop = 0;'
        'return t.clientHeight >= t.scrollHeight;', field)
    if not grown:
        raise RuntimeError(
            'the Custom About box still scrolls; the capture would cut off '
            'part of the value')

    row = field.find_element(By.XPATH, './ancestor::div[contains(@class, "row")][1]')
    blur(driver)
    return row


def open_edit_dialogue(driver, title):
    """Expand a record and open its Edit dialogue.

    The Edit button carries title="edit this record" on the button itself,
    unlike the field icons where the tooltip is on the inner <i>. The dialogue
    is rebuilt each time it opens, so #editRecordDlg is only present after the
    click.
    """
    item = expand_record(driver, title)
    buttons = [b for b in item.find_elements(
        By.CSS_SELECTOR, 'button[title="edit this record"]') if b.is_displayed()]
    if not buttons:
        raise RuntimeError(f'no Edit button on the {title!r} record')
    scroll_and_click(driver, buttons[0])
    time.sleep(SETTLE)
    return driver.find_element(By.ID, 'editRecordDlg')


def shot_edit_facebook(driver):
    """The Edit dialogue for the Facebook record."""
    set_theme(driver, 'dark')
    dlg = open_edit_dialogue(driver, 'Facebook')
    content = dlg.find_element(By.CLASS_NAME, 'modal-content')

    # Check the title INPUT, not the dialogue text. The record title is an
    # input value and textContent does not include input values, so looking
    # for 'Facebook' in content.text fails on a perfectly correct dialogue —
    # the same distinction that makes .text return '' for a hidden element.
    titles = [e.get_attribute('value')
              for e in content.find_elements(By.CSS_SELECTOR, 'input')
              if e.is_displayed()]
    if 'Facebook' not in titles:
        raise RuntimeError(
            f'the Edit dialogue is not editing the Facebook record; '
            f'input values were {titles!r}')
    blur(driver)
    return content


def shot_edit_facebook_new_field(driver):
    """The Edit dialogue with the New Field dropdown open.

    Shows where fields are added from. The README used to call this the "New
    Record" dropdown, which was wrong — the control is labelled New Field.
    """
    set_theme(driver, 'dark')
    dlg = open_edit_dialogue(driver, 'Facebook')
    new_field = dlg.find_element(By.ID, 'x-new-field-type')
    scroll_and_click(driver, new_field)
    time.sleep(SETTLE)

    items = [i for i in dlg.find_elements(
        By.CSS_SELECTOR, 'ul.dropdown-menu .dropdown-item') if i.is_displayed()]
    if not items:
        raise RuntimeError('the New Field dropdown did not open')
    return dlg.find_element(By.CLASS_NAME, 'modal-content')


# The placeholder date load.js stamps on records that have no `created` field.
# Newly saved records get new Date().toISOString() instead, so any capture
# showing one expanded differs on every run — the collapsed list hides the
# date, which is why pam-new-record-done was stable while
# pam-new-record-done-expand was not.
PLACEHOLDER_CREATED = '1999-01-01T00:00:00.000Z'


def stub_created_dates(driver):
    """Freeze every visible creation date so captures do not churn.

    Rewrites the rendered text only. Using the same placeholder load.js uses
    keeps a newly created record consistent with the example records beside it.

    Returns the number of dates rewritten so a shot can tell whether it found
    anything; a silent zero would mean the markup moved and the image would go
    back to churning unnoticed.
    """
    return driver.execute_script(
        "var n = 0;"
        "var spans = document.querySelectorAll('[title=\"creation date\"]');"
        "for (var i = 0; i < spans.length; i++) {"
        "  spans[i].innerHTML = '&nbsp;Created: <small>' + arguments[0] + '</small>';"
        "  n++;"
        "}"
        "return n;", PLACEHOLDER_CREATED)


# ---------------------------------------------------------------------------
# Phase 5, group A: the New Record walkthrough
# ---------------------------------------------------------------------------
#
# The README walks through creating one record — an ice cream sundae with
# `ingredients` and `instructions` textarea fields — and photographs it at each
# step. The content below matches what the hand-made images showed, so the
# prose around them still reads correctly.
#
# The same record is the subject of the phase 6 pam-ice-cream-sundae-* images,
# so this fixture is shared between the two phases.

RECIPE_TITLE = 'Ice Cream Sundae'

RECIPE_INGREDIENTS = (
    '1. 3 scoops vanilla ice cream\n'
    '2. 1 banana (sliced up)\n'
    '3. chocolate sauce\n'
    '4. (optional) nuts\n'
    '5. (optional) Maraschino cherry\n'
    '6. whipped cream'
)

RECIPE_INSTRUCTIONS = (
    '1. put ice cream in bowl\n'
    '2. add slices of banana\n'
    '3. add nuts\n'
    '4. pour chocolate on top\n'
    '5. add whip cream\n'
    '6. put the cherry on top.'
)

# `ingredients` and `instructions` are not PAM defaults. The walkthrough tells
# the reader to add them as textarea fields in Preferences first, and
# pam-recipe-prefs.png shows that state, so the shots set the same thing.
RECIPE_FIELDS = {
    'ingredients': 'textarea',
    'instructions': 'textarea',
    'login': 'text',
    'note': 'textarea',
    'password': 'password',
    'url': 'url',
}


def use_recipe_fields(driver):
    """Add `ingredients` and `instructions` to the predefined field list."""
    driver.execute_script(
        'window.prefs.predefinedRecordFields = arguments[0];', RECIPE_FIELDS)


def open_new_record(driver):
    """Open New Record with no fields in it.

    The dialogue is pre-populated from defaultRecordFields, which the
    walkthrough does not use — it adds every field by hand — so the rows are
    stripped first.
    """
    dlg = choose_menu_option(driver, 'New Record')
    wait_for_modal(driver)
    driver.execute_script(
        "var menu = document.getElementById('menuNewDlg');"
        "var body = menu.getElementsByClassName('container')[0];"
        "while (body.children.length > 2) {"
        "  body.removeChild(body.children[body.children.length - 1]); }"
    )
    time.sleep(0.3)
    return dlg


def set_record_title(driver, dlg, title):
    """Type the record title."""
    box = dlg.find_element(By.CSS_SELECTOR, 'input[placeholder="Record Title"]')
    box.clear()
    box.send_keys(title)
    blur(driver)


def open_new_field_menu(driver, dlg):
    """Open the New Field pulldown. Returns its visible items."""
    button = dlg.find_element(By.ID, 'x-new-field-type')
    scroll_and_click(driver, button)
    time.sleep(SETTLE)
    return [i for i in dlg.find_elements(
        By.CSS_SELECTOR, 'ul.dropdown-menu .dropdown-item') if i.is_displayed()]


def add_named_field(driver, dlg, name, value=None):
    """Pick one predefined field from the New Field pulldown, then fill it."""
    items = [i for i in open_new_field_menu(driver, dlg)
             if i.text.strip() == name]
    if not items:
        raise RuntimeError(f'no predefined {name!r} field in the New Field menu')
    scroll_and_click(driver, items[0])
    wait_for_dropdown_closed(driver)
    time.sleep(SETTLE)

    if value is not None:
        boxes = [e for e in dlg.find_elements(By.CSS_SELECTOR, 'textarea.x-fld-value')
                 if e.is_displayed()]
        if not boxes:
            raise RuntimeError(f'no textarea rendered for the {name!r} field')
        boxes[-1].send_keys(value)
        blur(driver)


def save_new_record(driver, dlg):
    """Click Save and wait for the record to appear in the list."""
    buttons = [b for b in dlg.find_elements(By.TAG_NAME, 'button')
               if b.is_displayed() and b.text.strip() == 'Save']
    if not buttons:
        raise RuntimeError('no Save button on the New Record dialogue')
    scroll_and_click(driver, buttons[0])
    time.sleep(SETTLE)

    titles = [b.get_attribute('textContent').strip()
              for b in driver.find_elements(By.CLASS_NAME, 'accordion-button')]
    if not any(RECIPE_TITLE in t for t in titles):
        raise RuntimeError(
            f'{RECIPE_TITLE!r} is not in the record list after saving: {titles}')


def shot_recipe_prefs(driver):
    """Record Fields preferences with the recipe fields added.

    Belongs to phase 6 by the original grouping, but the New Record walkthrough
    depends on it: the reader is told to define `ingredients` and
    `instructions` before creating the record.
    """
    use_recipe_fields(driver)
    content = open_prefs_tab(driver, 'prefs-tab-fields')
    names = [e.get_attribute('value') for e in content.find_elements(
        By.CSS_SELECTOR, '#x-prefs-fld-div input')]
    for want in ('ingredients', 'instructions'):
        if want not in names:
            raise RuntimeError(f'{want!r} missing from the field list: {names}')
    return content


def shot_new_record_empty(driver):
    """The New Record dialogue as it first appears."""
    use_recipe_fields(driver)
    return modal_content(open_new_record(driver))


def shot_new_record_title(driver):
    """The same dialogue with the record title typed in."""
    use_recipe_fields(driver)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, RECIPE_TITLE)
    return modal_content(dlg)


def shot_new_record_field_select(driver):
    """The New Field pulldown open, showing the recipe fields."""
    use_recipe_fields(driver)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, RECIPE_TITLE)
    labels = [i.text.strip() for i in open_new_field_menu(driver, dlg)]
    if 'ingredients' not in labels:
        raise RuntimeError(f'"ingredients" not offered in the menu: {labels}')
    return modal_content(dlg)


def shot_new_record_field_1(driver):
    """One field added and filled in."""
    use_recipe_fields(driver)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, RECIPE_TITLE)
    add_named_field(driver, dlg, 'ingredients', RECIPE_INGREDIENTS)
    return modal_content(dlg)


def shot_new_record_field_2(driver):
    """Both fields added and filled in."""
    use_recipe_fields(driver)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, RECIPE_TITLE)
    add_named_field(driver, dlg, 'ingredients', RECIPE_INGREDIENTS)
    add_named_field(driver, dlg, 'instructions', RECIPE_INSTRUCTIONS)
    return modal_content(dlg)


def shot_new_record_done(driver):
    """The record list after saving, with the new record in it."""
    set_theme(driver, 'dark')
    use_recipe_fields(driver)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, RECIPE_TITLE)
    add_named_field(driver, dlg, 'ingredients', RECIPE_INGREDIENTS)
    add_named_field(driver, dlg, 'instructions', RECIPE_INSTRUCTIONS)
    save_new_record(driver, dlg)
    return Viewport(driver)


def shot_new_record_done_expand(driver):
    """The saved record expanded, showing the fields just defined."""
    set_theme(driver, 'dark')
    use_recipe_fields(driver)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, RECIPE_TITLE)
    add_named_field(driver, dlg, 'ingredients', RECIPE_INGREDIENTS)
    add_named_field(driver, dlg, 'instructions', RECIPE_INSTRUCTIONS)
    save_new_record(driver, dlg)
    expand_record(driver, RECIPE_TITLE)
    if not stub_created_dates(driver):
        raise RuntimeError(
            'no creation dates found to freeze; this capture would '
            'churn on every run')
    return Viewport(driver)


# ---------------------------------------------------------------------------
# Phase 5, group B: cloning
# ---------------------------------------------------------------------------
#
# The README clones the Ice Cream Sundae record created in the previous
# section, so each of these shots builds that record first. Slower than
# cloning one of the example records, but the prose says "using the record
# that was created in the previous section" and a picture of a different
# record would quietly contradict it.

CLONE_TITLE = RECIPE_TITLE + ' Clone'


def build_recipe_record(driver):
    """Create and save the Ice Cream Sundae record."""
    use_recipe_fields(driver)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, RECIPE_TITLE)
    add_named_field(driver, dlg, 'ingredients', RECIPE_INGREDIENTS)
    add_named_field(driver, dlg, 'instructions', RECIPE_INSTRUCTIONS)
    save_new_record(driver, dlg)


def open_clone_dialogue(driver, title):
    """Expand a record and press its Clone button.

    The button carries title="duplicate this record"; the dialogue it builds
    is #menuCloneDlg and is recreated on every click, so it only exists after
    the press.
    """
    item = expand_record(driver, title)
    buttons = [b for b in item.find_elements(
        By.CSS_SELECTOR, 'button[title="duplicate this record"]')
        if b.is_displayed()]
    if not buttons:
        raise RuntimeError(f'no Clone button on the {title!r} record')
    scroll_and_click(driver, buttons[0])
    time.sleep(SETTLE)
    return driver.find_element(By.ID, 'menuCloneDlg')


def shot_clone_popup(driver):
    """The dialogue that appears when Clone is pressed.

    PAM pre-fills a unique title by appending " Clone", because record titles
    must be unique. The assertion checks that rather than the dialogue text:
    the title lives in an input value, which textContent does not include.
    """
    set_theme(driver, 'dark')
    build_recipe_record(driver)
    dlg = open_clone_dialogue(driver, RECIPE_TITLE)
    content = dlg.find_element(By.CLASS_NAME, 'modal-content')

    values = [e.get_attribute('value') for e in
              content.find_elements(By.CSS_SELECTOR, 'input') if e.is_displayed()]
    if CLONE_TITLE not in values:
        raise RuntimeError(
            f'the clone dialogue does not offer {CLONE_TITLE!r}; '
            f'input values were {values!r}')
    blur(driver)
    return content


def save_clone(driver, dlg):
    """Save the clone dialogue and confirm the new record appears."""
    buttons = [b for b in dlg.find_elements(By.TAG_NAME, 'button')
               if b.is_displayed() and b.text.strip() == 'Save']
    if not buttons:
        raise RuntimeError('no Save button on the clone dialogue')
    scroll_and_click(driver, buttons[0])
    time.sleep(SETTLE)

    titles = [b.get_attribute('textContent').strip()
              for b in driver.find_elements(By.CLASS_NAME, 'accordion-button')]
    if not any(CLONE_TITLE in t for t in titles):
        raise RuntimeError(f'{CLONE_TITLE!r} is not in the list: {titles}')


def shot_clone_saved(driver):
    """After saving: the original still open, the clone below it.

    PAM deliberately leaves the original expanded so Clone can be pressed
    again to make more records, and the README calls that out.
    """
    set_theme(driver, 'dark')
    build_recipe_record(driver)
    dlg = open_clone_dialogue(driver, RECIPE_TITLE)
    save_clone(driver, dlg)
    if not stub_created_dates(driver):
        raise RuntimeError(
            'no creation dates found to freeze; this capture would '
            'churn on every run')
    return Viewport(driver)


def shot_clone_expanded(driver):
    """The cloned record expanded, showing it carries the same fields."""
    set_theme(driver, 'dark')
    build_recipe_record(driver)
    dlg = open_clone_dialogue(driver, RECIPE_TITLE)
    save_clone(driver, dlg)
    expand_record(driver, CLONE_TITLE)
    if not stub_created_dates(driver):
        raise RuntimeError(
            'no creation dates found to freeze; this capture would '
            'churn on every run')
    return Viewport(driver)


# ---------------------------------------------------------------------------
# Phase 5, group C: editable field names
# ---------------------------------------------------------------------------
#
# Four images in two pairs: the preference in each state, and the record field
# row it produces. The Name input is always present in the row — field.js
# renders it with display:none unless editableFieldName is set — so the
# difference between the two field captures is whether that block is shown.


def pref_row(content, pref_id):
    """Crop target for one preference: the .row holding its control."""
    control = content.find_element(
        By.CSS_SELECTOR, f'[data-pref-id="{pref_id}"]')
    return control.find_element(
        By.XPATH, './ancestor::div[contains(@class, "row")][1]')


def pref_toggle_state(control):
    """Whether a preference toggle is on.

    PAM's preference toggles are not <input type="checkbox"> elements: they are
    buttons wrapping an <i> whose class carries the state — `bi-check2-square`
    when on, `bi-square` when off. Selenium's is_selected() returns False for a
    button regardless, so a check written against it can never pass and tells
    you nothing about the click that preceded it.
    """
    marker = control.find_element(By.TAG_NAME, 'i')
    return 'bi-check2-square' in (marker.get_attribute('class') or '')


def shot_editable_field_pref(driver, enabled):
    """The Enable Editable Field Name preference in one state.

    The checkbox is CLICKED rather than set through window.prefs. Checkbox
    states are read when the dialogue is built, and menuPrefsDlg() runs once at
    startup — only #x-prefs-fld-div is rebuilt on show.bs.modal, which is why
    setting predefinedRecordFields works but setting this does not. Clicking is
    also what a user does, so the capture shows a real interaction.
    """
    content = open_prefs_tab(driver, 'prefs-tab-misc')
    box = content.find_element(
        By.CSS_SELECTOR, '[data-pref-id="editableFieldName"]')
    if pref_toggle_state(box) != enabled:
        scroll_and_click(driver, box)
        time.sleep(0.4)
    if pref_toggle_state(box) != enabled:
        raise RuntimeError(
            f'the toggle still reads {pref_toggle_state(box)} after clicking '
            f'it; wanted {enabled}')
    blur(driver)
    return pref_row(content, 'editableFieldName')


def shot_fld_name_unchecked(driver):
    """The preference unchecked, which is the default."""
    return shot_editable_field_pref(driver, False)


def shot_fld_name_checked(driver):
    """The preference checked."""
    return shot_editable_field_pref(driver, True)


def shot_editable_field_row(driver, enabled):
    """A record field row with the preference in one state.

    The Name block is in the DOM either way; only its display changes. The
    assertion checks visibility rather than presence, because presence would
    pass in both states and prove nothing.
    """
    driver.execute_script(
        'window.prefs.editableFieldName = arguments[0];', enabled)
    dlg = open_new_record(driver)
    set_record_title(driver, dlg, 'Contact')
    add_named_field(driver, dlg, 'name')

    content = modal_content(dlg)

    # textContent, not .text: .text is empty for a non-displayed element, and
    # the Name block is display:none in exactly the state this shot needs to
    # capture. Matching on .text finds nothing when the preference is off and
    # the check fails on a correct page.
    labels = [e for e in content.find_elements(By.TAG_NAME, 'label')
              if (e.get_attribute('textContent') or '').strip() == 'Name']
    if not labels:
        raise RuntimeError('no Name label in the field row at all')
    if labels[0].is_displayed() != enabled:
        raise RuntimeError(
            f'the Name input is '
            f'{"visible" if labels[0].is_displayed() else "hidden"} but '
            f'editableFieldName is {enabled}')
    blur(driver)
    return content


def shot_fld_name_off(driver):
    """A field row with editable names off: value only."""
    return shot_editable_field_row(driver, False)


def shot_fld_name_on(driver):
    """A field row with editable names on: a Name input above the value."""
    return shot_editable_field_row(driver, True)


# ---------------------------------------------------------------------------
# Phase 6: the recipe example
# ---------------------------------------------------------------------------
#
# www/examples/recipes.txt holds one Ice Cream Sundae record with an `html`
# field carrying an image, plus the ingredients and instructions textareas.
# These shots load that file rather than building the record by hand: the
# README reaches them through the "Load Example Recipes" button, and the html
# field is not something the New Record walkthrough produces.


def load_recipes(driver, timeout=10.0):
    """Load the example recipes file, waiting for the outcome.

    Same shape as load_examples(): the confirm() alert is slow enough that a
    fixed sleep misses it, and an unhandled alert blocks the next command
    rather than failing here.
    """
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    recipes = next((b for b in buttons if 'Load Example Recipes' in b.text), None)
    if recipes is None:
        raise RuntimeError('no "Load Example Recipes" button in the Load File dialogue')
    recipes.click()

    deadline = time.time() + timeout
    accepted = False
    while time.time() < deadline:
        try:
            driver.switch_to.alert.accept()
            accepted = True
            time.sleep(0.4)
        except NoAlertPresentException:
            titles = [b.get_attribute('textContent').strip()
                      for b in driver.find_elements(By.CLASS_NAME, 'accordion-button')]
            if accepted and any(RECIPE_TITLE in t for t in titles):
                time.sleep(0.4)
                return
            time.sleep(0.2)
    raise RuntimeError(
        f'the recipe example did not load within {timeout}s '
        f'(confirm accepted: {accepted})')


def shot_sundae_open(driver):
    """The recipe record expanded, image and all.

    The record's `html` field holds the picture. recipes.txt sets
    allowHtmlFieldRendering itself and loading a file applies its prefs, so
    setting it here would be both redundant and ineffective — the file's value
    wins either way. The assertion below is what actually guards the outcome.
    """
    set_theme(driver, 'dark')
    load_recipes(driver)
    item = expand_record(driver, RECIPE_TITLE)
    images = [e for e in item.find_elements(By.TAG_NAME, 'img') if e.is_displayed()]
    if not images:
        raise RuntimeError(
            'no image in the expanded recipe record; the html field is being '
            'shown as markup rather than rendered')
    return Viewport(driver)


def shot_sundae_new(driver):
    """The recipe record in the edit dialogue, as it looks while being made."""
    set_theme(driver, 'dark')
    load_recipes(driver)
    dlg = open_edit_dialogue(driver, RECIPE_TITLE)
    content = dlg.find_element(By.CLASS_NAME, 'modal-content')
    values = [e.get_attribute('value') for e in
              content.find_elements(By.CSS_SELECTOR, 'input') if e.is_displayed()]
    if RECIPE_TITLE not in values:
        raise RuntimeError(
            f'the edit dialogue is not showing {RECIPE_TITLE!r}: {values!r}')
    blur(driver)
    return content


# The printed report renders into an iframe that printRecords() positions
# off-screen and removes as soon as its hook returns, so it cannot be
# photographed in place. _pamPrintHook is the seam the e2e tests already use to
# read that HTML; this shot takes the same HTML and renders it into a visible
# iframe of its own, then captures that.
#
# The report is the application's own output either way — genRecordsDocument()
# produced it. Only the frame around it is the harness's.

INSTALL_PRINT_HOOK_JS = (
    "window._pamPrintIframeHTML = null;"
    "window._pamPrintHook = function (iframe) {"
    "  window._pamPrintIframeHTML ="
    "    iframe.contentDocument.documentElement.outerHTML;"
    "};"
)

# The report stamps the current time at minute resolution, so the capture
# differs on every run by construction. Frozen before the preview is rendered —
# the report is still PAM's own output, with one field pinned the way the About
# capture pins its commit id.
#
# The date appears TWICE and only one occurrence is labelled: print.js:234
# writes `Printed: <date>` in the cover block, print.js:244 writes a bare
# `<date>` in the footer. Anchoring the match on "Printed:" therefore froze one
# and left the other churning — which the count assertion below caught.
#
# So the date is extracted from the labelled occurrence and every instance of
# that exact string is replaced, which finds the unlabelled one without needing
# to know where it is.
FREEZE_PRINTED_DATE_JS = (
    "var html = window._pamPrintIframeHTML;"
    "var m = html.match(/Printed: ([^<&]+)/);"
    "if (!m) { return 0; }"
    "var actual = m[1].trim();"
    "var count = html.split(actual).length - 1;"
    "window._pamPrintIframeHTML ="
    "  html.split(actual).join('January 1, 2026 at 12:00 AM');"
    "return count;"
)

SHOW_REPORT_JS = (
    "var html = window._pamPrintIframeHTML;"
    "if (!html) { return null; }"
    "var f = document.createElement('iframe');"
    "f.id = 'x-shot-print-preview';"
    "f.style.cssText = 'position:absolute;top:0;left:0;width:794px;"
    "height:400px;border:1px solid #888;background:#fff;z-index:99999;';"
    "document.body.appendChild(f);"
    "var d = f.contentDocument || f.contentWindow.document;"
    "d.open(); d.write(html); d.close();"
    "return true;"
)

SIZE_REPORT_JS = (
    "var f = document.getElementById('x-shot-print-preview');"
    "if (!f) { return 0; }"
    "var d = f.contentDocument || f.contentWindow.document;"
    "var h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);"
    "f.style.height = h + 'px';"
    "return h;"
)


def shot_print_example(driver):
    """The printed records report.

    enablePrinting() must run before the Print entry is reachable: the
    preference alone does not reveal it, because the entry is hidden with
    Bootstrap's d-none rather than by reading the preference at render time.
    """
    set_theme(driver, 'dark')
    driver.execute_script('window.prefs.enablePrinting = true;')
    driver.execute_async_script(
        'var done = arguments[arguments.length - 1];'
        "import('/js/print.js').then(function(m) {"
        '  m.enablePrinting(); done(true);'
        '}).catch(function(e) { done(String(e)); });'
    )
    driver.execute_script(INSTALL_PRINT_HOOK_JS)

    # Not choose_menu_option(): that asserts a modal opens, and Print does not
    # open one — it calls printRecords() directly, the same shape as Help,
    # which that helper explicitly excludes.
    #
    # Matched by the x-print class rather than by text, because headless Chrome
    # renders this entry icon-only with empty .text. The e2e suite reaches it
    # the same way.
    menu = driver.find_element(By.ID, 'menu')
    scroll_and_click(driver, menu)
    time.sleep(SETTLE)
    items = get_children(get_parent(menu))[1].find_elements(
        By.CLASS_NAME, 'dropdown-item')
    target = next((i for i in items
                   if 'x-print' in (i.get_attribute('class') or '')), None)
    if target is None:
        raise RuntimeError(
            'no x-print entry in the menu; enablePrinting() did not reveal it')
    scroll_and_click(driver, target)
    time.sleep(SETTLE)

    deadline = time.time() + 10
    while time.time() < deadline:
        if driver.execute_script('return window._pamPrintIframeHTML !== null;'):
            break
        time.sleep(0.3)
    else:
        raise RuntimeError('the print hook never fired; no report was generated')

    frozen = driver.execute_script(FREEZE_PRINTED_DATE_JS)
    if frozen < 2:
        raise RuntimeError(
            f'expected at least two timestamps to freeze, replaced {frozen}; '
            'the report would churn on every run')

    if not driver.execute_script(SHOW_REPORT_JS):
        raise RuntimeError('no captured report HTML to display')
    time.sleep(SETTLE)

    height = driver.execute_script(SIZE_REPORT_JS)
    if not height:
        raise RuntimeError('the report preview has no height')
    time.sleep(0.5)
    return driver.find_element(By.ID, 'x-shot-print-preview')


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
    ('pam-about-custom-pref.png', shot_about_custom_pref, WINDOW),
    ('pam-record-expanded-edit-facebook.png', shot_edit_facebook, WINDOW),
    ('pam-record-expanded-edit-facebook-new-field.png',
     shot_edit_facebook_new_field, WINDOW),

    ('pam-recipe-prefs.png', shot_recipe_prefs, WINDOW),
    ('pam-new-record.png', shot_new_record_empty, WINDOW),
    ('pam-new-record-title.png', shot_new_record_title, WINDOW),
    ('pam-new-record-field-1-select.png', shot_new_record_field_select, WINDOW),
    ('pam-new-record-field-1.png', shot_new_record_field_1, WINDOW),
    ('pam-new-record-field-2.png', shot_new_record_field_2, WINDOW),
    ('pam-new-record-done.png', shot_new_record_done, (800, FIT)),
    ('pam-new-record-done-expand.png', shot_new_record_done_expand, (800, FIT)),

    ('pam-clone-record-popup.png', shot_clone_popup, WINDOW),
    ('pam-clone-records-1.png', shot_clone_saved, (800, FIT)),
    ('pam-clone-records-2.png', shot_clone_expanded, (800, FIT)),

    ('pam-fld-name-edit-unchecked.png', shot_fld_name_unchecked, WINDOW),
    ('pam-fld-name-edit-off.png', shot_fld_name_off, WINDOW),
    ('pam-fld-name-edit-checked.png', shot_fld_name_checked, WINDOW),
    ('pam-fld-name-edit-on.png', shot_fld_name_on, WINDOW),

    ('pam-ice-cream-sundae-open.png', shot_sundae_open, (800, FIT)),
    ('pam-ice-cream-sundae-new.png', shot_sundae_new, WINDOW),

    ('pam-prefs-enable-printing-example.png', shot_print_example, WINDOW),
]


# Chrome lays out text a fraction of a pixel differently between runs, and in
# one capture that is visible: the field box in the New Record dialogue draws a
# border line with a gap where its legend sits, and the gap's two edges shift by
# a pixel depending on how the legend text happened to measure. The result is a
# 105x2 band of at most sixteen differing pixels — 0.004% of the image, and
# invisible — that made pam-new-record-field-1.png churn on roughly half of all
# runs.
#
# Three attempts to fix it at the source failed, because it is not the
# harness's to fix: not a caret, not field scroll position, not a dropdown
# still fading. So the comparison tolerates it instead, on two conditions.
#
# The discriminator is HEIGHT, not pixel count. Sixteen pixels sounds tiny but a
# text caret is twenty-eight, so a count threshold alone would be perilously
# close to masking one. Nothing meaningful in this UI is three pixels tall
# except a border line — a caret is fourteen rows, a line of text sixteen.
#
# And it is always REPORTED. A tolerated difference prints as `same~` with the
# pixel count, so it can never quietly grow into something real.
NOISE_MAX_ROWS = 3
NOISE_MAX_PIXELS = 64


def difference_is_noise(before, after):
    """Whether two PNGs differ only by subpixel rendering noise.

    Returns (is_noise, differing_pixel_count). Falls back to treating any
    difference as real when Pillow is unavailable, so the check degrades to the
    stricter behaviour rather than the looser one.
    """
    try:
        from PIL import Image, ImageChops  # pylint: disable=import-outside-toplevel
    except ImportError:
        return False, 0

    try:
        one = Image.open(io.BytesIO(before)).convert('RGB')
        two = Image.open(io.BytesIO(after)).convert('RGB')
    except OSError:
        return False, 0
    if one.size != two.size:
        return False, 0

    diff = ImageChops.difference(one, two)
    box = diff.getbbox()
    if box is None:
        return True, 0

    left, top, right, bottom = box
    if bottom - top > NOISE_MAX_ROWS:
        return False, 0

    pixels = diff.load()
    count = sum(1 for y in range(top, bottom) for x in range(left, right)
                if pixels[x, y] != (0, 0, 0))
    return count <= NOISE_MAX_PIXELS, count


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
            existing = handle.read()
        if existing == png:
            state = 'same'
        else:
            is_noise, count = difference_is_noise(existing, png)
            state = 'noise' if is_noise else 'changed'
            if is_noise:
                # Keep the file on disk untouched: rewriting it for invisible
                # differences is the git churn this whole comparison exists to
                # avoid.
                png = existing
                NOISE_REPORT[filename] = count

    if state not in ('same', 'noise') and not check_only:
        with open(path, 'wb') as handle:
            handle.write(png)
    return state, png_size(png)


def progress_line(state, size, position, elapsed, filename):
    """One result line, with how far through the run it is.

    A full pass is several minutes with no other sign of life, and knowing
    whether it is a quarter or three-quarters through decides whether to wait
    or go and do something else. The elapsed column shows which shots are
    actually expensive — the walkthroughs rebuild a record from scratch every
    time — so optimisation can follow measurement rather than guesswork.
    """
    index, total = position
    marker = {'new': 'NEW ', 'changed': 'CHG ', 'same': 'same',
              'noise': 'same~'}[state]
    dimensions = f'{size[0]}x{size[1]}'
    percent = f'{index * 100 // total}%'
    return f'  {marker}  {dimensions:>9}  {percent:>4}  {elapsed:5.1f}s  {filename}'


def selected_shots():
    """The shots to run, honouring SHOT. Returns None if the filter matches none."""
    only = os.environ.get('SHOT', '').strip()
    if not only:
        return SHOTS
    shots = [entry for entry in SHOTS if only in entry[0]]
    if not shots:
        names = ', '.join(sorted(name for name, _, _ in SHOTS))
        print(f'SHOT={only!r} matches nothing.\nAvailable: {names}')
        return None
    print(f'SHOT={only!r}: {len(shots)} of {len(SHOTS)} captures\n')
    return shots


def reset_between_shots(driver):
    """Return the browser to a known state before the next capture.

    Every capture leaves something behind — an open dialogue, a search term, a
    changed theme or preference. Reloading clears all of it, which is cheaper
    to reason about than tracking what each surface needs undone, and it is
    what made the theme and viewport leaks findable.

    Reloading does NOT reset the window, though, and a fitted shot leaves it
    short: after pam-search-g-re the viewport is 320px tall, and in that window
    the fixed footer overlaps the dropdown menu, so the next Load File click is
    intercepted by the Pwd Gen button.
    """
    clear_device_metrics(driver)
    set_viewport_size(driver, *WINDOW)
    driver.get(URL)
    wait_for_page(driver)
    load_examples(driver)
    set_theme(driver, 'dark')


def main():
    '''Walk the shot list. Returns 0, or 1 in check mode if anything differs.'''
    check_only = os.environ.get('CHECK') == '1'

    # Substring match on the filename, so SHOT=google runs the three
    # pam-google-* captures and SHOT=prefs runs the preference tabs.
    shots = selected_shots()
    if shots is None:
        return 1

    driver = get_driver()
    changed = []
    try:
        driver.get(URL)
        time.sleep(1)
        load_examples(driver)

        # Every capture starts dark. Only two shots used to set the theme, so
        # the other twenty-six inherited whatever the previous one left — which
        # made the result depend on shot order rather than on the shot. Any
        # capture that wants light asks for it explicitly; see
        # shot_records_light.
        set_theme(driver, 'dark')

        for index, (filename, func, window) in enumerate(shots, start=1):
            fit = window[1] == FIT
            if window == IPHONE:
                set_device_metrics(driver, *IPHONE, scale=IPHONE_SCALE)
            else:
                clear_device_metrics(driver)
                # For a fitting shot this is only the starting size; the shot
                # runs at full height and capture() shrinks afterwards.
                set_viewport_size(driver, window[0], NARROW[1] if fit else window[1])
            started = time.time()
            state, size = capture(driver, filename, func, check_only, fit)
            print(progress_line(state, size, (index, len(shots)),
                                time.time() - started, filename))
            if state not in ('same', 'noise'):
                changed.append(filename)
            reset_between_shots(driver)
    finally:
        driver.quit()

    print()
    if NOISE_REPORT:
        print('Tolerated as subpixel rendering noise (file left unchanged):')
        for name, count in sorted(NOISE_REPORT.items()):
            print(f'  {name}: {count} pixels')
        print()
    if not changed:
        print(f'{len(shots)} screenshots, none changed')
        return 0
    verb = 'would change' if check_only else 'written'
    print(f'{len(changed)} of {len(shots)} {verb}: {", ".join(changed)}')
    return 1 if check_only else 0


if __name__ == '__main__':
    sys.exit(main())
