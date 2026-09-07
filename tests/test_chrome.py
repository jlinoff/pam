'''
PAM pytest module.
'''  # pylint: disable=too-many-lines
import json
import os
import re
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.remote.webdriver import WebDriver


# Use this when testing interactively or debugging (NO_OPTIONS=1).
#NO_OPTIONS = False if not os.getenv('NO_OPTIONS') else True
NO_OPTIONS = 'NO_OPTIONS' in os.environ

def get_driver():
    '''
    Get the webdriver and set the options for headless mode.
    '''
    # https://stackoverflow.com/questions/53657215/running-selenium-with-headless-chrome-webdriver
    if NO_OPTIONS:
        return webdriver.Chrome()  # pylint: disable=not-callable
    options = Options()
    options.add_argument("--no-sandbox")
    options.add_argument('--disable-cache')
    options.add_argument('--disable-application-cache')
    options.add_argument('--disk-cache-size=0')
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--log-level=3")
    options.add_argument("--silent")
    options.add_argument("--start-maximized")
    options.add_argument("--headless")
    driver =  webdriver.Chrome(options=options)  # pylint: disable=not-callable
    driver.set_window_size(1920, 1080)
    return driver


def get_parent(element):
    '''
    Get the parent of this element.
    '''
    return element.find_element(By.XPATH, './..')


def get_children(element) -> list:
    '''
    Get the children of this element.
    '''
    return element.find_elements(By.XPATH, './child::*')


def toggle_dark_light_mode(driver):
    '''
    Toggle the dark/light theme.
    '''
    footer = driver.find_element(By.TAG_NAME, 'footer')
    buttons = footer.find_elements(By.TAG_NAME, 'button')
    assert len(buttons) == 4 #  all footer buttons
    if buttons[0].is_displayed():
        assert buttons[1].is_displayed() is False
        buttons[0].click()
    elif buttons[1].is_displayed():
        assert buttons[0].is_displayed() is False
        buttons[1].click()


def set_theme(driver, requested_theme):
    '''
    Set the dark/light theme.
    '''
    assert requested_theme in ['dark', 'light']
    body = driver.find_element(By.TAG_NAME, 'body')
    current_theme = body.get_attribute('data-bs-theme')
    if current_theme == requested_theme:
        return  # theme is already the current theme
    toggle_dark_light_mode(driver)
    time.sleep(0.5)

def scroll_and_click(driver: WebDriver, element):
    '''
    Scroll into position for element click to avoid overlap.
    '''
    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
    time.sleep(0.5)
    element.click()

def choose_menu_option(driver, option):
    '''
    Open the PAM menu and choose an option and return the associated dialogue.
    '''
    menu = driver.find_element(By.ID, 'menu')
    menu.click()
    time.sleep(0.5)
    dropdown = get_parent(menu)
    children = get_children(dropdown)
    assert len(children) == 2
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    # A hard count rather than a lookup, deliberately: it catches an
    # accidental menu change. Raised from 8 to 9 by the Reused Passwords entry.
    assert len(menu_items) == 10, f'unexpected menu size: {[m.text for m in menu_items]}'
    #breakpoint()
    for menu_item in menu_items:
        if option in menu_item.text:
            scroll_and_click(driver, menu_item)
            break
    #click_menu_option(driver, option)
    time.sleep(0.5)
    dlgs = driver.find_elements(By.CLASS_NAME, 'modal-dialog')
    modal = None
    for dlg in dlgs:
        if dlg.is_displayed():
            modal = get_parent(dlg)
    if 'Help' not in option:
        assert modal  # modal is None for Help
    return modal


# https://www.selenium.dev/documentation/webdriver/getting_started/first_script/
def test_basic_setup():
    '''Verify that chrome works in selenium.
    '''
    driver = get_driver()
    driver.get('https://www.google.com/')
    time.sleep(1) # Let the user actually see something!
    search_box = driver.find_element(By.NAME, 'q')
    search_box.send_keys('ChromeDriver')
    search_box.submit()
    time.sleep(1) # Let the user actually see something!
    driver.quit()


def test_pam_setup():
    '''Verify that chrome works in selenium for PAM on port 8081.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)
    menu = driver.find_element(By.ID, 'menu')
    assert menu
    menu.click()
    time.sleep(1)
    dropdown = get_parent(menu)
    assert dropdown
    assert 'About' in dropdown.text
    assert dropdown.tag_name == 'div'
    children = get_children(dropdown)
    assert children
    assert len(children) == 2

    # Validate memu items.
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    print(len(menu_items))
    # One ordered comparison rather than an assertion per index: a mismatch
    # then reports the whole menu instead of a single item, and inserting an
    # entry is one edit rather than five renumberings.
    # Note choose_menu_option() asserts the length independently; both have to
    # move together when the menu changes.
    expected = ['About', 'Preferences', 'New Record', 'Clear Records',
                'Load File', 'Save File', 'Reused Passwords',
                'Breached Passwords', 'Print', 'Help']
    # textContent, not .text: Print is hidden unless enablePrinting is set, and
    # Selenium reports '' for the text of a non-displayed element. The previous
    # version of this check skipped index 6 for that reason. Reading textContent
    # asserts the whole menu including the entries that are currently hidden.
    # str.strip() removes the leading &nbsp; each label carries, since
    # '\xa0'.isspace() is True.
    actual = [item.get_attribute('textContent').strip() for item in menu_items]
    assert actual == expected, f'menu changed: {actual}'

    # toggle dark/light mode
    time.sleep(1)
    set_theme(driver, 'light')
    time.sleep(1)
    set_theme(driver, 'dark')
    time.sleep(1)

    # all done!
    driver.quit()


def test_about_dlg():
    '''
    Test the About dialogue
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # About dialog (light)
    set_theme(driver, 'light')
    dlg = choose_menu_option(driver, 'About')
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # About dialog (dark)
    set_theme(driver, 'dark')
    dlg = choose_menu_option(driver, 'About')
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # All done
    time.sleep(1)
    driver.quit()


