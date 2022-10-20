#!/usr/bin/env bash
#
# Proof of concept for running the PAM build/test processes
# on Ubuntu 20.04.
#
# Create the container like this:
#   $ mkdir -p $HOME/work
#   $ cd $HOME/work
#   $ git clone https://github.com/jlinoff/pam.git
#   $ cd pam
#   $ make clean
#   $ docker run -it --rm -h test1 --name test1 -v $HOME:$HOME ubuntu:20.04 bash
#      > cd $HOME/work/pam
#      > ubuntu-build.sh
#
PS4='$(printf "\x1b[34;1mCOMMAND:%-10s \x1b[0m" "${LINENO}")'
set -ex

# Install the basic packages.
apt update
apt upgrade -y
apt install -y apt-utils
export DEBIAN_FRONTEND=noninteractive
apt install -y tzdata
apt install software-properties-common -y
apt install -y build-essential
apt install -y pipenv
apt install -y vim
apt install -y tree
apt install -y git
apt install -y npm
apt install -y pandoc
apt install -y aspell
apt install -y curl
apt install -y wget
apt install -y zip
apt install -y lsof

# Install google chrome for pylenium/selenium.
if [ ! -f ./keep/google-chrome-stable_current_amd64.deb ] ; then
    cd keep
    wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    cd ..
fi
apt install -y ./keep/google-chrome-stable_current_amd64.deb
google-chrome --version

# Install chromedriver for pylenium/selenium.
VERSION=$(curl -s "https://chromedriver.storage.googleapis.com/LATEST_RELEASE")
wget -qP /tmp/ "https://chromedriver.storage.googleapis.com/${VERSION}/chromedriver_linux64.zip"
unset VERSION
unzip -o /tmp/chromedriver_linux64.zip -d /usr/bin
apt-get --only-upgrade install google-chrome-stable
chromedriver --version

# Run PAM make build and test.
export SHELL=/usr/bin/bash
export PIPENV_VENV_IN_PROJECT=1
cd /Users/jlinoff/work/pam
rm -rf Pipfile .venv/
make help
make
make test
make web
