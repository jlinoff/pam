#!/usr/bin/env python3
'''
Check the README's screenshots and internal links.

This is a FILENAME check, not a rendering check. It compares three sets:

  - images referenced by README.md
  - images captured by tests/screenshots.py
  - images on the HAND_MADE list below
  - files actually present in www/help/

and reports anything that does not line up. It needs no browser, no server
and no rendering, so unlike `make screenshots-check` its result does not
depend on which machine runs it.

That distinction matters. Byte-comparing screenshots only means something on
the one machine that regenerates them: font hinting, DPI and the Chrome
version all affect the bytes, so anywhere else every image reads as stale.
A gate that fires spuriously gets bypassed. This check has no such problem
and is safe to run in CI or as a release prerequisite.

It also verifies that every in-page link — the `](#anchor)` form — matches a
heading. Broken anchors are invisible in a Markdown preview and in the
rendered help page: the link just silently does nothing when clicked. Nine
were found the first time this ran, two of them introduced by a section that
had been written but not yet added.

WHAT IT CATCHES
---------------
Every one of these has actually happened while building the harness:

  - an image referenced by the README but no longer captured by any shot
  - an image captured but never referenced, which is usually a documentation
    gap rather than a stale file
  - two filenames holding the same picture
  - a referenced file that is not on disk at all

Exit status is 0 when everything lines up, 1 otherwise.
'''

import difflib
import hashlib
import os
import re
import sys
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HELP = os.path.join(ROOT, 'www', 'help')

# Images that cannot be scripted and are maintained by hand, each with the
# reason. Anything here is exempt from the "referenced but not captured" check,
# and the reasons are printed by the report so you do not have to open this
# file to find out which images are hand-made or why.
#
# Keep this list short and justified. An entry is a standing commitment to
# re-make that image by hand whenever the UI changes, which is the cost the
# rest of the harness exists to avoid. Nothing here is decided automatically —
# whether an image *must* be hand-made is a judgement, and the tool only
# reports what has been claimed.
HAND_MADE = {
    'pam-file-flow-screenshot.png':
        'a hand-drawn conceptual diagram of how PAM files move between '
        'devices; it illustrates architecture rather than UI state, so it '
        'does not go stale when the interface changes',

    'pam-new-record-drag.png':
        "a record field mid-drag; Selenium's drag-and-drop against HTML5 "
        'sortables is unreliable and photographing a gesture part-way '
        'through is worse — the useful moment lasts a few hundred '
        'milliseconds and depends on where the pointer happens to be',
}


def referenced_images(readme_path):
    '''Every www/help/pam-*.png referenced by the README.'''
    with open(readme_path, encoding='utf-8') as handle:
        text = handle.read()
    return set(re.findall(r'www/help/(pam-[^"\')\s]+\.png)', text))


def captured_images(shots_path):
    '''Every filename in the SHOTS table of screenshots.py.'''
    with open(shots_path, encoding='utf-8') as handle:
        text = handle.read()
    start = text.index('SHOTS = [')
    end = text.index(']', start)
    return set(re.findall(r"\('(pam-[^']+\.png)'", text[start:end]))


def present_images(help_dir):
    '''Every pam-*.png actually on disk.'''
    return {name for name in os.listdir(help_dir)
            if name.startswith('pam-') and name.endswith('.png')}


def duplicate_images(help_dir, names):
    '''Groups of files with identical bytes — two names for one picture.'''
    by_digest = {}
    for name in sorted(names):
        path = os.path.join(help_dir, name)
        if not os.path.exists(path):
            continue
        with open(path, 'rb') as handle:
            # hashlib rather than hash(): the builtin is salted per process,
            # so it groups correctly within one run but means nothing across
            # runs or in a printed diagnostic.
            digest = hashlib.sha256(handle.read()).hexdigest()
        by_digest.setdefault(digest, []).append(name)
    return [group for group in by_digest.values() if len(group) > 1]


def heading_anchors(text):
    """The set of anchors GitHub generates for a document's headings.

    Slug rules: lowercase, drop HTML tags and Markdown emphasis, drop
    punctuation other than hyphens, collapse whitespace to single hyphens.
    Repeated headings get a numeric suffix, so a second "Notes" is `notes-1`.
    """
    counts, anchors = {}, set()
    for line in text.splitlines():
        if not re.match(r'^#{1,6}\s', line):
            continue
        title = re.sub(r'^#{1,6}\s+', '', line)
        slug = re.sub(r'<[^>]+>', '', title.strip().lower())
        slug = re.sub(r'[`*_]', '', slug)
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'\s+', '-', slug).strip('-')
        seen = counts.get(slug, 0)
        counts[slug] = seen + 1
        anchors.add(slug if seen == 0 else f'{slug}-{seen}')
    return anchors