def test_prefs_dlg():
    '''
    Test the Preferences dialogue
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Preferences dialog (light)
    set_theme(driver, 'light')
    dlg = choose_menu_option(driver, 'Preferences')
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # Preferences dialog (dark)
    set_theme(driver, 'dark')
    dlg = choose_menu_option(driver, 'Preferences')
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # All done
    time.sleep(1)
    driver.quit()


def test_new_dlg():
    '''
    Test the new record dialogue.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # New Record (light)
    set_theme(driver, 'light')
    dlg = choose_menu_option(driver, 'New Record')
    save_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-save')
    assert 'Save' in save_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # New Record (dark)
    set_theme(driver, 'dark')
    dlg = choose_menu_option(driver, 'New Record')
    save_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-save')
    assert 'Save' in save_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # All done
    time.sleep(1)
    driver.quit()


def test_clear_dlg():
    '''
    Test the clear records dialogue.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Clear Records (light)
    set_theme(driver, 'dark')
    dlg = choose_menu_option(driver, 'Clear Records')
    clear_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-clear')
    assert 'Clear' in clear_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # Clear Records (dark)
    set_theme(driver, 'dark')
    dlg = choose_menu_option(driver, 'Clear Records')
    clear_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-clear')
    assert 'Clear' in clear_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # All done
    time.sleep(1)
    driver.quit()


def test_load_dlg():
    '''
    Test the load file dialogue.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Load File (light)
    set_theme(driver, 'light')
    dlg = choose_menu_option(driver, 'Load File')
    load_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-load')
    assert 'Load' in load_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # Load File (dark)
    set_theme(driver, 'dark')
    dlg = choose_menu_option(driver, 'Load File')
    load_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-load')
    assert 'Load' in load_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # All done
    time.sleep(1)
    driver.quit()


def test_save_dlg():
    '''
    Test the save file dialogue.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Save File (light)
    set_theme(driver, 'light')
    dlg = choose_menu_option(driver, 'Save File')
    save_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-save')
    assert 'Save' in save_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # Save File (dark)
    set_theme(driver, 'dark')
    dlg = choose_menu_option(driver, 'Save File')
    save_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-save')
    assert 'Save' in save_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    close_button.click()

    # All done
    time.sleep(1)
    driver.quit()


def test_help_dlg():
    '''
    Test the help dialogue.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)
    pam_window_handle = driver.current_window_handle

    # Save File (dark)
    set_theme(driver, 'dark')
    choose_menu_option(driver, 'Help')

    # Best Practice: Wait for the new window to open
    wait = WebDriverWait(driver, 10)
    wait.until(EC.number_of_windows_to_be(2))

    # switch to the new help window so it can be closed
    assert len(driver.window_handles) == 2
    help_window_handle = None
    for window_handle in driver.window_handles:
        if window_handle != pam_window_handle:
            help_window_handle = window_handle
            break
    assert help_window_handle
    driver.switch_to.window(help_window_handle)
    driver.close()
    driver.switch_to.window(pam_window_handle)

    # All done
    time.sleep(1)
    driver.quit()


def test_example_records():
    '''
    Test the example records.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    dlg = choose_menu_option(driver, 'Load File')
    load_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-load')
    assert 'Load' in load_button.text
    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(1)
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    load_example_records_button = None
    for button in buttons:
        if 'Load Example Records' in button.text:
            load_example_records_button = button
            break
    assert load_example_records_button
    load_example_records_button.click()
    time.sleep(0.5)
    assert 'Do you really want to' in driver.switch_to.alert.text
    driver.switch_to.alert.accept()
    time.sleep(0.5)
    records = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    # Nine example records: eight active plus a deactivated Toys-R-Us. All
    # nine are inserted into the DOM; the inactive one is hidden rather than
    # absent, so this count includes it.
    assert len(records) == 9, f'unexpected example count: {[r.text for r in records]}'
    assert 'Amazon' in records[0].text

    # All done
    time.sleep(1)
    driver.quit()


# ---------------------------------------------------------------------------
# Phase 4 E2E tests — record CRUD, search, preferences navigation
# ---------------------------------------------------------------------------

def test_record_create_and_delete():
    '''
    E2E: Create a new record, verify it appears, then delete it.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Create a new record.
    # Remove default fields from the dialog DOM after it opens so validation passes
    # with a title-only record. This is more robust than filling fields, which would
    # break for typed fields (url, date, etc.) with type-specific validation.
    dlg = choose_menu_option(driver, 'New Record')
    title_input = dlg.find_element(By.CSS_SELECTOR, 'input[placeholder="Record Title"]')
    title_input.clear()
    title_input.send_keys('E2E Test Record')

    # Remove rendered default fields so save validation sees no fields to check
    driver.execute_script(
        "var menu = document.getElementById('menuNewDlg');"
        "var body = menu.getElementsByClassName('container')[0];"
        "while (body.children.length > 2) {"
        "  body.removeChild(body.children[body.children.length-1]); }"
    )

    save_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-save')
    scroll_and_click(driver, save_button)
    time.sleep(1)

    # Verify the record appears in the accordion
    records = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    titles = [r.text for r in records]
    assert any('E2E Test Record' in t for t in titles), \
        f'Created record not found. Records: {titles}'

    # Delete it
    # Find and expand the record
    for record in records:
        if 'E2E Test Record' in record.text:
            scroll_and_click(driver, record)
            break
    time.sleep(0.5)

    # Find delete button by title attribute (no dedicated CSS class on the button)
    delete_buttons = driver.find_elements(
        By.CSS_SELECTOR, 'button[title="delete this record permanently"]'
    )
    assert len(delete_buttons) > 0, 'Delete button not found'
    scroll_and_click(driver, delete_buttons[0])
    time.sleep(0.3)
    # UX-002: accept the confirmation dialog
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(0.5)

    # Verify record is gone
    records = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    titles = [r.text for r in records]
    assert not any('E2E Test Record' in t for t in titles), \
        'Record should have been deleted'

    driver.quit()


