#!/usr/bin/env bash
#
# Serve PAM locally and open it in a browser, so the two stop together.
#
#   ./webtest.sh                          # port 9002, www/index.html
#   PORT=8100 ./webtest.sh                # another port
#   PAGE=vault-diff.html ./webtest.sh     # another page
#   ./webtest.sh vault-diff.html          # same thing, positionally
#
# TWO WAYS TO STOP, and only two:
#
#   Ctrl-C here      quits the browser and stops the server
#   Command-Q there  quits the browser, which stops the server
#
# CLOSING THE WINDOW DOES NOT STOP ANYTHING. That is macOS, not an oversight:
# an application does not quit when its last window closes, it stays running
# with just the menu bar. So the browser process outlives the window and this
# script keeps waiting on a PID that is still perfectly alive. Command-Q is the
# event that actually ends the application, so Command-Q is what this watches
# for.
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
# profile, and keeps its PID. Owning the process is what lets Ctrl-C close the
# browser and lets Command-Q stop the script. If no such browser is found it
# falls back to `open -W`, which is better than nothing but carries the caveats
# above.
set -euo pipefail

# Colour only when stdout is a terminal. Piped to a file or a pager, escape
# codes are noise; and if the script is interrupted between setting a colour
# and resetting it, a terminal is left tinted.
if [ -t 1 ] ; then
    HL=$'\033[1;35m'
    NC=$'\033[0m'
else
    HL=""
    NC=""
fi

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

printf "%s" "$HL"
echo "serving  : $(pwd)"
echo "url      : ${URL}"
echo "server   : pid ${SERVER}"
printf "%s" "$NC"

if BROWSER_BIN="$(find_browser)" ; then
    PROFILE="$(mktemp -d "${TMPDIR:-/tmp}/pam-serve.XXXXXXXX")"
    # --app rather than --new-window, and --disable-background-mode with it.
    #
    # --app opens a plain window with no tabs or toolbar, which suits a tool
    # page and makes Command-Q the obvious way to leave. --disable-background-
    # mode stops Chrome lingering as a background agent after it quits, which
    # would otherwise keep this script waiting on a process that has no
    # windows and no intention of exiting.
    "$BROWSER_BIN" \
        --user-data-dir="$PROFILE" \
        --no-first-run \
        --no-default-browser-check \
        --disable-background-mode \
        --app="$URL" >/dev/null 2>&1 &
    BROWSER=$!
    printf "%s" "$HL"
    echo "browser  : pid ${BROWSER} ($(basename "$BROWSER_BIN"))"
    echo "press Ctrl-C, or quit the browser with Command-Q to stop"
    printf "%s" "$NC"

    # Poll rather than `wait -n`: macOS ships bash 3.2, where `wait -n` does
    # not exist. Whichever process exits first ends the loop, and cleanup
    # takes care of the other.
    while kill -0 "$SERVER" 2>/dev/null && kill -0 "$BROWSER" 2>/dev/null ; do
        sleep 0.5
    done
else
    printf "%s" "$HL"
    echo "note     : no Chromium-family browser found, falling back to 'open -W'"
    echo "           Ctrl-C will stop the server but cannot close the window"
    echo "press Ctrl-C, or quit the browser with Command-Q to stop"
    printf "%s" "$NC"
    open -W "$URL" || true
fi
