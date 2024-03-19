'''
PAM pytest module.
'''
import os
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

# Use this when testing interactively or debugging (NO_OPTIONS=1).
#NO_OPTIONS = False if not os.getenv('NO_OPTIONS') else True
NO_OPTIONS = 'NO_OPTIONS' in os.environ

def get_driver():
    '''
    Get the webdriver and set the options for headless mode.
    '''
    # https://stackoverflow.com/questions/53657215/running-selenium-with-headless-chrome-webdriver
    if NO_OPTIONS:
        return webdriver.Chrome()
    options = Options()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--log-level=3")
    options.add_argument("--silent")
    options.add_argument("--headless")
    return webdriver.Chrome(options=options)


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
    assert len(buttons) == 2
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
    assert len(menu_items) == 8
    for menu_item in menu_items:
        if option in menu_item.text:
            menu_item.click()
            break
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
    assert len(menu_items) == 8
    assert 'About' in menu_items[0].text
    assert 'Preferences' in menu_items[1].text
    assert 'New Record' in menu_items[2].text
    assert 'Clear Records' in menu_items[3].text
    assert 'Load File' in menu_items[4].text
    assert 'Save File' in menu_items[5].text
    assert 'Help' in menu_items[7].text # 6 is reserved for Print

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
    time.sleep(2)
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
    assert len(records) == 7
    assert 'Amazon' in records[0].text

    # All done
    time.sleep(1)
    driver.quit()