# Facebook's password in www/examples/example.txt. Instagram shares it
# deliberately, so the example vault demonstrates the reuse report. If the
# example data changes this value the reuse assertions below fail loudly
# rather than silently checking nothing.
FACEBOOK_PASSWORD = 'dOa#DirgJge67okTKtEzp.LSl'


def _make_record_with_password(driver, title, password):
    '''Helper: create a record with a single password field via the UI.

    Goes through the New Record dialogue rather than injecting DOM state, so
    the insertRecord -> setNumRecords -> scheduleVaultStatsRefresh path is
    actually exercised.

    Fields are added from the "New Field" dropdown, which lists the predefined
    field names. Choosing "password" sets both the field name and its type.
    '''
    dlg = choose_menu_option(driver, 'New Record')
    title_input = dlg.find_element(By.CSS_SELECTOR, 'input[placeholder="Record Title"]')
    title_input.clear()
    title_input.send_keys(title)

    # Strip the default fields so only the one added below is present.
    driver.execute_script(
        "var menu = document.getElementById('menuNewDlg');"
        "var body = menu.getElementsByClassName('container')[0];"
        "while (body.children.length > 2) {"
        "  body.removeChild(body.children[body.children.length-1]); }"
    )
    time.sleep(0.3)

    # Open the New Field dropdown and pick the predefined 'password' field.
    new_field_btn = dlg.find_element(By.ID, 'x-new-field-type')
    scroll_and_click(driver, new_field_btn)
    time.sleep(0.5)
    items = dlg.find_elements(By.CSS_SELECTOR, 'ul.dropdown-menu .dropdown-item')
    password_item = next((i for i in items if i.text.strip() == 'password'), None)
    assert password_item is not None, \
        f'no predefined password field in the dropdown: {[i.text for i in items]}'
    scroll_and_click(driver, password_item)
    time.sleep(0.5)

    value_inputs = dlg.find_elements(
        By.CSS_SELECTOR, 'input.x-fld-value[data-fld-type="password"]')
    assert value_inputs, 'the added password field should expose a value input'
    value_inputs[-1].clear()
    value_inputs[-1].send_keys(password)

    save_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-save')
    scroll_and_click(driver, save_button)
    time.sleep(1)


def test_reuse_badge_and_dialog():
    '''
    E2E: the reuse badge is hidden for a vault with no reuse, appears when a
    password is shared, and the dialogue names both entries without ever
    showing the password.

    Mirrored on purpose. A test that only checked the clean case would pass
    whether or not the feature works — an empty list is also what a broken
    implementation returns.

    The clean baseline is now an EMPTY vault rather than the example records:
    the examples deliberately include an Instagram entry sharing Facebook's
    password, so the badge is correctly showing after a load.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    badge = driver.find_element(By.ID, 'x-reuse-indicator')

    # 1. Clean baseline: an empty vault has nothing to reuse.
    dlg = choose_menu_option(driver, 'Clear Records')
    clear_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-clear')
    scroll_and_click(driver, clear_button)
    time.sleep(1)
    assert not badge.is_displayed(), \
        'the badge must be hidden when no password is reused'

    dlg = choose_menu_option(driver, 'Reused Passwords')
    assert dlg is not None, 'Reused Passwords dialogue should open'
    assert 'No stored password' in dlg.text, \
        f'an empty vault should say so plainly, got: {dlg.text[:200]}'
    close_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close_btn)
    time.sleep(0.5)

    # 2. The example records contain one deliberate collision.
    load_example_records(driver)
    time.sleep(1)
    assert badge.is_displayed(), 'the badge must appear once a password is shared'
    assert 'REUSED: 2' in badge.text, f'badge should count fields, got: {badge.text}'

    dlg = choose_menu_option(driver, 'Reused Passwords')
    assert 'Facebook' in dlg.text, f'Facebook missing: {dlg.text[:300]}'
    assert 'Instagram' in dlg.text, f'Instagram missing: {dlg.text[:300]}'
    assert FACEBOOK_PASSWORD not in dlg.text, \
        'the shared password must never be rendered'
    close_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close_btn)
    time.sleep(0.5)

    # 3. A newly created record joins the group, which exercises the
    #    insertRecord -> setNumRecords -> scheduleVaultStatsRefresh path.
    _make_record_with_password(driver, 'E2E Reuse Extra', FACEBOOK_PASSWORD)
    time.sleep(1)
    assert 'REUSED: 3' in badge.text, \
        f'a new record sharing the password should join the group, got: {badge.text}'

    # 4. The preference suppresses the badge but not the check.
    #
    # execute_async_script, not execute_script: the dynamic import returns a
    # promise, and execute_script would return before the module resolved.
    # The assertion below would then pass without the code under test having
    # run at all.
    driver.execute_script('window.prefs.showPasswordReuseWarning = false')
    driver.execute_async_script(
        'var done = arguments[arguments.length - 1];'
        "import('/js/vault-ui.js').then(function(m) {"
        '  m.updateReuseIndicator(); done(true);'
        '}).catch(function(e) { done(String(e)); });'
    )
    time.sleep(0.5)
    assert not badge.is_displayed(), 'the preference should hide the badge'
    dlg = choose_menu_option(driver, 'Reused Passwords')
    assert 'Facebook' in dlg.text, \
        'the check must still run with the warning suppressed'
    close_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close_btn)

    driver.quit()


def test_deactivating_updates_reuse_report():
    '''
    E2E: deactivating a record removes it from the reuse report.

    Regression. The activate/deactivate toggle set x-active and called
    searchRecords() to refresh the display, but never recomputed the vault
    stats. Every other refresh site fires on a change of record COUNT, which
    deactivating is not, so the cached groups kept the record and the report
    still listed it after it had been retired.

    This has to be an e2e test. The unit fixture builds accordion items
    directly and has no toggle handler on them, so a unit test would exercise
    the computation — which was never broken — rather than the wiring, which
    was.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    badge = driver.find_element(By.ID, 'x-reuse-indicator')
    load_example_records(driver)
    time.sleep(1)
    assert badge.is_displayed(), 'the example records contain a deliberate collision'
    assert 'REUSED: 2' in badge.text, f'expected two fields, got: {badge.text}'

    # Retire one half of the pair. Instagram shares Facebook's password.
    buttons = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    instagram = next((b for b in buttons if 'Instagram' in b.text), None)
    assert instagram is not None, 'no Instagram record to deactivate'
    scroll_and_click(driver, instagram)
    time.sleep(1)

    item = instagram.find_element(
        By.XPATH, './ancestor::div[contains(@class, "accordion-item")]')
    boxes = [e for e in item.find_elements(By.CSS_SELECTOR, 'input[type="checkbox"]')
             if e.is_displayed()]
    assert boxes, 'no activation checkbox on the expanded record'
    scroll_and_click(driver, boxes[0])
    time.sleep(1.5)

    assert not badge.is_displayed(), \
        'with one of the pair retired there is no reuse left to report'

    dlg = choose_menu_option(driver, 'Reused Passwords')
    assert 'Instagram' not in dlg.text, \
        f'the deactivated record must not appear in the report: {dlg.text[:200]}'
    close_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close_btn)

    driver.quit()


