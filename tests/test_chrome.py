import os
import time

from selenium import webdriver
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

WEBDRIVER = os.getenv('WEBDRIVER', '/usr/bin/chromedriver')

def get_driver():
    # https://stackoverflow.com/questions/53657215/running-selenium-with-headless-chrome-webdriver
    options = Options()
    options.add_argument("--no-sandbox");
    options.add_argument("--disable-dev-shm-usage");
    #options.add_argument("--disable-renderer-backgrounding");
    #options.add_argument("--disable-background-timer-throttling");
    #options.add_argument("--disable-backgrounding-occluded-windows");
    #options.add_argument("--disable-client-side-phishing-detection");
    #options.add_argument("--disable-crash-reporter");
    #options.add_argument("--disable-oopr-debug-crash-dump");
    #options.add_argument("--no-crash-upload");
    options.add_argument("--disable-gpu");
    options.add_argument("--disable-extensions");
    #options.add_argument("--disable-low-res-tiling");
    options.add_argument("--log-level=3");
    options.add_argument("--silent");
    options.add_argument("--headless");
    #options.binary_location = WEBDRIVER  # this fails!
    driver = webdriver.Chrome(options=options)
    return driver
    #return webdriver.Chrome()


def get_parent(element):
    return element.find_element(By.XPATH, './..')


def get_children(element) -> list:
    return element.find_elements(By.XPATH, './child::*')


def toggle_dark_light_mode(driver):
    footer = driver.find_element(By.TAG_NAME, 'footer')
    buttons = footer.find_elements(By.TAG_NAME, 'button')
    assert len(buttons) == 2
    if buttons[0].is_displayed():
        assert buttons[1].is_displayed() == False
        buttons[0].click()
    elif buttons[1].is_displayed():
        assert buttons[0].is_displayed() == False
        buttons[1].click()


def set_theme(driver, requested_theme):
    assert requested_theme in ['dark', 'light']
    body = driver.find_element(By.TAG_NAME, 'body')
    current_theme = body.get_attribute('data-bs-theme')
    if current_theme == requested_theme:
        return  # theme is already the current theme
    toggle_dark_light_mode(driver)


# https://www.selenium.dev/documentation/webdriver/getting_started/first_script/
def test_basic_setup():
    '''Verify that chrome works in selenium.
    '''
    driver = get_driver()
    driver.get('https://www.google.com/');
    time.sleep(2) # Let the user actually see something!
    search_box = driver.find_element(By.NAME, 'q')
    search_box.send_keys('ChromeDriver')
    search_box.submit()
    time.sleep(2) # Let the user actually see something!
    driver.quit()


