# The everyday commands; `make` lists them. Written for GNU Make 3.81, the
# version macOS ships. PORT changes the development server's port; the
# service itself defaults to 3000, as it runs in its container.
.DEFAULT_GOAL := help
.PHONY: help setup build run check docs

PORT ?= 3200
export PORT

help: ## List the targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z]+:.*## / {printf "  make %-8s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install the dependencies and the Git hooks
	npm ci
	npx prek install

build: ## Compile src/ into dist/
	npm run build

run: ## Run PlaceMellon on PORT (3200), restarting when src/ changes
	npm run dev

check: ## The everyday check from DEVELOPMENT.md
	npm run check

docs: ## Regenerate the generated sections of the docs pages
	npm run docs