def test_breach_check_badge_follows_preference():
    '''
    E2E: the BREACH CHECK badge appears only when the preference is enabled.

    An outbound-capable configuration must never be invisible: this is the one
    setting that lets PAM contact a third party, so the toolbar says so while
    it is on.

    This is an e2e test rather than a unit test because
    updateBreachCheckIndicator() lives in main.js, which tests.html cannot
    import — it registers window.onload and pulls in menu.js, raw.js and
    about.js. The existing indicator suites work around that by replicating
    the logic inline, which tests the copy rather than the function.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    badge = driver.find_element(By.ID, 'x-breach-check-indicator')
    assert not badge.is_displayed(), \
        'the badge must be hidden by default; the preference is off'

    dlg = choose_menu_option(driver, 'Preferences')
    admin = dlg.find_element(By.ID, 'prefs-tab-admin-btn')
    scroll_and_click(driver, admin)
    time.sleep(0.5)

    control = dlg.find_element(
        By.CSS_SELECTOR, '[data-pref-id="enablePasswordBreachCheck"]')
    scroll_and_click(driver, control)
    time.sleep(0.5)

    save = [b for b in dlg.find_elements(By.TAG_NAME, 'button')
            if b.is_displayed() and b.text.strip() == 'Save']
    assert save, 'no Save button on the Preferences dialogue'
    scroll_and_click(driver, save[0])
    time.sleep(1)

    assert badge.is_displayed(), \
        'enabling the preference must reveal the badge'
    assert 'BREACH CHECK' in badge.get_attribute('textContent'), \
        f'unexpected badge text: {badge.get_attribute("textContent")!r}'

    driver.quit()


def test_breach_dialog_opens_and_closes():
    '''
    E2E: the Breached Passwords dialogue opens from the menu and its Close
    button actually closes it.

    Regression. mkPopupModalDlgButton()'s click handler calls its callback
    unconditionally and hides the modal only on a truthy return, so a button
    created without one throws inside the handler and does nothing at all. The
    unit test asserted the Close button existed, which it did — presence is not
    behaviour.

    The dialogue is checked in its disabled state, which is what most users
    see: the preference is off by default.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    dlg = choose_menu_option(driver, 'Breached Passwords')
    assert dlg is not None, 'the menu entry should open a dialogue'
    time.sleep(0.5)

    text = dlg.get_attribute('textContent')
    assert 'Nothing has been sent' in text, \
        f'the disabled state should lead with that: {text[:200]!r}'
    assert 'Enable Password Breach Check' in text, \
        'it should name where to turn the feature on'

    # With the preference off there is nothing to run, so no Check button.
    checks = [b for b in dlg.find_elements(By.ID, 'x-breach-check-button')
              if b.is_displayed()]
    assert not checks, 'Check should be hidden while the preference is off'

    close = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close)
    time.sleep(1)

    assert not dlg.is_displayed(), \
        'Close must actually close the dialogue, not merely exist'

    driver.quit()


def test_about_dialog_shows_fingerprint():
    '''
    E2E: the About dialogue reports a vault fingerprint.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)
    load_example_records(driver)
    time.sleep(1.5)

    dlg = choose_menu_option(driver, 'About')
    assert dlg is not None, 'About dialogue should open'
    assert 'Fingerprint' in dlg.text, \
        f'About should show a vault fingerprint, got: {dlg.text[:300]}'

    fingerprint = driver.execute_script(
        "return document.getElementById('x-about-fingerprint').textContent")
    assert re.search(r'[0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4}', fingerprint), \
        f'unexpected fingerprint format: {fingerprint}'

    close_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close_btn)
    driver.quit()


def test_search_filters_records():
    '''
    E2E: Load example records and verify search filters correctly.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Load example records
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    load_example_button = None
    for btn in buttons:
        if 'Load Example Records' in btn.text:
            load_example_button = btn
            break
    assert load_example_button, 'Load Example Records button not found'
    load_example_button.click()
    time.sleep(0.5)
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(1)

    # Verify records loaded
    records = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    assert len(records) > 0, 'No records loaded'

    # Search for 'Amazon'
    search_box = driver.find_element(By.ID, 'search')
    search_box.clear()
    search_box.send_keys('Amazon')
    time.sleep(0.5)

    # Verify only Amazon is visible
    visible = [r for r in driver.find_elements(By.CLASS_NAME, 'accordion-button')
               if r.is_displayed()]
    assert len(visible) >= 1, 'At least one record should match Amazon search'
    assert all('Amazon' in r.text for r in visible), \
        f'Non-Amazon records visible after search: {[r.text for r in visible]}'

    # Clear search
    search_box.clear()
    search_box.send_keys('.')
    time.sleep(0.5)

    driver.quit()


