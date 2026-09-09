#!/usr/bin/env python3
'''
Check the external links in the documentation.

Deliberately NOT part of `make lint`. It needs network access, third-party
sites go down for reasons that have nothing to do with this repository, and a
build that fails because someone else's blog is having a bad afternoon teaches
people to ignore build failures. Run it when you add links, and occasionally
otherwise.

What it reports:

  OK        200, no redirect
  MOVED     a redirect to a different URL. Not a failure — the link works —
            but the target has moved, and following a chain of redirects is
            how a link eventually rots. Worth updating.
  BLOCKED   403 or 429. Almost always the site refusing an automated client
            rather than a dead link: Stack Exchange, Cloudflare and others
            reject anything that does not look like a browser. Reported so it
            is visible, but does NOT fail the run — a checker that cries wolf
            about working links is worse than no checker.
  BROKEN    any other 4xx or 5xx
  ERROR     DNS failure, timeout, TLS problem

The MOVED case is the one this exists for. In v2.5.0 six MDN links pointed at
paths MDN had restructured. Every one still worked, because MDN maintains
redirects, so nothing anywhere would ever have reported them — until MDN
eventually stops maintaining that redirect and the links break silently, long
after anyone remembers writing them.

Fragments (#section) are not verified: fetching a page does not tell you
whether an anchor exists in it without parsing, and many sites generate anchors
client-side. The URL is checked; the fragment is your responsibility.

Exit status is 0 unless something is BROKEN or errored. MOVED is reported and
does not fail, because a working link is a working link.
'''

import argparse
import concurrent.futures
import re
import sys
import urllib.error
import urllib.request

DOCS = ['README.md', 'SECURITY.md', 'PROPOSAL.md']

TIMEOUT = 15

# Some sites reject the default urllib agent with 403. That is a property of
# the checker, not of the link, and reporting it as BROKEN would be a false
# positive that trains people to ignore the output.
HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                   'AppleWebKit/537.36 (KHTML, like Gecko) '
                   'Chrome/120.0 Safari/537.36'),
    'Accept': 'text/html,application/xhtml+xml,*/*',
}

# Not worth checking, for stated reasons rather than convenience.
SKIP_PATTERNS = [
    (r'^https?://localhost', 'local development server'),
    (r'^https?://127\.0\.0\.1', 'local development server'),
    (r'img\.shields\.io', 'badge image, regenerated per request'),
    (r'badge\.svg', 'badge image, regenerated per request'),
]


def collect_links(paths):
    '''Every distinct external URL, with the files it appears in.'''
    found = {}
    for path in paths:
        try:
            with open(path, encoding='utf-8') as handle:
                text = handle.read()
        except FileNotFoundError:
            continue
        # Strip fenced code blocks: a URL in an example is illustration, not a
        # link the reader is expected to follow.
        body = re.sub(r'```.*?```', '', text, flags=re.S)
        for url in re.findall(r'\]\((https?://[^)\s]+)\)', body):
            found.setdefault(url, set()).add(path)
        for url in re.findall(r'<img[^>]+src="(https?://[^"]+)"', body):
            found.setdefault(url, set()).add(path)
    return found


def skip_reason(url):
    '''Why this URL is not checked, or None.'''
    for pattern, reason in SKIP_PATTERNS:
        if re.search(pattern, url):
            return reason
    return None


def check_one(url):
    '''Fetch a URL and classify the result.'''
    request = urllib.request.Request(url, headers=HEADERS, method='GET')
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            final = response.geturl()
            if final.rstrip('/') != url.rstrip('/'):
                return ('MOVED', response.status, final)
            return ('OK', response.status, None)
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 429):
            return ('BLOCKED', exc.code, 'site refuses automated clients; '
                                         'check by hand')
        return ('BROKEN', exc.code, None)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return ('ERROR', 0, str(exc)[:70])


def partition(links):
    '''Split the links into those to check and those to skip, with reasons.'''
    checked, skipped = {}, {}
    for url, where in links.items():
        reason = skip_reason(url)
        if reason:
            skipped[url] = reason
        else:
            checked[url] = where
    return checked, skipped


def fetch_all(urls):
    '''Check every URL, in parallel. Third-party sites are slow.'''
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(check_one, u): u for u in sorted(urls)}
        for future in concurrent.futures.as_completed(futures):
            results[futures[future]] = future.result()
    return results


def report(results, checked):
    '''Print everything that is not plain OK. Returns the failure count.'''
    order = {'BROKEN': 0, 'ERROR': 1, 'BLOCKED': 2, 'MOVED': 3, 'OK': 4}
    bad = 0
    for url in sorted(results, key=lambda u: (order[results[u][0]], u)):
        state, code, detail = results[url]
        if state == 'OK':
            continue
        if state in ('BROKEN', 'ERROR'):
            bad += 1
        print(f'  {state:7} {code or "":>3}  {url}')
        print(f'          in {", ".join(sorted(checked[url]))}')
        if detail:
            print(f'          -> {detail}')
    return bad


def main():
    '''Check every external link and report.'''
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='*', default=DOCS,
                        help=f'documents to scan (default: {" ".join(DOCS)})')
    args = parser.parse_args()

    checked, skipped = partition(collect_links(args.files or DOCS))
    print(f'checking {len(checked)} external links '
          f'({len(skipped)} skipped)\n')

    results = fetch_all(checked)
    bad = report(results, checked)

    ok = sum(1 for s, _, _ in results.values() if s == 'OK')
    moved = sum(1 for s, _, _ in results.values() if s == 'MOVED')
    blocked = sum(1 for s, _, _ in results.values() if s == 'BLOCKED')
    print()
    print(f'{ok} OK, {moved} moved, {blocked} blocked, '
          f'{bad} broken or errored')
    if skipped:
        print()
        print('skipped:')
        for url, reason in sorted(skipped.items()):
            print(f'  {url}  ({reason})')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
