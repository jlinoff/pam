import inspect
import os
import time

# pause for a bit to let things settle
NOMINAL_SLEEP_TIME = 0.25
FINAL_TIMEOUT = float(os.getenv('FT', str(NOMINAL_SLEEP_TIME)))


def debug(msg: str, level: int = 1):
    '''
    Print a debug message so that it can be seen.
    '''
    lineno = inspect.stack()[level].lineno
    fname = os.path.basename(inspect.stack()[level].filename)
    print(f'\x1b[35mDEBUG:{fname}:{lineno}: {msg}\x1b[0m')


def ei(element, level: int=2, idx: int=-1):
    '''
    Report element information in debug mode.
    '''
    if not element:
        debug('# ================================================================', level)
        debug('# NULL', level)
        return
    if isinstance(element, list):
        debug('# ================================================================', level)
        debug(f'#LIST: {len(element)} items', level)
        for i, e in enumerate(element, start=1):
            ei(e, level+1, i)
        return
    debug('# ================================================================', level)
    if idx > 0:
        debug(f'# LIST[{idx}]')
    debug(f'element.tag_name:     {element.tag_name()}', level)
    debug(f'element.text:         {element.text()}', level)
    debug(f'element.is_selected:  {element.is_selected()}', level)
    debug(f'element.is_enabled:   {element.is_enabled()}', level)
    debug(f'element.children:     {element.children()}', level)
    debug(f'element.is_displayed: {element.is_displayed()}', level)
    debug(f'element.innerHTML:    {element.get_property("innerHTML")}', level)
    debug(f'dir: {dir(element)}')
    children = element.children()
    for i in range(len(children)):
        debug(f'element.children[{i}]:  {children[i].tag_name()}', level)
    attrs = element.get_property('attributes')
    for i in range(len(attrs)):
        attr = attrs[i]
        debug(f'element.attr[{i}]: {attr["name"]}: {attr["value"]}', level)

def preamble(py):
    '''
    preamble for all tests
    '''
    width = 1280
    height = 800
    debug('test_mystuff')
    debug(f'width: {width}')
    debug(f'height: {height}')
    debug(f'FINAL_TIMEOUT: {FINAL_TIMEOUT}')
    py.viewport(1280, 800)
    py.visit('http://localhost:8081')


def test_basic_menu_options(py):
    # https://docs.pylenium.io/pylenium-commands/viewport
    preamble(py)
    menu = py.get('#menu')
    menu.click()
    ei(menu)
    ul = menu.parent().get('.dropdown-menu')
    assert ul.tag_name() == 'ul'
    ei(ul)
    children = ul.children()
    #ei(children)
    assert isinstance(children, list)
    #  1 about
    #  2 prefs
    #  3 divider
    #  4 new record
    #  5 clear records
    #  6 divider
    #  7 load file
    #  8 save file
    #  9 divider
    # 10 help
    assert len(children) == 10

    # Menu option 1: About
    li = children[0]
    assert li.tag_name() == 'li'
    button = li.get('button')
    assert button.tag_name() == 'button'
    span = button.get('span')
    assert span.tag_name() == 'span'
    assert 'About' in  span.get_property('innerHTML')

    # Menu option 2: Preferences
    li = children[1]
    assert li.tag_name() == 'li'
    button = li.get('button')
    assert button.tag_name() == 'button'
    span = button.get('span')
    assert span.tag_name() == 'span'
    assert 'Preferences' in  span.get_property('innerHTML')

    # Menu option 3: New Record (after divider)
    li = children[3]
    assert li.tag_name() == 'li'
    button = li.get('button')
    assert button.tag_name() == 'button'
    span = button.get('span')
    assert span.tag_name() == 'span'
    assert 'New Record' in  span.get_property('innerHTML')

    # Menu option 4: Clear Records
    li = children[4]
    assert li.tag_name() == 'li'
    button = li.get('button')
    assert button.tag_name() == 'button'
    span = button.get('span')
    assert span.tag_name() == 'span'
    assert 'Clear Records' in  span.get_property('innerHTML')

    # Menu option 5: Load File  (after divider)
    li = children[6]
    assert li.tag_name() == 'li'
    button = li.get('button')
    assert button.tag_name() == 'button'
    span = button.get('span')
    assert span.tag_name() == 'span'
    assert 'Load File' in  span.get_property('innerHTML')

    # Menu option 6: Save File
    li = children[7]
    assert li.tag_name() == 'li'
    button = li.get('button')
    assert button.tag_name() == 'button'
    span = button.get('span')
    assert span.tag_name() == 'span'
    assert 'Save File' in  span.get_property('innerHTML')