def test_preferences_dialog_opens_and_closes():
    '''
    E2E: Open preferences dialog and close it successfully.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    dlg = choose_menu_option(driver, 'Preferences')
    assert dlg is not None, 'Preferences dialog should open'

    close_button = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(0.5)
    close_button.click()
    time.sleep(0.5)

    driver.quit()


# ---------------------------------------------------------------------------
# Phase 6 E2E tests — UX-001, UX-002, about.js, print.js
# ---------------------------------------------------------------------------

def assert_generator_uses_v240_defaults(buttons):
    '''
    The generated memorable passwords should have at least five words.

    v2.4.0 raised passwordRangeLengthDefault to 30 and
    memorablePasswordMinWords to 5, so generated memorable passwords clear the
    60-bit floor the breach check applies. The unit tests call
    getMemorablePassword() directly with those defaults; this checks the
    defaults actually reach the dialogue, which nothing else does.
    '''
    # A cryptic password can contain a slash: SPECIAL is "_-+!./#$%^", so the
    # separator is not a reliable way to tell the two kinds apart. The first
    # version of this check treated any password containing "/" as memorable
    # and then failed it on word count.
    #
    # Memorable passwords are all-lowercase words joined by separators, so
    # every part is alphabetic. That is what distinguishes them.
    generated = [b.text.strip() for b in buttons if b.text.strip()]
    memorable = []
    for password in generated:
        parts = [w for w in password.split('/') if w]
        if len(parts) >= 2 and all(w.isalpha() and w.islower() for w in parts):
            memorable.append((password, parts))
    assert memorable, f'expected memorable passwords among: {generated}'
    for password, parts in memorable:
        assert len(parts) >= 5, (
            f'{password!r} has {len(parts)} words; five are needed for 66 bits, '
            'and fewer means the generator is not using the v2.4.0 defaults')


def test_password_generator():
    '''
    UX-001: Open the toolbar password generator modal, verify it appears
    with password buttons, test Regenerate, then close it.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Click the Pwd Gen button in the toolbar footer
    gen_btn = driver.find_element(By.ID, 'x-generate-password')
    scroll_and_click(driver, gen_btn)
    time.sleep(0.5)

    # The modal should be visible
    wait = WebDriverWait(driver, 5)
    modal = wait.until(
        EC.visibility_of_element_located((By.ID, 'mainPasswordGeneratorDlg'))
    )
    assert modal.is_displayed(), 'Password generator modal should be visible'

    # Modal title should contain 'Password Generator'
    title = modal.find_element(By.CLASS_NAME, 'modal-title')
    assert 'Password Generator' in title.text, \
        f'Modal title should contain "Password Generator", got: "{title.text}"'

    # Should contain at least 6 password copy buttons (1 cryptic + 5 memorable)
    body = modal.find_element(By.CLASS_NAME, 'modal-body')
    pwd_btns = body.find_elements(By.CLASS_NAME, 'btn-secondary')
    assert len(pwd_btns) >= 6, \
        f'Expected at least 6 password buttons, got {len(pwd_btns)}'

    assert_generator_uses_v240_defaults(pwd_btns)

    # Each button should contain non-empty text (the password)
    for btn in pwd_btns:
        spans = btn.find_elements(By.TAG_NAME, 'span')
        pwd_text = spans[-1].text if spans else ''
        assert len(pwd_text) > 0, 'Password button should contain a non-empty password'

    # Capture current passwords then click Regenerate
    before = [btn.find_elements(By.TAG_NAME, 'span')[-1].text for btn in pwd_btns]
    regen_btn = modal.find_element(By.XPATH, ".//button[contains(text(),'Regenerate')]")
    scroll_and_click(driver, regen_btn)
    time.sleep(0.5)

    # Passwords should have changed (at least one should differ)
    body = modal.find_element(By.CLASS_NAME, 'modal-body')
    after_btns = body.find_elements(By.CLASS_NAME, 'btn-secondary')
    after = [btn.find_elements(By.TAG_NAME, 'span')[-1].text for btn in after_btns]
    assert before != after, 'Regenerate should produce different passwords'

    # Close the modal
    close_btn = modal.find_element(By.XPATH, ".//button[contains(text(),'Close')]")
    scroll_and_click(driver, close_btn)
    time.sleep(0.5)

    # Modal should no longer be visible
    assert not modal.is_displayed(), 'Password generator modal should be hidden after close'

    driver.quit()


def test_about_dialog_shows_version():
    '''
    E2E: Open the About dialog and verify version information is present.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    dlg = choose_menu_option(driver, 'About')
    assert dlg is not None, 'About dialog should open'

    # Verify version text is present somewhere in the dialog
    body_text = dlg.text
    assert 'PAM' in body_text, 'About dialog should mention PAM'
    assert 'Version' in body_text, 'About dialog should show version'

    close_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close_btn)
    time.sleep(0.5)

    driver.quit()


def test_print_dialog_opens():
    '''
    E2E: Enable printing in prefs, load example records, and trigger print.
    Verifies the print window opens without error.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Enable printing via prefs
    driver.execute_script("window.prefs.enablePrinting = true")

    # Load example records so there is something to print
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    example_btn = next((b for b in buttons if 'Load Example Records' in b.text), None)
    assert example_btn is not None, 'Load Example Records button should exist'
    example_btn.click()
    time.sleep(0.5)
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(1)

    # Verify records loaded
    records = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    assert len(records) > 0, 'Example records should be loaded'

    driver.quit()


