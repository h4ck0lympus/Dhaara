# One entry point for setup, running, tests and the Linux AppImage. `make help` lists the targets.
NPM := npm
PORT ?= 8765

.DEFAULT_GOAL := help
.PHONY: help setup run desktop build test test-py test-web test-electron e2e e2e-electron check appimage clean

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

setup: ## Install Python and Node dependencies and link the Chromium sandbox helper
	uv sync --extra test
	$(NPM) --prefix web ci
	$(NPM) --prefix electron ci
	node electron/scripts/link-sandbox.mjs

run: ## Serve Dhara in the browser (rebuilds a stale UI)
	uv run run.py --port $(PORT) --open

desktop: build ## Start the service and the Electron shell together
	uv run run.py --port $(PORT) --desktop

build: ## Build the web bundle and the Electron shell
	$(NPM) --prefix web run build
	$(NPM) --prefix electron run build

test: test-py test-web test-electron ## Run all unit tests

test-py: ## Python tests
	uv run pytest -q

test-web: ## Web unit tests
	$(NPM) --prefix web test

test-electron: ## Electron unit tests
	$(NPM) --prefix electron run build
	$(NPM) --prefix electron run unit

e2e: ## Browser end-to-end tests (rebuilds the web bundle first)
	$(NPM) --prefix web run build
	$(NPM) --prefix web run e2e

e2e-electron: ## Electron end-to-end tests
	$(NPM) --prefix electron run build
	$(NPM) --prefix electron run e2e

check: test e2e ## Everything CI would run

appimage: ## Build release/out/Dhara-<version>-x86_64.AppImage (Linux x86_64, Node 22)
	bash release/build.sh

clean: ## Remove build output (keeps data, dependencies and the download cache)
	rm -rf web/dist electron/dist release/out web/test-results web/playwright-report