def test_about(py):
    preamble(py)
    # Now check the About modal dialogue
    menu = py.get('#menu')
    menu.click()
    time.sleep(NOMINAL_SLEEP_TIME)

    children = menu.parent().get('.dropdown-menu').children()
    about_button = py.get('[data-bs-target="#menuAboutDlg"]')
    ei(about_button)
    assert about_button
    assert about_button.tag_name() == 'button'
    assert 'About' in about_button.get_property('innerHTML')
    about_button.click() # click the menu button to popup the dialogue
    time.sleep(NOMINAL_SLEEP_TIME)

    about_dlg = py.get('[aria-labelledby="menuAboutDlgLabel"]')
    assert about_dlg.tag_name() == 'div'
    ei(about_dlg)
    close_button = about_dlg.get('.x-fld-record-close')
    ei(close_button)
    assert close_button
    assert close_button.tag_name() == 'button'
    assert 'Close' in close_button.get_property('innerHTML')
    close_button.click()
    time.sleep(NOMINAL_SLEEP_TIME)


def test_prefs(py):
    preamble(py)
    # Check the Preferences modal dialogue
    menu = py.get('#menu')
    menu.click()
    time.sleep(NOMINAL_SLEEP_TIME)

    prefs_button = py.get('[data-bs-target="#menuPrefsDlg"]')
    ei(prefs_button)
    assert prefs_button
    assert prefs_button.tag_name() == 'button'
    assert 'Preferences' in prefs_button.get_property('innerHTML')
    prefs_button.click() # click the menu button to popup the dialogue
    time.sleep(NOMINAL_SLEEP_TIME)

    prefs_dlg = py.get('[aria-labelledby="menuPrefsDlgLabel"]')
    ei(prefs_dlg)
    assert prefs_dlg.tag_name() == 'div'
    buttons = prefs_dlg.find('button')
    assert len(buttons) == 45  # 1 close button plus the buttons for the field delete/edit/add
    close_button = None
    for button in buttons:
        if 'Close' in button.get_property('innerHTML'):
            assert close_button == None
            close_button = button
    assert close_button
    assert close_button.tag_name() == 'button'
    assert 'Close' in close_button.get_property('innerHTML')
    time.sleep(NOMINAL_SLEEP_TIME)
    close_button.click()
    time.sleep(FINAL_TIMEOUT)

def test_record_create(py):
    preamble(py)
    py.get('#menu').click()
    dropdown = py.get('#menu').parent().get('.dropdown-menu')
    button = dropdown.get('[data-bs-target="#menuNewDlg"]')
    ei(button)
    assert button.is_displayed() == True
    assert button.tag_name() == 'button'

    # random check
    children = dropdown.find('li')
    assert len(children) == 9
    span = button.get('span')
    ei(span)
    assert span.tag_name() == 'span'
    ei(button)
    assert 'New Record' in span.get_property('innerHTML')
    assert button.is_displayed() == True
    button.click() # select "New Record"

    # The menu option was clicked() now get the dialogue that popped up.
    dlg = py.get('#menuNewDlg')
    assert dlg.tag_name() == 'div'
    ei(dlg)
    title = dlg.get('.x-record-title')
    time.sleep(NOMINAL_SLEEP_TIME) # avoid selenium.common.exceptions.ElementNotInteractableException

    # Create the record title
    assert title.tag_name() == 'input'
    title.click()
    time.sleep(NOMINAL_SLEEP_TIME)
    title.type('test text field delete')
    time.sleep(NOMINAL_SLEEP_TIME)

    # Close the dialogue
    fld_type_button = dlg.get('#x-new-field-type')
    assert fld_type_button.tag_name() == 'button'
    close_button = dlg.get('.x-fld-record-close')
    assert close_button.tag_name() == 'button'


