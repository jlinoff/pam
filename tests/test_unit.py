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

        # Wait for async tests to complete — poll for window.__TEST_RESULTS__
        # with a generous timeout (crypt tests use SubtleCrypto, may take a few seconds)
        timeout = 30
        results = None
        for _ in range(timeout * 2):
            try:
                results = driver.execute_script('return window.__TEST_RESULTS__')
                if results and isinstance(results, dict):
                    # Also verify finalize() has been called after async tests
                    summary = driver.execute_script(
                        "return document.getElementById('x-summary').className"
                    )
                    if 'all-pass' in summary or 'has-fail' in summary:
                        # async tests have completed (finalize called twice — once
                        # after sync, once after async; second call is the final state)
                        # Wait a moment more to ensure the second finalize() ran
                        time.sleep(0.5)
                        results = driver.execute_script('return window.__TEST_RESULTS__')
                        break
            except Exception:  # pylint: disable=broad-except
                pass
            time.sleep(0.5)

        assert results is not None, f'Test results not found after {timeout}s — page may have failed to load: {URL}'

        passed = results.get('passed', 0)
        failed = results.get('failed', 0)
        total  = results.get('total', 0)

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