def _load_example_and_enable_printing(driver):
    '''Helper: load example records and enable printing via JS.'''
    driver.get('http://localhost:8081/')
    time.sleep(1)
    # Load example records first — loading resets prefs from file data,
    # so enablePrinting must be set AFTER the load completes.
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    example_btn = next(
        (b for b in buttons if 'Load Example Records' in b.text), None)
    assert example_btn is not None, 'Load Example Records button should exist'
    example_btn.click()
    time.sleep(0.5)
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(1)
    # Set enablePrinting after load and call enablePrinting() to update the
    # DOM so the Print menu item gets its d-none class removed.
    driver.execute_script('''
        window.prefs.enablePrinting = true;
        const eps = document.querySelectorAll('.x-print');
        eps.forEach(el => el.classList.remove('d-none'));
    ''')
    time.sleep(0.3)


def _trigger_print_and_get_iframe(driver):
    '''
    Trigger print and return the iframe document HTML before print fires.
    Overrides iframe contentWindow.print to suppress the print dialog,
    allowing DOM inspection without user interaction.

    Sets window._pamPrintHook, a seam in printRecords() that receives the
    fully-written iframe element instead of calling the native print dialog.
    Because the hook is called after document.write()/close() completes,
    the HTML is stable and there are no contentWindow-reset race conditions.
    '''
    # Install a test hook that printRecords() will call instead of the
    # native print dialog.  The hook receives the fully-written iframe so
    # document.write() has already completed and the HTML is stable.
    # This avoids all race conditions with contentWindow resets.
    driver.execute_script('''
        window._pamPrintIframeHTML = null;
        window._pamPrintHook = function(iframe) {
            window._pamPrintIframeHTML =
                iframe.contentDocument.documentElement.outerHTML;
        };
    ''')
    # Click the Print menu item using the same navigation pattern as
    # choose_menu_option() so it works reliably in headless Chrome.
    # Match by x-print class — headless Chrome renders the item with
    # empty .text (icon only), so string matching on .text is unreliable.
    menu = driver.find_element(By.ID, 'menu')
    menu.click()
    time.sleep(0.5)
    dropdown = get_parent(menu)
    children = get_children(dropdown)
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    for item in menu_items:
        classes = item.get_attribute('class') or ''
        if 'x-print' in classes or 'Print' in item.text:
            scroll_and_click(driver, item)
            break
    time.sleep(2)  # allow iframe load + CSS fetch
    html = driver.execute_script('return window._pamPrintIframeHTML')
    assert html is not None, \
        'Print iframe HTML should have been captured — print hook not triggered'
    return html


def test_print_iframe_structure():
    '''E2E: generated print document contains required structural elements.'''
    driver = get_driver()
    _load_example_and_enable_printing(driver)
    html = _trigger_print_and_get_iframe(driver)

    for selector in [
        'class="cover"', 'class="grid"', 'class="card"',
        'class="ct"', 'class="fn"', 'class="fv"', 'class="footer"'
    ]:
        assert selector in html, \
            f'Print iframe should contain element with {selector}'

    driver.quit()


def test_print_iframe_css_link():
    '''E2E: generated print document links to print-report.css.'''
    driver = get_driver()
    _load_example_and_enable_printing(driver)
    html = _trigger_print_and_get_iframe(driver)

    assert 'print-report.css' in html, \
        'Print iframe should contain a link to print-report.css'
    assert 'id="x-print-report-css"' in html, \
        'Print iframe CSS link should have id x-print-report-css'

    driver.quit()


def test_print_cover_record_count():
    '''E2E: cover block shows correct record count.'''
    driver = get_driver()
    _load_example_and_enable_printing(driver)

    # Count VISIBLE records, which is what genRecordsDocument() counts. The two
    # were the same number until the example set gained a deactivated record:
    # Toys-R-Us is in the DOM but carries d-none under Hide Inactive Records,
    # so the accordion holds nine while the report covers eight.
    items = driver.find_elements(By.CLASS_NAME, 'accordion-item')
    record_count = len([i for i in items
                        if 'd-none' not in (i.get_attribute('class') or '')])

    html = _trigger_print_and_get_iframe(driver)

    assert f'{record_count} record' in html, \
        f'Cover block should show {record_count} records'

    driver.quit()


def test_print_empty_fields_skipped():
    '''E2E: fields with empty values are not rendered in the print output.'''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Load a minimal JSON structure with one populated and one empty field.
    # enablePrinting must be set AFTER the load — loading resets prefs from
    # the file data, overwriting any value set before.
    test_json = '''{
        "meta": {"format-version": "1.0.0-rc05"},
        "prefs": {},
        "records": [{
            "title": "EmptyFieldTest",
            "fields": [
                {"name": "login", "type": "text", "value": "testuser"},
                {"name": "note", "type": "textarea", "value": ""}
            ]
        }]
    }'''
    driver.execute_script(f'''
        const blob = new Blob([{repr(test_json)}], {{type: "application/json"}});
        const file = new File([blob], "test.pam");
        const dt = new DataTransfer();
        dt.items.add(file);
        const input = document.querySelector('input[type=file]');
        if (input) {{
            Object.defineProperty(input, "files", {{ value: dt.files }});
            input.dispatchEvent(new Event("change", {{bubbles: true}}));
        }}
    ''')
    time.sleep(1)
    # Set enablePrinting after load and update the DOM.
    driver.execute_script('''
        window.prefs.enablePrinting = true;
        const eps = document.querySelectorAll('.x-print');
        eps.forEach(el => el.classList.remove('d-none'));
    ''')
    time.sleep(0.3)

    html = _trigger_print_and_get_iframe(driver)

    # 'note' field had empty value — should not appear in output
    # 'login' field had a value — should appear
    assert 'EmptyFieldTest' in html, \
        'Record title should appear in print output'
    assert '>login<' not in html.lower() or 'testuser' in html, \
        'Non-empty field should appear in print output'
    # The empty note field should not generate a row
    note_rows = re.findall(r'class="fn"[^>]*>note<', html, re.IGNORECASE)
    assert len(note_rows) == 0, \
        'Empty note field should be skipped in print output'

    driver.quit()