def broken_links(text):
    """In-page links whose anchor matches no heading.

    Returns a list of (anchor, use count, closest real anchor), so the report
    suggests a fix rather than only naming the problem.
    """
    anchors = heading_anchors(text)
    links = re.findall(r'\]\(#([^)]+)\)', text)
    out = []
    for anchor in sorted(set(links)):
        if anchor in anchors:
            continue
        near = difflib.get_close_matches(anchor.lower(), sorted(anchors), n=1, cutoff=0.4)
        out.append((anchor, links.count(anchor), near[0] if near else None))
    return out


def missing_image_files(readme_path):
    """Every www/ image the README references that is not on disk.

    check-images tracks the pam-*.png captures, which are the ones that go
    stale. But the README also embeds icons from www/icons/, and a reference to
    one that does not exist is a broken image in the rendered help page that
    nothing else would catch — it is not a screenshot, so the capture check
    ignores it. Nearly shipped exactly that with shield-check.svg.
    """
    with open(readme_path, encoding='utf-8') as handle:
        text = handle.read()
    refs = set(re.findall(r'src="(www/[^"]+)"', text))
    return sorted(ref for ref in refs
                  if not os.path.exists(os.path.join(ROOT, ref)))


def print_hand_made():
    """List the hand-made images and why each one is not scripted."""
    if not HAND_MADE:
        return
    print('\nMAINTAINED BY HAND')
    print('  Not regenerated by make screenshots. Re-make these yourself when '
          'the UI changes.')
    for name in sorted(HAND_MADE):
        print(f'    {name}')
        for line in textwrap.wrap(HAND_MADE[name], width=68):
            print(f'        {line}')


def report_broken_links(readme_path):
    """Print any broken in-page links. Returns how many were found."""
    with open(readme_path, encoding='utf-8') as handle:
        text = handle.read()
    links = broken_links(text)
    if not links:
        return 0
    print('\nBROKEN INTERNAL LINKS')
    print('  These point at no heading. A broken anchor is invisible in a '
          'preview —\n  the link simply does nothing when clicked.')
    for anchor, count, near in links:
        suggestion = f'  -> did you mean #{near}?' if near else ''
        uses = '' if count == 1 else f' (used {count}x)'
        print(f'    #{anchor}{uses}{suggestion}')
    return len(links)


def count_links(readme_path):
    """How many distinct in-page links the document has."""
    with open(readme_path, encoding='utf-8') as handle:
        return len(set(re.findall(r'\]\(#([^)]+)\)', handle.read())))


def report(label, items, explanation):
    '''Print one problem group. Returns the number of items.'''
    if not items:
        return 0
    print(f'\n{label}')
    print(f'  {explanation}')
    for item in sorted(items):
        print(f'    {item}')
    return len(items)


def main():
    '''Compare the sets and report. Returns the process exit status.'''
    readme = os.path.join(ROOT, 'README.md')
    shots = os.path.join(HERE, 'screenshots.py')

    referenced = referenced_images(readme)
    captured = captured_images(shots)
    present = present_images(HELP)

    problems = 0

    problems += report(
        'REFERENCED BUT NOT CAPTURED',
        referenced - captured - set(HAND_MADE),
        'The README uses these but no shot regenerates them. Either add a '
        'shot or add them to HAND_MADE with a reason.')

    problems += report(
        'CAPTURED BUT NOT REFERENCED',
        captured - referenced,
        'These are regenerated but no README section shows them. Usually a '
        'documentation gap rather than a stale image.')

    problems += report(
        'REFERENCED BUT MISSING FROM DISK',
        referenced - present,
        'The README points at files that do not exist. These render as broken '
        'images in the help page.')

    problems += report(
        'ON DISK BUT NEITHER REFERENCED NOR CAPTURED',
        present - referenced - captured,
        'Orphans. Safe to git rm unless something outside the README uses '
        'them.')

    problems += report(
        'HAND_MADE ENTRIES THAT ARE ALSO CAPTURED',
        set(HAND_MADE) & captured,
        'These claim to be hand-made but a shot regenerates them. Remove them '
        'from HAND_MADE.')

    for group in duplicate_images(HELP, present):
        problems += report(
            'IDENTICAL FILES',
            group,
            'These files have the same bytes: one picture under several names. '
            'Pick one and update the README references.')

    problems += report_broken_links(readme)

    missing = missing_image_files(readme)
    if missing:
        print('\nREFERENCED IMAGE FILES THAT DO NOT EXIST')
        print('  The README embeds these but they are not on disk. They render '
              'as broken\n  images in the help page.')
        for ref in missing:
            print(f'    {ref}')
        problems += len(missing)

    if problems:
        print(f'\n{problems} problem(s)')
        print_hand_made()
        return 1

    print(f'{len(referenced)} referenced, {len(captured)} captured, '
          f'{len(HAND_MADE)} hand-made: all accounted for')
    print(f'{count_links(readme)} internal links: all resolve')
    with open(readme, encoding='utf-8') as handle:
        refs = len(set(re.findall(r'src="(www/[^"]+)"', handle.read())))
    print(f'{refs} image references: all present')
    print_hand_made()
    return 0


if __name__ == '__main__':
    sys.exit(main())
