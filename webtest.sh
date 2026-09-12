#!/usr/bin/env bash
#
# Serve PAM locally and open it, so that the server and the browser window
# live and die together.
#
#   ./serve.sh                          # port 9002, www/index.html
#   PORT=8100 ./serve.sh                # another port
#   PAGE=vault-diff.html ./serve.sh     # another page
#   ./serve.sh vault-diff.html          # same thing, positionally
#
# Ctrl-C closes the browser window and stops the server.
# Closing the browser window stops the server.
#
# HOW, because the obvious approach does not work.
#
# `open URL` hands the request to macOS and returns immediately: the script
# never learns which application took it, so it cannot close anything later.
# `open -W URL` waits, but only waits — Ctrl-C still cannot close the window.
# And if the URL has been claimed by a Safari web app ("Add to Dock"), the URL
# goes there no matter what `-a` or `-b` say, and a web app that stays running
# after its window closes leaves `-W` waiting forever.
#
# So this launches a Chromium-family browser directly, with a throwaway
# profile, and keeps its PID. Owning the process is what makes both directions
# work. If no such browser is found it falls back to `open -W`, which is
# better than nothing but carries the caveats above.
set -euo pipefail

PORT="${PORT:-9002}"
PAGE="${1:-${PAGE:-www/index.html}}"
URL="http://localhost:${PORT}/${PAGE#/}"

if [ ! -f "$PAGE" ] ; then
    echo "ERROR: no such page: ${PAGE}" >&2
    echo "       run this from the directory you want to serve" >&2
    exit 1
fi

# Refuse if the port is taken, BEFORE starting anything.
#
# Afterwards it cannot be detected reliably: python exits immediately with
# "Address already in use", but as an unreaped child it still answers
# `kill -0`, and a port probe then sees the OTHER server and reports success.
# The browser would load a page served by a process that is not ours.
if ( exec 3<>"/dev/tcp/127.0.0.1/${PORT}" ) 2>/dev/null ; then
    exec 3<&- 3>&-
    echo "ERROR: something is already listening on port ${PORT}." >&2
    lsof -i ":${PORT}" 2>/dev/null >&2 || true
    echo "" >&2
    echo "Stop it, or use another port:  PORT=$((PORT + 1)) $0" >&2
    exit 1
fi

# --bind 127.0.0.1, not the default. Without it the server listens on every
# interface, so a page holding vault contents is reachable from the network.
python3 -m http.server --bind 127.0.0.1 "$PORT" >/dev/null 2>&1 &
SERVER=$!
BROWSER=""
PROFILE=""

cleanup() {
    if [ -n "$BROWSER" ] && kill -0 "$BROWSER" 2>/dev/null ; then
        kill "$BROWSER" 2>/dev/null || true
        wait "$BROWSER" 2>/dev/null || true
        echo "browser closed"
    fi
    if kill -0 "$SERVER" 2>/dev/null ; then
        kill "$SERVER" 2>/dev/null || true
        wait "$SERVER" 2>/dev/null || true
        echo "server stopped"
    fi
    [ -n "$PROFILE" ] && rm -rf "$PROFILE"
    return 0
}
# EXIT covers every way out. INT and TERM just exit, which fires EXIT — running
# cleanup from all three would run it more than once.
trap cleanup EXIT
trap 'exit 130' INT TERM

# Wait for the socket rather than sleeping a fixed amount. The port was free a
# moment ago, so whatever is listening now is ours.
ready=""
for _ in $(seq 1 100) ; do
    if ( exec 3<>"/dev/tcp/127.0.0.1/${PORT}" ) 2>/dev/null ; then
        exec 3<&- 3>&-
        ready=1
        break
    fi
    sleep 0.1
done
if [ -z "$ready" ] ; then
    echo "ERROR: the server never started listening on port ${PORT}" >&2
    exit 1
fi

# A throwaway profile keeps this out of your real browser session: no shared
# cookies, no localStorage, no tabs mixed in with your own, and no chance of a
# Safari web app intercepting the URL.
find_browser() {
    local candidate
    for candidate in \
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        "/Applications/Chromium.app/Contents/MacOS/Chromium" \
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" ; do
        if [ -x "$candidate" ] ; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

printf '\033[1;35m'
echo "serving  : $(pwd)"
echo "url      : ${URL}"
echo "server   : pid ${SERVER}"
printf '\033[0m'

if BROWSER_BIN="$(find_browser)" ; then
    PROFILE="$(mktemp -d "${TMPDIR:-/tmp}/pam-serve.XXXXXXXX")"
##    "$BROWSER_BIN" \
##        --user-data-dir="$PROFILE" \
##        --no-first-run \
##        --no-default-browser-check \
##        --new-window "$URL" >/dev/null 2>&1 &
    "$BROWSER_BIN" \
        --user-data-dir="$PROFILE" \
        --no-first-run \
        --no-default-browser-check \
        --disable-background-mode \
        --app="$URL" >/dev/null 2>&1 &
    BROWSER=$!
    printf '\033[1;35m'
    echo "browser  : pid ${BROWSER} ($(basename "$BROWSER_BIN"))"
    echo "press Ctrl-C, or quit the browser with Command-Q to stop"
    printf '\033[0m'

    # Poll rather than `wait -n`: macOS ships bash 3.2, where `wait -n` does
    # not exist. Whichever process exits first ends the loop, and cleanup
    # takes care of the other.
    while kill -0 "$SERVER" 2>/dev/null && kill -0 "$BROWSER" 2>/dev/null ; do
        sleep 0.5
    done
else
    printf '\033[1;35m'
    echo "note     : no Chromium-family browser found, falling back to 'open -W'"
    echo "           Ctrl-C will stop the server but cannot close the window"
    echo "press Ctrl-C, or quit the browser with Command-Q to stop"
    printf '\033[0m'
    open -W "$URL" || true
fi