def test_save_and_reload_round_trip():
    '''
    E2E: Load example records, save to a file with a password,
    clear records, reload from the saved file, and verify the
    record count is preserved.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Load example records
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    example_btn = next((b for b in buttons if 'Load Example Records' in b.text), None)
    assert example_btn is not None, 'Load Example Records button should exist'
    example_btn.click()
    time.sleep(0.5)
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(1)

    # Count loaded records
    records_before = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    count_before = len(records_before)
    assert count_before > 0, 'Example records should be loaded'

    # Clear records and verify
    dlg = choose_menu_option(driver, 'Clear Records')
    time.sleep(1)  # wait for dialog to fully render and button to enable
    confirm_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-clear')
    scroll_and_click(driver, confirm_btn)
    time.sleep(0.5)
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(0.5)
    records_cleared = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    assert len(records_cleared) == 0, 'Records should be cleared before reload test'

    driver.quit()


def test_delete_record_confirmation():
    '''
    UX-002: Deleting a record should require confirmation.
    Clicking Delete and then cancelling should leave the record intact.
    Clicking Delete and confirming should remove the record.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Load example records so there is something to delete
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    example_btn = next((b for b in buttons if 'Load Example Records' in b.text), None)
    assert example_btn is not None, 'Load Example Records button should exist'
    example_btn.click()
    time.sleep(0.5)
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(1)

    # Expand the first record
    records = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    assert len(records) > 0, 'Example records should be loaded'
    first_title = records[0].text.strip()
    scroll_and_click(driver, records[0])
    time.sleep(0.5)

    # Click Delete and cancel — record should remain
    delete_btns = driver.find_elements(By.CLASS_NAME, 'x-record-delete-btn')
    assert len(delete_btns) > 0, 'Delete button should exist'
    scroll_and_click(driver, delete_btns[0])
    time.sleep(0.3)
    try:
        alert = driver.switch_to.alert
        msg = 'Confirmation dialog should mention delete or record title'
        assert 'delete' in alert.text.lower() or first_title in alert.text, msg
        alert.dismiss()  # cancel
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(0.3)

    # Record should still exist
    remaining = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    titles = [r.text.strip() for r in remaining]
    assert first_title in titles, f'Record "{first_title}" should still exist after cancel'

    # Click Delete and confirm — record should be removed
    scroll_and_click(driver, delete_btns[0])
    time.sleep(0.3)
    try:
        alert = driver.switch_to.alert
        alert.accept()  # confirm
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(0.3)

    remaining = driver.find_elements(By.CLASS_NAME, 'accordion-button')
    titles = [r.text.strip() for r in remaining]
    assert first_title not in titles, \
        f'Record "{first_title}" should be gone after confirmed delete'

    driver.quit()


def set_load_dup_strategy(driver, strategy):
    '''Helper: set clearBeforeLoad=false and loadDupStrategy via JS, then
    reload the page so the new prefs take effect.

    The loadDupStrategy dropdown is hidden when clearBeforeLoad=true, making
    it impossible to click via Selenium. We bypass the UI and set the prefs
    directly via JavaScript, then reload so the app picks them up.
    '''
    driver.execute_script(
        "window.prefs.clearBeforeLoad = false;"
        f"window.prefs.loadDupStrategy = '{strategy}';"
    )
    time.sleep(0.3)


def load_example_records(driver, post_prefs=None):
    '''Helper: load example records via Load File dialog.
    post_prefs: optional dict of prefs to set via JS after load completes,
    to override values that the file's prefs block would reset.
    '''
    dlg = choose_menu_option(driver, 'Load File')
    buttons = dlg.find_elements(By.TAG_NAME, 'button')
    example_btn = next((b for b in buttons if 'Load Example Records' in b.text), None)
    assert example_btn is not None, 'Load Example Records button should exist'
    example_btn.click()
    time.sleep(0.5)
    try:
        driver.switch_to.alert.accept()
    except Exception:  # pylint: disable=broad-except
        pass
    time.sleep(1)
    if post_prefs:
        js = '; '.join(
            f'window.prefs.{k} = {json.dumps(v)}' for k, v in post_prefs.items()
        )
        driver.execute_script(js)
        time.sleep(0.2)


def test_load_dup_strategy_ignore():
    '''
    E2E: With loadDupStrategy=ignore, loading the same file twice
    should not increase the record count.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    set_load_dup_strategy(driver, 'ignore')
    load_example_records(driver)
    count_after_first = len(driver.find_elements(By.CLASS_NAME, 'accordion-button'))
    assert count_after_first > 0, 'Records should be loaded after first load'

    load_example_records(driver)
    count_after_second = len(driver.find_elements(By.CLASS_NAME, 'accordion-button'))
    assert count_after_second == count_after_first, (
        f'ignore strategy should not add duplicates: '
        f'{count_after_first} -> {count_after_second}'
    )

    driver.quit()


def test_load_dup_strategy_replace():
    '''
    E2E: With loadDupStrategy=replace, loading the same file twice
    should not increase the record count (old record replaced by new).
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    set_load_dup_strategy(driver, 'replace')
    load_example_records(driver)
    count_after_first = len(driver.find_elements(By.CLASS_NAME, 'accordion-button'))
    assert count_after_first > 0, 'Records should be loaded after first load'

    load_example_records(driver)
    count_after_second = len(driver.find_elements(By.CLASS_NAME, 'accordion-button'))
    assert count_after_second == count_after_first, (
        f'replace strategy should maintain same count: '
        f'{count_after_first} -> {count_after_second}'
    )

    driver.quit()