def test_pam_setup():
    '''Verify that chrome works in selenium for PAM on port 8081.
    '''
    driver = get_driver()
    driver.get('http://localhost:8081/');
    time.sleep(2) # Let the user actually see something!
    menu = driver.find_element(By.ID, 'menu')
    assert menu
    menu.click()
    time.sleep(1)
    ##breakpoint()
    dropdown = get_parent(menu)
    assert dropdown
    assert 'About' in dropdown.text
    assert dropdown.tag_name == 'div'
    children = get_children(dropdown)
    assert children
    assert len(children) == 2
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    print(len(menu_items))
    assert len(menu_items) == 8
    assert 'About' in menu_items[0].text
    assert 'Preferences' in menu_items[1].text
    assert 'New Record' in menu_items[2].text
    assert 'Clear Records' in menu_items[3].text
    assert 'Load File' in menu_items[4].text
    assert 'Save File' in menu_items[5].text
    assert 'Help' in menu_items[6].text
    assert menu_items[7].text.strip() == ''

    # About dialog
    menu_items[0].click()  # About
    time.sleep(1)
    about = driver.find_element(By.ID, 'menuAboutDlg')
    assert about is not None
    buttons = about.find_elements(By.TAG_NAME, 'button')
    assert len(buttons) == 1
    assert 'Close' in buttons[0].text
    buttons[0].click()
    time.sleep(2) # Let the user actually see something!

    # Preferences dialog
    menu = driver.find_element(By.ID, 'menu')
    menu.click()
    time.sleep(1)
    dropdown = get_parent(menu)
    children = get_children(dropdown)
    assert len(children) == 2
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    assert len(menu_items) == 8
    assert 'Preferences' in menu_items[1].text
    menu_items[1].click()  # Preferences
    time.sleep(1)
    prefs = driver.find_element(By.ID, 'menuPrefsDlg')
    assert prefs is not None
    close_button = prefs.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(2)
    close_button.click()

    # New Record
    set_theme(driver, 'light')
    time.sleep(2)
    menu = driver.find_element(By.ID, 'menu')
    menu.click()
    time.sleep(1)
    dropdown = get_parent(menu)
    children = get_children(dropdown)
    assert len(children) == 2
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    assert len(menu_items) == 8
    assert 'New Record' in menu_items[2].text
    menu_items[2].click()  # Preferences
    time.sleep(1)
    new_rec = driver.find_element(By.ID, 'menuNewDlg')
    assert new_rec is not None
    save_button = new_rec.find_element(By.CLASS_NAME, 'x-fld-record-save')
    assert 'Save' in save_button.text
    close_button = new_rec.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(2)
    close_button.click()

    # Clear Records
    set_theme(driver, 'dark')
    time.sleep(2)
    menu = driver.find_element(By.ID, 'menu')
    menu.click()
    time.sleep(1)
    dropdown = get_parent(menu)
    children = get_children(dropdown)
    assert len(children) == 2
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    assert len(menu_items) == 8
    assert 'Clear Records' in menu_items[3].text
    menu_items[3].click()  # Preferences
    time.sleep(1)
    clr_recs = driver.find_element(By.ID, 'menuClearDlg')
    assert clr_recs is not None
    clear_button = clr_recs.find_element(By.CLASS_NAME, 'x-fld-record-clear')
    assert 'Clear' in clear_button.text
    close_button = clr_recs.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(2)
    close_button.click()

    # Load File
    set_theme(driver, 'dark')
    time.sleep(2)
    menu = driver.find_element(By.ID, 'menu')
    menu.click()
    time.sleep(1)
    dropdown = get_parent(menu)
    children = get_children(dropdown)
    assert len(children) == 2
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    assert len(menu_items) == 8
    assert 'Load File' in menu_items[4].text
    menu_items[4].click()  # Preferences
    time.sleep(1)
    load_file = driver.find_element(By.ID, 'menuLoadDlg')
    assert load_file is not None
    load_button = load_file.find_element(By.CLASS_NAME, 'x-fld-record-load')
    assert 'Load' in load_button.text
    close_button = load_file.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(2)
    close_button.click()

    # Save File
    set_theme(driver, 'dark')
    time.sleep(2)
    menu = driver.find_element(By.ID, 'menu')
    menu.click()
    time.sleep(1)
    dropdown = get_parent(menu)
    children = get_children(dropdown)
    assert len(children) == 2
    menu_items = children[1].find_elements(By.CLASS_NAME, 'dropdown-item')
    assert len(menu_items) == 8
    assert 'Save File' in menu_items[5].text
    menu_items[5].click()  # Preferences
    time.sleep(1)
    save_file = driver.find_element(By.ID, 'menuSaveDlg')
    assert save_file is not None
    save_button = save_file.find_element(By.CLASS_NAME, 'x-fld-record-save')
    assert 'Save' in save_button.text
    close_button = save_file.find_element(By.CLASS_NAME, 'x-fld-record-close')
    assert 'Close' in close_button.text
    time.sleep(2)
    close_button.click()

    # toggle dark/light mode
    time.sleep(2)
    set_theme(driver, 'light')
    time.sleep(2)
    set_theme(driver, 'dark')
    time.sleep(2)

    # all done!
    driver.quit()
