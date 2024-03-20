#!/usr/bin/env bash
#
# This bash script gets and installs the chromedriver that is the closest match to
# the major and minor version of chrome.
#
# It works for MacOS and Linux.
#
set -e
OS="$(uname -s)"
echo "OS: ${OS}"
CVER="unknown"
VERSION="0.0.0.0"
MAJOR="0"
MINOR="0"
if [[ "$OS" == "Darwin" ]] ; then
    CVER=$(/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version)
    VERSION=$(echo "$CVER" | awk '{print $NF}')
    MAJOR=$(echo "${VERSION}" | tr '.' ' ' | awk '{print $1}')
    MINOR=$(echo "${VERSION}" | tr '.' ' ' | awk '{print $2}')
    URL=$(wget https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json \
               -O - -o /dev/null | \
              jq . | \
              rg "https://.*chromedriver-mac-x64" | \
              tr '"' '\n' | \
              grep "$MAJOR.$MINOR" | \
              tail -1)
elif [[ "$OS" == "Linux" ]] ; then
    CVER=$(google-chrome --version)
    VERSION=$(echo "$CVER" | awk '{print $NF}')
    MAJOR=$(echo "${VERSION}" | tr '.' ' ' | awk '{print $1}')
    MINOR=$(echo "${VERSION}" | tr '.' ' ' | awk '{print $2}')
    URL=$(wget https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json \
               -O - -o /dev/null | \
              jq . | \
              rg "https://.*chromedriver-linux64" | \
              tr '"' '\n' | \
              grep "$MAJOR.$MINOR" | \
              tail -1)
fi
echo "CHROME VERSION: ${CVER}"
if [[ "$OS" == "unknown" ]] ; then
    echo "ERROR: Cannot find chrome version!"
    exit 1
fi
echo "URL: $URL"
wget "$URL" -O /tmp/x.zip
unzip -l /tmp/x.zip
ls -l /usr/local/bin/chromedriver
sum /usr/local/bin/chromedriver
rm -f /tmp/chromedriver
unzip -p /tmp/x.zip '*/chromedriver' > /tmp/chromedriver
sudo cp /tmp/chromedriver /usr/local/bin/chromedriver
sudo chmod a+x /usr/local/bin/chromedriver
/usr/local/bin/chromedriver --version
rm -f /tmp/chromedriver
ls -l /usr/local/bin/chromedriver
sum /usr/local/bin/chromedriver
/usr/local/bin/chromedriver --version
rm -f /tmp/x.zip
echo "DONE"