def test_new_record_delete(py):
    preamble(py)
    # Check the New Record modal dialogue field delete operation
    py.get('#menu').click()
    dropdown = py.get('#menu').parent().get('.dropdown-menu')
    button = dropdown.get('[data-bs-target="#menuNewDlg"]')
    ei(button)
    assert button.is_displayed() == True
    assert button.tag_name() == 'button'
    span = button.get('span')
    ei(span)
    assert span
    assert span.tag_name() == 'span'
    assert 'New Record' in span.get_property('innerHTML')
    button.click() # select "New Record"

    # The menu option was clicked() now get the dialogue that popped up.
    dlg = py.get('#menuNewDlg')
    assert dlg.tag_name() == 'div'
    ei(dlg)
    title = dlg.get('.x-record-title')
    time.sleep(NOMINAL_SLEEP_TIME) # avoid selenium.common.exceptions.ElementNotInteractableException

    # Set the record title
    assert title.tag_name() == 'input'
    title.click()
    time.sleep(NOMINAL_SLEEP_TIME)
    title.type('test text field delete')
    time.sleep(NOMINAL_SLEEP_TIME)

    # Close the dialogue
    fld_type_button = dlg.get('#x-new-field-type')
    assert fld_type_button.tag_name() == 'button'
    close_button = dlg.get('.x-fld-record-close')
    assert close_button.tag_name() == 'button'

    # select the text field menu item
    # this is tricky because it is NOT a select element.
    # One needs to search the associate dropdown-item list
    # to find the correct element.
    dlg = py.get('#menuNewDlg')
    fld_type_button.click() # drop down menu.
    time.sleep(NOMINAL_SLEEP_TIME)
    fld_type_button = dlg.get('#x-new-field-type')
    items = fld_type_button.parent().find('.dropdown-item')
    ei(items)
    # there are 16 menu items as defined in www/js/prefs.py
    assert len(items) == 17
    text = None
    for item in items:
        value = item.get_attribute('value')
        if value == 'text':
            text = item
            break
    assert text is not None  # fails if the "text" entry is not found
    text.click()
    time.sleep(NOMINAL_SLEEP_TIME)

    # Deal with the field form.
    dlg = py.get('#menuNewDlg')
    form = dlg.get('.x-fld-form')

    # Delete the entire field (as opposed to the delete name, delete value buttons)
    delete_button = form.get('.bi-trash3-fill').parent()
    assert delete_button
    assert delete_button.tag_name() == 'button'
    ei(delete_button)
    delete_button.click()
    time.sleep(NOMINAL_SLEEP_TIME)

    dlg = py.get('#menuNewDlg')
    assert len(dlg.find('.x-fld-form', 1)) == 0  # make sure the whole thing is gone!
    assert len(dlg.find('.x-record-title', 1)) == 1  # record title should still be there
    assert len(dlg.find('.x-fld-name', 1)) == 0
    assert len(dlg.find('.x-fld-value', 1)) == 0
    assert len(dlg.find('.x-fld-value-div', 1)) == 0


def test_create_simple_record_with_fields(py):
    preamble(py)
    # Check the New Record modal dialogue field delete operation
    py.get('#menu').click()
    dropdown = py.get('#menu').parent().get('.dropdown-menu')
    button = dropdown.get('[data-bs-target="#menuNewDlg"]')
    ei(button)
    assert button.is_displayed() == True
    assert button.tag_name() == 'button'
    span = button.get('span')
    ei(span)
    assert span
    assert span.tag_name() == 'span'
    assert 'New Record' in span.get_property('innerHTML')
    button.click() # select "New Record"

    # The menu option was clicked() now get the dialogue that popped up.
    dlg = py.get('#menuNewDlg')
    assert dlg.tag_name() == 'div'
    ei(dlg)
    record_title_input = dlg.get('.x-record-title')
    time.sleep(NOMINAL_SLEEP_TIME) # avoid selenium.common.exceptions.ElementNotInteractableException
    assert record_title_input
    assert record_title_input.tag_name() == 'input'
    assert record_title_input.is_enabled()
    assert record_title_input.should().be_visible()

    # Set the record title
    title_string = 'test text record create'
    record_title_input.click()
    time.sleep(NOMINAL_SLEEP_TIME)
    record_title_input.type(title_string)
    time.sleep(NOMINAL_SLEEP_TIME)
    record_title_input.should().have_value(title_string)

    # Add a text field.
    # this is tricky because it is NOT a select element.
    # One needs to search the associate dropdown-item list
    # to find the correct element.
    dlg = py.get('#menuNewDlg')
    fld_type_button = dlg.get('#x-new-field-type')
    assert fld_type_button
    assert fld_type_button.tag_name() == 'button'
    fld_type_button.click() # drop down menu.
    time.sleep(NOMINAL_SLEEP_TIME)
    items = fld_type_button.parent().find('.dropdown-item')
    ei(items)

    text = None
    for item in items:
        value = item.get_attribute('value')
        if value == 'text':
            text = item
            break
    assert text is not None  # fails if the "text" entry is not found
    assert text.tag_name() == 'a'
    text.click()
    time.sleep(NOMINAL_SLEEP_TIME)

    # add field 1 value
    dlg_body = dlg.get('.modal-body')
    assert dlg_body
    assert dlg_body.tag_name() == 'div'
    
    # the container contains all of the record fields
    container = dlg_body.get('.container')
    assert container
    assert container.tag_name() == 'div'
    field1_value = container.get('.x-fld-value')
    assert field1_value
    assert field1_value.tag_name() == 'input'
    assert field1_value.get_property('type') == 'text'
    field1_value.click()
    time.sleep(NOMINAL_SLEEP_TIME)
    field1_value.type('field 1')
    time.sleep(NOMINAL_SLEEP_TIME)

    # save it
    footer = dlg.get('.modal-footer')
    assert footer
    assert footer.tag_name() == 'div'

    # save button
    save_button = footer.get('.x-fld-record-save')
    ei(save_button)
    assert save_button
    assert save_button.tag_name() == 'button'
    save_button.click()
    time.sleep(NOMINAL_SLEEP_TIME)
    #time.sleep(FINAL_TIMEOUT)
