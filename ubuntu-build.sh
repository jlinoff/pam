#!/usr/bin/env bash
#
# Proof of concept for running the PAM build/test processes
# on Ubuntu 20.04 for github actions workflow.
#
# Create the container like this:
#   $ mkdir -p $HOME/work
#   $ cd $HOME/work
#   $ git clone https://github.com/jlinoff/pam.git
#   $ cd pam
#   $ make clean
#   $ docker run -it --rm -h pam-test --name pam-test -v $HOME:/mnt/pam ubuntu:20.04 bash
#      > cd /mnt/pam
#      > ./ubuntu-build.sh
#
PS4='$(printf "\x1b[34;1m# ==== COMMAND:%-10s \x1b[0m" "${LINENO}")'
set -ex
export SHELL=$(which bash)
export PIPENV_VENV_IN_PROJECT=1
export DEBIAN_FRONTEND=noninteractive

# Install the basic packages.
apt update
apt upgrade -y
apt install -y apt-utils
apt install -y tzdata
apt install -y software-properties-common
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
    wget -vP keep/ https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    cd ..
fi
ls -l ./keep/google-chrome-stable_current_amd64.deb
apt install -y --allow-downgrades ./keep/google-chrome-stable_current_amd64.deb
which google-chrome
google-chrome --version

# Install chromedriver for pylenium/selenium.
VERSION=$(curl -s "https://chromedriver.storage.googleapis.com/LATEST_RELEASE")
echo "VERSION=${VERSION}"
wget -qP /tmp/ "https://chromedriver.storage.googleapis.com/${VERSION}/chromedriver_linux64.zip"
ls -l /tmp/chromedriver_linux64.zip
unset VERSION
unzip -o /tmp/chromedriver_linux64.zip -d /usr/bin
which chromedriver
chromedriver --version

# Run PAM make build and test.
cd /mnt/pam
rm -rf Pipfile .venv/
make clean
make help
make
make test
make web
ls -l pam-www.tar
