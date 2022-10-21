# BEWARE!!
# This makefile is setup to run PAM builds and tests on MacOS with
# the setup described here: https://github.com/jlinoff/my-mac-setup.
#
# To see the available targets: make help
#
# Typical usage:
#    make
#    make test
#
# Make the local bootstrap environment in the local www directory.
#
SHELL := bash
DST  ?= www
PORT ?= 8081
FAVICON_SVG ?= bootstrap-icons/icons/box.svg
BS_VER ?= 5.2.2
BS_DIST ?= bootstrap-$(BS_VER)-dist
export PIPENV_VENV_IN_PROJECT := True
PYTHON3_PATH ?= python3

# Macros
define hdr
        @printf '\033[35;1m\n'
        @printf '=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=\n'
	@printf '=-=-= Target: %s\n' "$1"
        @printf '=-=-= Date: %s\n' "$(shell date)"
        @printf '=-=-= Directory: %s\n' "$$(pwd)"
        @printf '=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-='
        @printf '\033[0m\n'
endef

# Rules
.PHONY: default
default: init

.PHONY: clean
clean:   # clean up
	$(call hdr,"$@")
	-[ -d .git ] && git clean -xdf -e keep . || true

# spell check README
.PHONY: spell-check
spell-check:  ## Spell check the README.md file using aspell.
	$(call hdr,"$@")
	aspell check README.md

.PHONY: init
init: .init bs app-version app-help  ## very basic setup for python3 and jshint

.init: .venv/pylenium.json
	$(call hdr,"$@-npm")
	npm install -g jshint
	@touch $@

# URL: https://github.com/ElSnoMan/pyleniumio/tree/main/docs
# $ /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version
# https://github.com/ElSnoMan/pyleniumio/issues/278
# to fix
#   ERROR:: --system is intended to be used for pre-existing Pipfile installation
#   $ rm -rf ~/.local/share/virtualenvs/*

# The following setup works on MacOS and Ubuntu 20.04.
# For some reason pipenv install did not work reliably on Ubuntu.
# pytest-reportportal~=1.0 and webdriver_manager==3.7.0
# are required for pylenium compatibility.
.venv/pylenium.json:
	-rm -rf .venv
	pipenv install --python $(PYTHON3_PATH)
	pipenv run python3 -m pip install -U pip
	pipenv run python3 -m pip install pylint
	pipenv run python3 -m pip install mypy
	pipenv run python3 -m pip install pytest
	pipenv run python3 -m pip install pytest-reportportal~=1.0
	pipenv run python3 -m pip install webdriver_manager==3.7.0
	pipenv run python3 -m pip install pyleniumio
	pipenv run pylenium init

# to copy to icloud:
# $ make backup
# $ cp backup-project.tar "$HOME/Library/Mobile Documents/com~apple~CloudDocs/"
#
# to copy from icloud
# $ mkdir project
# $ cd project
# $ cp "$HOME/Library/Mobile Documents/com~apple~CloudDocs/backup-project.tar" .
# $ tar xf backup-project.tar
.PHONY: backup
backup:  ## create source backup
	$(call hdr,"$@")
	@\
	NAME="backup-$$(basename $$(pwd) ).tar" ; \
	rm -f $NAME ; \
	tar Jcf $$NAME .git $$(git ls-files) ; \
	ls -lh $$NAME

.PHONY: lint
lint:  ## lint the source code
	$(call hdr,"$@")
	jshint --config jshint.json www
	@printf '\033[35;1m$@: PASSED\033[0m\n'

.PHONY: bs
bs: .bs ## install bootstrap locally

.PHONY: .bs
.bs: 	$(DST)/js/bootstrap.bundle.js \
	$(DST)/js/bootstrap.bundle.js.map \
	$(DST)/css/bootstrap.css \
	$(DST)/css/bootstrap.css.map \
	$(DST)/font/bootstrap-icons.css \
	$(DST)/favicon.ico
	tree www
	@touch $@

$(DST)/js/bootstrap.bundle.js: $(BS_DIST)/js/bootstrap.bundle.js
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/js/bootstrap.bundle.js.map: $(BS_DIST)/js/bootstrap.bundle.js.map
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/css/bootstrap.css: $(BS_DIST)/css/bootstrap.css
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/css/bootstrap.css.map: $(BS_DIST)/css/bootstrap.css.map
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/font/bootstrap-icons.css: bootstrap-icons/font/bootstrap-icons.css
	@-mkdir -p $(dir $@)
	cp -r bootstrap-icons/font $(DST)/

$(DST)/favicon.ico:
	@-mkdir -p $(dir $@)
	convert -density 256x256 -background transparent $(FAVICON_SVG) -define icon:auto-resize -colors 256 $@

$(BS_DIST)/js/bootstrap.bundle.js \
$(BS_DIST)/js/bootstrap.bundle.js.map \
$(BS_DIST)/css/bootstrap.css \
$(BS_DIST)/css/bootstrap.css.map: bootstrap-dist.zip

bootstrap-dist.zip:
	curl -L https://github.com/twbs/bootstrap/releases/download/v$(BS_VER)/$(BS_DIST).zip -o bootstrap-dist.zip
	unzip bootstrap-dist.zip

bootstrap-icons/font/bootstrap-icons.css:
	git clone https://github.com/twbs/icons.git bootstrap-icons

