SHELL := /bin/sh

PNPM ?= pnpm
NODE ?= node
ARGS ?=
OH_DSH_HOME ?= $(HOME)/.ohdsh

export OH_DSH_HOME

TUI_COMPILE_STAMP := .stage/tui-compile.stamp
CONTEXT_COMPILE_STAMP := .stage/dsh-context-compile.stamp

.DEFAULT_GOAL := build
.PHONY: build upstream stage stage-desktop stage-web stage-tui tui web desktop

build: upstream
	$(PNPM) run build

# Submodule checkouts follow the recorded gitlinks on every build, and dsh-TUI
# recompiles only when its checked-out revision differs from the stamp, so an
# incremental checkout never stages a stale renderer build as the new pin.
# dsh-context keeps the same guard around its own tsdown build.
upstream:
	git submodule update --init --recursive upstream/DSH-better-sidebar upstream/dsh-TUI upstream/dsh-context
	@if [ ! -f "$(TUI_COMPILE_STAMP)" ] \
		|| [ "$$(git -C upstream/dsh-TUI rev-parse HEAD)" != "$$(cat $(TUI_COMPILE_STAMP) 2>/dev/null)" ]; then \
		$(PNPM) --dir upstream/dsh-TUI install --frozen-lockfile --ignore-scripts; \
		$(PNPM) --dir upstream/dsh-TUI run compile; \
		mkdir -p $(dir $(TUI_COMPILE_STAMP)); \
		git -C upstream/dsh-TUI rev-parse HEAD > $(TUI_COMPILE_STAMP); \
	fi
	@if [ ! -f "$(CONTEXT_COMPILE_STAMP)" ] \
		|| [ "$$(git -C upstream/dsh-context rev-parse HEAD)" != "$$(cat $(CONTEXT_COMPILE_STAMP) 2>/dev/null)" ]; then \
		$(PNPM) --dir upstream/dsh-context install --frozen-lockfile --ignore-scripts; \
		$(PNPM) --dir upstream/dsh-context run build; \
		mkdir -p $(dir $(CONTEXT_COMPILE_STAMP)); \
		git -C upstream/dsh-context rev-parse HEAD > $(CONTEXT_COMPILE_STAMP); \
	fi

stage: build
	$(PNPM) run stage:dsh

stage-desktop: build
	$(PNPM) run stage:dsh -- --surface desktop

stage-web: build
	$(PNPM) run stage:dsh -- --surface web

stage-tui: build
	$(PNPM) run stage:dsh -- --surface tui

tui: stage-tui
	$(NODE) dist/ohdsh.js tui --inline $(ARGS)

web: stage-web
	$(NODE) dist/web.js $(ARGS)

desktop: stage-desktop
	$(PNPM) exec electron . $(ARGS)