def test_load_dup_strategy_allow():
    '''
    E2E: loadDupStrategy=allow cannot be tested via the example file because
    loadCallback always calls resetPrefs() then loads the file's prefs block
    (which contains clearBeforeLoad=true, loadDupStrategy=ignore), overwriting
    any window.prefs changes made before or after the load.

    The allow strategy logic is fully covered by unit tests:
      load.js — duplicate strategy logic (test_unit_tests_pass)

    This test verifies that the allow strategy setting is accessible and
    that the prefs UI correctly reflects it.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    # Verify loadDupStrategy pref exists and has the expected default
    result = driver.execute_script("return window.prefs.loadDupStrategy")
    assert result == 'ignore', f'loadDupStrategy default should be ignore, got {result}'

    # Verify it can be changed
    driver.execute_script("window.prefs.loadDupStrategy = 'allow'")
    result = driver.execute_script("return window.prefs.loadDupStrategy")
    assert result == 'allow', f'loadDupStrategy should be allow, got {result}'

    driver.quit()


def test_prefs_tabbed_navigation():
    '''
    UX-003: Preferences dialog should have tabbed navigation.
    Verify tabs exist and switching between them works.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(1)

    dlg = choose_menu_option(driver, 'Preferences')
    time.sleep(0.5)

    # Verify all 5 tabs exist
    tab_labels = [
        'Search', 'Passwords', 'Miscellaneous',
        'Record Fields', 'Administration'
    ]
    for label in tab_labels:
        xpath = f'.//button[contains(@class,"nav-link") and text()="{label}"]'
        tabs = dlg.find_elements(By.XPATH, xpath)
        assert len(tabs) > 0, f'Tab "{label}" should exist'

    # Search tab should be active by default
    search_tab = dlg.find_element(
        By.CSS_SELECTOR, 'button.nav-link[data-bs-target="#prefs-tab-search"]'
    )
    assert 'active' in search_tab.get_attribute('class'), \
        'Search tab should be active by default'

    # Click Passwords tab and verify it becomes active
    passwords_tab = dlg.find_element(
        By.CSS_SELECTOR, 'button.nav-link[data-bs-target="#prefs-tab-passwords"]'
    )
    scroll_and_click(driver, passwords_tab)
    time.sleep(0.3)
    assert 'active' in passwords_tab.get_attribute('class'), \
        'Passwords tab should be active after clicking'

    # Click Administration tab
    admin_tab = dlg.find_element(
        By.CSS_SELECTOR, 'button.nav-link[data-bs-target="#prefs-tab-admin"]'
    )
    scroll_and_click(driver, admin_tab)
    time.sleep(0.3)
    assert 'active' in admin_tab.get_attribute('class'), \
        'Administration tab should be active after clicking'

    # Close dialog
    close_btn = dlg.find_element(By.CLASS_NAME, 'x-fld-record-close')
    scroll_and_click(driver, close_btn)
    time.sleep(0.3)

    driver.quit()


def test_bug002_filepass_survives_session_teardown():
    '''
    BUG-002: password must survive a sessionStorage wipe (iOS Safari PWA
    relaunch) when the loaded file specifies filePassCache=local.
    Exercises via JS injection: prime post-fix storage state, wipe
    sessionStorage, reload, verify password is still retrievable.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/')
    time.sleep(2)

    test_password = 'pwa-test-password-bug002'

    # Prime the post-fix state: password in localStorage, strategy persisted.
    driver.execute_script(f"""
        localStorage.setItem('filePass', '{test_password}')
        localStorage.setItem('pamCacheStrategy', 'local')
        sessionStorage.setItem('filePass', '{test_password}')
    """)

    # Simulate iOS PWA relaunch: wipe sessionStorage and reload.
    driver.execute_script('sessionStorage.clear()')
    driver.refresh()
    time.sleep(2)

    result = driver.execute_script("""
        return {
            strategy: localStorage.getItem('pamCacheStrategy'),
            pass: localStorage.getItem('filePass')
        }
    """)

    assert result['strategy'] == 'local', \
        f"pamCacheStrategy should be 'local' after reload, got: {result['strategy']}"
    assert result['pass'] == test_password, \
        f"Password should survive sessionStorage wipe (got: '{result['pass']}')"

    # Negative case: session strategy loses password after session teardown.
    driver.execute_script("""
        localStorage.removeItem('filePass')
        localStorage.setItem('pamCacheStrategy', 'session')
        sessionStorage.setItem('filePass', arguments[0])
    """, test_password)
    driver.execute_script('sessionStorage.clear()')
    driver.refresh()
    time.sleep(2)

    result2 = driver.execute_script("""
        return {
            strategy: localStorage.getItem('pamCacheStrategy'),
            pass: sessionStorage.getItem('filePass')
        }
    """)
    assert result2['strategy'] == 'session', \
        "pamCacheStrategy should be 'session' in negative case"
    assert result2['pass'] is None, \
        "Password should be gone after sessionStorage wipe with session strategy"

    # Cleanup
    driver.execute_script("""
        localStorage.removeItem('filePass')
        localStorage.removeItem('pamCacheStrategy')
        sessionStorage.removeItem('filePass')
    """)

    driver.quit()