.PHONY: run
run: init  ## Run the server on port PORT
	$(call hdr,'$@ - http://localhost:$(PORT)')
	cd www && pwd && pipenv run python -m http.server $(PORT)

# Run the local tests - verified on MacOS and Ubuntu-20.04
# kill any servers already running on PORT
# start a server in the background, give it a few seconds to get started
# run the tests
# kill the background server so it doesn't run forever in the background
# example usage: make test PORT=8088
KILL_SERVER := lsof -i :$(PORT) && kill -9 $$(lsof -F pcuftDsin -i :$(PORT) | grep ^p | sed -e 's/^p//')
.PHONY: test
test: init lint | tests/test_pam.py ## Run local tests
	$(call hdr,"$@")
	pipenv run python3 --version
	lsof -v
	-$(KILL_SERVER)
	( cd www && pipenv run python -m http.server $(PORT) ) &
	sleep 2
	lsof -i :$(PORT)
	pipenv run python3 -m pytest --options='headless, incognito, no-sandbox, disable-extensions' tests/test_pam.py
	$(KILL_SERVER)

.PHONY: app-help
app-help: www/help/index.html  ## generate the pam help

# requires sed 4.8 or later
www/help/index.html: Makefile README.md www/help/index.css \
		$(shell ls -1 www/help/*png) \
		$(shell ls -1 www/help/*svg)
	$(call hdr,"app-help")
	sed --version
	cp README.md tmp.md
	sed -i 's@<img src="www/help/@<img src="./@' tmp.md
	sed -i "s/__VERSION__/$$(cat VERSION | tr -d ' \n')/g" tmp.md
	sed -i "s/__BOOTSTRAP_VERSION__/$(BS_VER)/g" tmp.md
	sed -i "s/__BUILD__/$$(git show -s --format=%ci $$(git rev-parse --short HEAD | tr -d ' \n'))/g" tmp.md
	sed -i "s/__GIT_COMMIT_ID__/$$(git rev-parse --short HEAD | tr -d ' \n')/g" tmp.md
	sed -i "s/__GIT_BRANCH__/$$(git rev-parse --abbrev-ref HEAD | tr -d ' \n')/g" tmp.md
	sed -i "s/<!-- PP: //g" tmp.md
	sed -i "s/ PP: -->//g" tmp.md
	grep -v '^# myVault' tmp.md > tmp1.md
	grep -v '\[!\[Releases\](' tmp1.md > tmp.md
	pandoc -s --css index.css -s --metadata title='PAM - help' --html-q-tags -o $@ tmp.md
	rm -f tmp*.md

SRC_FILES := VERSION README.md \
		www/index.html www/help/index.css \
		$(shell find www/js -type f -name '*.js' | grep -v version.js) \
		$(shell find www/help -type f)

.PHONY: app-version
app-version: www/js/version.js  ## update the version in the source code

www/js/version.js: Makefile $(SRC_FILES)
	$(call hdr,"$@")
	echo '// DO NOT DELETE!' > $@
	echo '// This file is automatically generated by make.' >> $@
	echo "export const VERSION = '$$(cat VERSION | tr -d ' \n')'" >> $@
	echo "export const BOOTSTRAP_VERSION = '$(BS_VER)'" >> $@
	echo $$(git rev-parse --short HEAD | \
		tr -d '\n' | \
		xargs -I{} echo "export const COMMIT_ID = '{}'" ) >> $@
	echo $$(git show -s --format=%ci $$(git rev-parse --short HEAD | tr -d ' \n')) | \
		xargs -I{} echo "export const COMMIT_DATE = '{}'" >>$@
	echo $$(git rev-parse --abbrev-ref HEAD) | \
		xargs -I{} echo "export const COMMIT_BRANCH = '{}'" >>$@
	@cat -n $@

.PHONY: web
web: app-help app-version  ## create a web release in pam-www.tar
	$(call hdr,"$@")
	@-rm -rf pam
	mkdir pam
	cp -r www pam/www
	rm -rf pam/www/.venv
	find pam/www -type f -name '*~' -delete
	tar Jcf pam-www.tar pam

# could replace
#   awk -F'##' '{printf("%-16s %s\n",$1,$2)}'
# with
#   column -t -s '##'
# the commands below if a recent version column was easily available
# on all interesting platforms.
# unfortunately ubuntu only provides the ancient BSD version.
# ref: https://bugs.launchpad.net/ubuntu/+source/util-linux/+bug/1705437
.PHONY: help
help:  ## this help message
	$(call hdr,"$@")
	@printf "\n\033[35;1m%s\n" "Targets"
	@grep -E '^[ ]*[^:]*[ ]*:.*##' $(MAKEFILE_LIST) 2>/dev/null | \
		grep -E -v '^ *#' | \
	        grep -E -v "egrep|sort|sed|MAKEFILE" | \
		sed -e 's/: .*##/##/' -e 's/^[^:#]*://' | \
		awk -F'##' '{printf("%-16s %s\n",$$1,$$2)}' | \
		sort -f | \
		sed -e 's@^@   @'
	@printf "\n\033[35;1m%s\n" "Variables"
	@printf '    DST  : %s\n' $(DST)
	@printf '    PORT : %s\n' $(PORT)
	@printf "\033[0m\n"
