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
# from https://getbootstrap.com/docs/versions/
BS_VER ?= 5.3.3
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

# Make a release.
.PHONY: all
all: clean default test web  ## Make a release: make clean && make && make test && make web
	$(call hdr,"$@")
	@ls -lh pam-www.tar

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

.init:
	-rm -rf .venv
	pipenv install --python $(PYTHON3_PATH)
	pipenv run python3 -m pip install -U pip
	pipenv run python3 -m pip install pylint
	pipenv run python3 -m pip install mypy
	pipenv run python3 -m pip install pytest
	pipenv run python3 -m pip install pytest-reportportal
	pipenv run python3 -m pip install webdriver_manager
	pipenv run python3 -m pip install selenium types-selenium
	pipenv run python3 -m pip install setuptools
	npm install -g jshint
	@touch $@

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

# The rg test looks for embedded tabs which cause debug format problems and trailing white space.
.PHONY: lint
lint:  ## lint the source code
	$(call hdr,"$@")
	@if rg '\t' www/js/*js ; then printf '\033[31;1mERROR: embedded tabs found\033[0m\n'; exit 1 ; fi
	@if rg '\s$$' www/js/*js ; then printf '\033[31;1mERROR: trailing whitespace found\033[0m\n'; exit 1 ; fi
	jshint --config jshint.json www
	diff <(ls -1 www/icons/black/) <(ls -1 www/icons/blue)
	pipenv run pylint tests/test_chrome.py
	@printf '\033[35;1m$@: PASSED\033[0m\n'

# Make sure that the icons in www/icons/black and icons/blue/blue are the same.
.PHONY: update-blue-icons
update-blue-icons:  ## Idempotent update of www/icons/blue from www/icons/black.
	$(call hdr,"$@")
	@rm -f www/icons/blue/*svg
	@for IFN in $$(find www/icons/black -type f -name '*.svg') ; do \
		OFN=$$(echo "$$IFN" | sed -e 's@/black/@/blue/@') ; \
		printf '\033[35;1m%s\033[0m\n' "$$IFN --> $$OFN" ; \
		rg 'fill="[^"]*"' "$$IFN" ; \
		sed -e 's/fill="[^"]*"/fill="'"blue"'"/g' "$$IFN" > "$$OFN" ; \
		rg 'fill="[^"]*"' "$$OFN" ; \
	done

.PHONY: bs ## install bootstrap locally
bs: 	$(DST)/js/bootstrap.bundle.js \
	$(DST)/js/bootstrap.bundle.js.map \
	$(DST)/css/bootstrap.min.css \
	$(DST)/css/bootstrap.min.css.map \
	$(DST)/font/bootstrap-icons.css \
	$(DST)/favicon.ico

$(DST)/js/bootstrap.bundle.js: $(BS_DIST)/js/bootstrap.bundle.js
	$(call hdr,"$@")
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/js/bootstrap.bundle.js.map: $(BS_DIST)/js/bootstrap.bundle.js.map
	$(call hdr,"$@")
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/css/bootstrap.min.css: $(BS_DIST)/css/bootstrap.min.css
	$(call hdr,"$@")
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/css/bootstrap.min.css.map: $(BS_DIST)/css/bootstrap.min.css.map
	$(call hdr,"$@")
	@-mkdir -p $(dir $@)
	cp $< $@

$(DST)/font/bootstrap-icons.css: bootstrap-icons/font/bootstrap-icons.css
	$(call hdr,"$@")
	@-mkdir -p $(dir $@)
	cp -r bootstrap-icons/font $(DST)/

$(DST)/favicon.ico:
	$(call hdr,"$@")
	@-mkdir -p $(dir $@)
	convert -density 256x256 -background transparent $(FAVICON_SVG) -define icon:auto-resize -colors 256 $@

$(BS_DIST)/js/bootstrap.bundle.js \
$(BS_DIST)/js/bootstrap.bundle.js.map \
$(BS_DIST)/css/bootstrap.min.css \
$(BS_DIST)/css/bootstrap.min.css.map: bootstrap-dist.zip

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
# It assumes that google-chrome and chromedriver are in sync.
KILL_SERVER := lsof -i :$(PORT) && kill -9 $$(lsof -F pcuftDsin -i :$(PORT) | grep ^p | sed -e 's/^p//')

.PHONY: test
test: init lint | tests/test_chrome.py ## Run local tests
	$(call hdr,"$@")
	pipenv run python3 --version
	lsof -v
	-$(KILL_SERVER)
	( cd www && pipenv run python -m http.server $(PORT) > /dev/null 2>&1 ) &
	sleep 2
	lsof -i :$(PORT)
	pipenv run python3 -m pytest -v tests/test_chrome.py
	$(KILL_SERVER)

# This is an example to build off of for debugging
browser-versions:
	$(call hdr,"$@")
	-google-chrome --version && chromedriver --version && chromium-browser --version

run-single-test: init lint | tests/test_pam.py
	$(call hdr,"$@")
	-google-chrome --version && chromedriver --version && chromium-browser --version
	pipenv run python3 --version
	pipenv run python3 -m pytest -k test_pam_setup tests/test_chrome.py

.PHONY: app-help
app-help: www/help/index.html  ## generate the pam help

# requires sed 4.8 or later
www/help/index.html: Makefile README.md www/help/index.css \
		$(shell ls -1 www/help/*png) \
		$(shell ls -1 www/help/*jpg) \
		$(shell ls -1 www/icons/*/*svg)
	$(call hdr,"app-help")
	sed --version
	cp README.md tmp.md
	sed -i 's@<img src="www/help/@<img src="./@' tmp.md
	sed -i 's@<img src="www/icons/blue/@<img src="../icons/black/@' tmp.md
	sed -i "s/__VERSION__/$$(cat VERSION | tr -d ' \n')/g" tmp.md
	sed -i "s/__BOOTSTRAP_VERSION__/$(BS_VER)/g" tmp.md
	sed -i "s/__BUILD__/$$(git show -s --format=%ci $$(git rev-parse --short HEAD | tr -d ' \n'))/g" tmp.md
	sed -i "s/__GIT_COMMIT_ID__/$$(git rev-parse --short HEAD | tr -d ' \n')/g" tmp.md
	sed -i "s/__GIT_BRANCH__/$$(git rev-parse --abbrev-ref HEAD | tr -d ' \n')/g" tmp.md
	sed -i "s/<!-- PP: //g" tmp.md
	sed -i "s/ PP: -->//g" tmp.md
	cat tmp.md | grep -v '\[!\[Release\](' | grep -v '!\[Workflow\](' > tmp1.md
	mv tmp1.md tmp.md
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
	@-rm -rf web pam-www.tar pam
	mkdir -p web/pam
	cp -r www web/pam/www
	rm -rf web/pam/www/.venv
	find web -type f -name '*~' -delete
	@cd web && tar Jcf ../pam-www.tar pam
	@ls -l pam-www.tar

