#!/usr/bin/env python3
'''
Localise churn in a single screenshot.

Captures one shot several times and reports where the images differ, as a
bounding box and a row profile. That says whether the variation is in the
title area, the field body, the buttons or the scrollbar — which is the thing
worth knowing before changing anything.

Written because pam-new-record-field-1.png churned intermittently across
several runs and two separate guesses at the cause (a blinking caret, then
field scroll position) both turned out to be wrong. Guessing a third time is
worse than measuring once.

    pipenv run python3 tests/diag_churn.py pam-new-record-field-1.png
    pipenv run python3 tests/diag_churn.py pam-new-record-field-1.png 5

Needs the server on 8081, the same as make screenshots. Delete this file once
the answer is known.
'''

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageChops  # pylint: disable=wrong-import-position
from test_chrome import get_driver  # pylint: disable=wrong-import-position
import screenshots as shots  # pylint: disable=wrong-import-position


def capture_once(driver, entry, path):
    '''Run one shot the way main() does and write the PNG.'''
    filename, func, window = entry
    fit = window[1] == shots.FIT
    if window == shots.IPHONE:
        shots.set_device_metrics(driver, *shots.IPHONE, scale=shots.IPHONE_SCALE)
    else:
        shots.clear_device_metrics(driver)
        shots.set_viewport_size(
            driver, window[0], shots.NARROW[1] if fit else window[1])

    element = func(driver)
    if fit:
        shots.fit_viewport_to_content(driver, shots.NARROW[0], shots.NARROW[1])
    with open(path, 'wb') as handle:
        handle.write(element.screenshot_as_png)
    return filename


def describe(first, second):
    '''Report where two captures differ.'''
    one = Image.open(first).convert('RGB')
    two = Image.open(second).convert('RGB')
    if one.size != two.size:
        print(f'    sizes differ: {one.size} vs {two.size}')
        return

    diff = ImageChops.difference(one, two)
    box = diff.getbbox()
    if box is None:
        print('    identical')
        return

    left, top, right, bottom = box
    print(f'    differ in a {right - left}x{bottom - top} region '
          f'at ({left}, {top}) of a {one.size[0]}x{one.size[1]} image')

    # A row profile localises it better than a box when the change is a thin
    # band — a caret, a scrollbar thumb, a single line of text.
    rows = []
    pixels = diff.load()
    for y in range(top, bottom):
        count = sum(1 for x in range(left, right) if pixels[x, y] != (0, 0, 0))
        if count:
            rows.append((y, count))
    print(f'    {len(rows)} differing rows, '
          f'y={rows[0][0]}..{rows[-1][0]}, '
          f'widest {max(c for _, c in rows)}px')


def main():
    '''Capture one shot repeatedly and compare consecutive pairs.'''
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    wanted = sys.argv[1]
    rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    entry = next((e for e in shots.SHOTS if e[0] == wanted), None)
    if entry is None:
        names = ', '.join(sorted(name for name, _, _ in shots.SHOTS))
        print(f'{wanted!r} is not a shot.\nAvailable: {names}')
        return 1

    driver = get_driver()
    paths = []
    try:
        driver.get(shots.URL)
        shots.wait_for_page(driver)
        shots.load_examples(driver)
        shots.set_theme(driver, 'dark')

        for index in range(rounds):
            path = f'/tmp/churn-{index}.png'
            capture_once(driver, entry, path)
            paths.append(path)
            print(f'  captured {path}')
            shots.reset_between_shots(driver)
    finally:
        driver.quit()

    print()
    for index in range(1, len(paths)):
        print(f'  run {index} vs run {index + 1}:')
        describe(paths[index - 1], paths[index])
    return 0


if __name__ == '__main__':
    sys.exit(main())
