'''
PAM unit test runner.
Loads tests/tests.html via ChromeDriver and asserts zero failures.
All test logic lives in tests/tests.html (vanilla JS, no npm dependencies).
'''
import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

PORT = os.getenv('PORT', '8081')
URL  = f'http://localhost:{PORT}/tests/tests.html'

# Use this when debugging interactively (NO_OPTIONS=1 make unit-test)
NO_OPTIONS = 'NO_OPTIONS' in os.environ

def get_driver():
    '''Get the webdriver for headless Chrome.'''
    if NO_OPTIONS:
        return webdriver.Chrome()  # pylint: disable=not-callable
    options = Options()
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-cache')
    options.add_argument('--disable-application-cache')
    options.add_argument('--disk-cache-size=0')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-extensions')
    options.add_argument('--disable-popup-blocking')
    options.add_argument('--log-level=3')
    options.add_argument('--silent')
    options.add_argument('--start-maximized')
    options.add_argument('--headless')
    driver = webdriver.Chrome(options=options)  # pylint: disable=not-callable
    driver.set_window_size(1920, 1080)
    return driver


def test_unit_tests_pass():
    '''
    Load tests/tests.html and assert that all unit tests pass.
    The page sets window.__TEST_RESULTS__ = {passed, failed, total}
    once all tests (including async crypt tests) have completed.
    '''
    driver = get_driver()
    try:
        driver.get(URL)

        # Wait for the page to signal that ALL tests — including the async
        # SubtleCrypto suites — have finished, via window.__TESTS_COMPLETE__.
        # This is an explicit done-flag rather than inferring completion from
        # the summary class, which finalize() sets after the sync tests too
        # (a race that could capture the sync-only snapshot). The timeout must
        # stay above the page's per-op failsafes (15s each) so those convert
        # into clean per-test failures before this layer gives up; ordering is
        # JS failsafe (15s) < this wait (90s) < the job timeout.
        timeout = 90
        results = None
        for _ in range(timeout * 2):
            try:
                done = driver.execute_script('return window.__TESTS_COMPLETE__ === true')
                if done:
                    results = driver.execute_script('return window.__TEST_RESULTS__')
                    break
            except Exception:  # pylint: disable=broad-except
                pass
            time.sleep(0.5)

        assert results is not None, (
            f'Tests did not complete within {timeout}s (window.__TESTS_COMPLETE__ '
            f'never became true) — the page may have failed to load or an async '
            f'runner hung: {URL}'
        )

        passed = results.get('passed', 0)
        failed = results.get('failed', 0)
        total  = results.get('total', 0)

        # The totals must account for every result rendered on the page.
        #
        # window.__TEST_RESULTS__ is written by finalize(), and for the whole
        # of v2.3.0 finalize() was called per-runner rather than once at the
        # end of the chain. Two suites ran after the last call: their results
        # appeared on the page and were absent from the totals, so a failure
        # in either would have been visible and still passed the build.
        # Trusting the summary without checking it against the lines is what
        # let that go unnoticed.
        rendered = driver.execute_script(
            'return {'
            '  pass: document.querySelectorAll(".test-line.pass").length,'
            '  fail: document.querySelectorAll(".test-line.fail").length'
            '}')
        shown = rendered['pass'] + rendered['fail']
        assert shown == total, (
            f'the summary reports {total} tests but the page shows {shown} '
            f"({rendered['pass']} passed, {rendered['fail']} failed). "
            'A suite is running after the last finalize(), so its results are '
            'displayed but not counted — and its failures would not fail this '
            'test.'
        )

        # Collect failure details for the pytest output
        if failed > 0:
            fail_lines = driver.execute_script('''
                return Array.from(document.querySelectorAll('.test-line.fail'))
                    .map(el => el.innerText)
            ''')
            detail = '\n'.join(fail_lines) if fail_lines else '(no detail available)'
            assert False, (
                f'{failed}/{total} unit tests failed:\n{detail}\n'
                f'Open {URL} in a browser to debug interactively.'
            )

        assert total > 0, 'No tests were found — check that tests/tests.html loaded correctly'

        # Print per-suite breakdown
        suites = driver.execute_script('''
            const out = []
            let current = null
            let count = 0
            document.querySelectorAll('h2, .test-line').forEach(el => {
                if (el.tagName === 'H2') {
                    if (current) out.push({suite: current, count})
                    current = el.textContent
                    count = 0
                } else {
                    count++
                }
            })
            if (current) out.push({suite: current, count})
            return out
        ''')
        print(f'\nUnit tests: {passed}/{total} passed')
        if suites:
            print()
            for s in suites:
                print(f'  {s["count"]:3d}  {s["suite"]}')
            print()

    finally:
        driver.quit()
