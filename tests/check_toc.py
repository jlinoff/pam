#!/usr/bin/env python3
'''
Verify the README table of contents against the document's actual headings.

This exists because check_images.py cannot catch the problem it was written
for. That tool verifies every link RESOLVES, and a link to the wrong section
resolves perfectly well. In v2.5.0 the preferences block had drifted badly and
every link in it was valid:

  - nine Administration preferences were missing from the TOC entirely,
    including the three security-relevant ones (Allow HTML Field Rendering,
    Search Password Field Values, Enable Password Breach Check)
  - three more were listed under Miscellaneous but live under Administration
  - the Administration Preferences heading itself had no entry, though all
    five sibling sections did
  - Search Record Field Names appeared twice
  - Hide Inactive Records was filed under Search Preferences

The question this asks is structural: does the TOC reflect the document's
hierarchy? It reports four kinds of disagreement.

  1. MISSING     - a heading nothing in the TOC points at
  2. WRONG PARENT- listed, but nested under a section it does not belong to
  3. DUPLICATE   - the same target listed more than once
  4. STALE       - a TOC entry whose heading no longer exists

Anchors follow GitHub's rules, including the -1, -2 suffixes for repeated
heading text. PAM has two "Hide Inactive Records" headings, so the second is
#hide-inactive-records-1; a checker that ignored that would report a false
positive on every run and be turned off within a week.

Exit status is 0 when the TOC agrees with the document, 1 otherwise.
'''

import re
import sys

README = 'README.md'

# The TOC covers the document down to this depth. Deeper headings are section
# detail, not navigation, and listing them would make the TOC unreadable.
MAX_TOC_DEPTH = 4

# Sections whose children are deliberately not enumerated. These are prose
# subsections rather than reference material: a reader arrives at the parent
# and reads down. Listing them adds noise without adding navigation.
#
# Keep this short. Every entry is a place the checker has been told to look
# away, and the whole point of the tool is that looking away is how the
# preferences block drifted.
UNLISTED_CHILDREN_OK = {
    'Breached Passwords',
    'Reused Passwords',
    'File Integrity Check',
    'Vault Fingerprint',
}


def slug(text):
    '''Convert heading text to a GitHub anchor.'''
    out = re.sub(r'<[^>]+>', '', text.strip().lower())
    out = re.sub(r'[`*_]', '', out)
    out = re.sub(r'[^\w\s-]', '', out)
    return re.sub(r'\s+', '-', out).strip('-')


def read_headings(lines):
    '''Every heading, with its level, text and GitHub anchor.

    Skips fenced code blocks: a shell comment starting with # inside a fence
    is not a heading, and treating it as one produces phantom entries.
    '''
    headings = []
    counts = {}
    in_fence = False
    for number, line in enumerate(lines, start=1):
        if line.startswith('```'):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = re.match(r'^(#{1,6}) (.+)$', line)
        if not match:
            continue
        level = len(match.group(1))
        text = match.group(2).strip()
        base = slug(text)
        seen = counts.get(base, 0)
        counts[base] = seen + 1
        anchor = base if seen == 0 else f'{base}-{seen}'
        headings.append({'line': number, 'level': level,
                         'text': text, 'anchor': anchor})
    return headings


def read_toc(lines):
    '''The TOC entries, with the indent depth each was written at.

    The TOC is the leading run of bulleted links. It ends at the first heading
    after it, which is where the document body starts.
    '''
    entries = []
    for number, line in enumerate(lines, start=1):
        match = re.match(r'^(\s*)\* \[([^\]]+)\]\(#([^)]+)\)', line)
        if match:
            entries.append({'line': number,
                            'indent': len(match.group(1)),
                            'text': match.group(2),
                            'anchor': match.group(3)})
        elif re.match(r'^#{1,6} ', line) and entries:
            break
    return entries


def parent_of(headings, index):
    '''The nearest enclosing heading of a lower level, or None.'''
    level = headings[index]['level']
    for candidate in range(index - 1, -1, -1):
        if headings[candidate]['level'] < level:
            return headings[candidate]
    return None


def find_duplicates(toc_anchors):
    """Targets listed more than once."""
    problems = []
    for anchor, entries in sorted(toc_anchors.items()):
        if len(entries) > 1:
            where = ', '.join(str(e['line']) for e in entries)
            problems.append(
                f'DUPLICATE  #{anchor} is listed {len(entries)} times '
                f'(lines {where})')
    return problems


def find_stale(toc, headings):
    """Entries whose heading no longer exists."""
    known = {h['anchor'] for h in headings}
    return [f'STALE      line {e["line"]}: "{e["text"]}" points at '
            f'#{e["anchor"]}, which no heading produces'
            for e in toc if e['anchor'] not in known]


def enclosing_entry(toc, entry):
    """The TOC entry this one is nested under, by indent."""
    for candidate in reversed([e for e in toc if e['line'] < entry['line']]):
        if candidate['indent'] < entry['indent']:
            return candidate
    return None


def find_missing_and_misplaced(headings, toc, toc_anchors):
    """Headings absent from the TOC, or listed under the wrong section."""
    problems = []
    toc_lines = {e['line'] for e in toc}
    for index, heading in enumerate(headings):
        if not 2 <= heading['level'] <= MAX_TOC_DEPTH:
            continue
        if heading['line'] in toc_lines:
            continue
        parent = parent_of(headings, index)
        if parent and parent['text'] in UNLISTED_CHILDREN_OK:
            continue
        if heading['anchor'] not in toc_anchors:
            problems.append(
                f'MISSING    line {heading["line"]}: '
                f'{"#" * heading["level"]} {heading["text"]} '
                f'(#{heading["anchor"]}) is in no table of contents')
            continue
        if parent is None:
            continue
        entry = toc_anchors[heading['anchor']][0]
        enclosing = enclosing_entry(toc, entry)
        if enclosing and enclosing['anchor'] != parent['anchor']:
            problems.append(
                f'WRONG PARENT line {entry["line"]}: "{entry["text"]}" is '
                f'listed under "{enclosing["text"]}" but appears in the '
                f'document under "{parent["text"]}" (line {parent["line"]})')
    return problems


def check(path=README):
    """Compare the TOC against the headings. Returns a list of problems."""
    with open(path, encoding='utf-8') as handle:
        lines = handle.read().splitlines()

    headings = read_headings(lines)
    toc = read_toc(lines)

    toc_anchors = {}
    for entry in toc:
        toc_anchors.setdefault(entry['anchor'], []).append(entry)

    return (find_duplicates(toc_anchors)
            + find_stale(toc, headings)
            + find_missing_and_misplaced(headings, toc, toc_anchors))


def main():
    '''Report and set exit status.'''
    problems = check()
    if not problems:
        with open(README, encoding='utf-8') as handle:
            lines = handle.read().splitlines()
        listed = len(read_toc(lines))
        total = len([h for h in read_headings(lines)
                     if 2 <= h['level'] <= MAX_TOC_DEPTH])
        print(f'{listed} table of contents entries, {total} headings in range: '
              'structure agrees')
        return 0

    print('TABLE OF CONTENTS DOES NOT MATCH THE DOCUMENT')
    print('  Every link may still resolve — that is what check_images.py')
    print('  verifies. These are structural disagreements it cannot see.')
    print()
    for problem in problems:
        print(f'  {problem}')
    print()
    print(f'{len(problems)} problem(s). Regenerate the affected block from the')
    print('headings rather than editing it by hand.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