.PHONY: web-min
web-min: app-help app-version  ## (EXPERIMENTAL) create a minimized web release in pam-www-min.tar
	$(call hdr,"$@")
	@-rm -rf web-min pam-www-min.tar pam
	mkdir -p web-min/pam
	cp -r www web-min/pam/www
	node --version
	minify --version
	for js in $$(ls -1 web-min/pam/www/js/*.js) ; do \
		mjs=$$(echo "$$js" | sed -e 's/\.js/.min.js/') ; \
		printf "\033[35;1mminify $$js\033[0m\n" ; \
		minify "$$js" > "$$mjs" ; \
		rm "$$js" ; \
		mv "$$mjs" "$$js" ; \
	done
	rm -rf web-min/pam/www/.venv
	@find web-min -type f -name '*~' -delete
	@cd web-min && tar Jcf ../pam-www-min.tar pam
	@ls -l pam-www-min.tar

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
		awk -F'##' '{printf("%-18s %s\n",$$1,$$2)}' | \
		sort -f | \
		sed -e 's@^@   @'
	@printf "\n\033[35;1m%s\n" "Variables"
	@printf '    BOOTSTRAP : %s\n' $(BS_DIST)
	@printf '    DST       : %s\n' $(DST)
	@printf '    PORT      : %s\n' $(PORT)
	@printf "\033[0m\n"
