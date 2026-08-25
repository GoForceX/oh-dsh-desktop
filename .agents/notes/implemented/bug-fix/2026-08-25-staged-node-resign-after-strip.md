# Agent Note: Re-sign the staged Node binary after stripping on macOS

Status: implemented

English | [中文](2026-08-25-staged-node-resign-after-strip.zh.md)

## Problem

`stage-dsh.mjs` strips the staged Node binary with `strip -x` to shrink
distributions. On Apple Silicon a Mach-O must carry a valid code signature;
stripping invalidates it, so macOS killed the staged Node (exit 137) on every
launch and `stage:dsh` failed at its own `bin.js --version` check. CI never
saw this because the staging job runs on Linux, where signatures do not
exist; every macOS-arm64 local staging, `make web`, and `make desktop` run
was broken.

## Decision

After a successful `strip -x` on darwin, re-sign the binary ad-hoc with
`/usr/bin/codesign --force --sign -`, matching what `install-mac.mjs` already
does at install time. If `codesign` is unavailable or fails, print a warning
and keep going rather than failing the stage: the packaged installers re-sign
on their own path.

## Alternatives considered

**Skip stripping on macOS.** Rejected: it silently ships ~100 MB of symbols
in macOS-built packages to avoid one codesign invocation.

**Fail staging when the re-sign fails.** Rejected: the staged tree is also a
local development convenience; the warning preserves it while the runtime
`--version` verification still fails loudly if the binary is actually dead.

## Consequences

- The stripping behavior itself is owned by the
  [lean-packages](../../feature/2026-08-25-cli-first-install-and-lean-packages.md)
  decision; this note owns the macOS signature consequence of it.
- `stage:dsh`, `make web`, and `make desktop` work again on macOS arm64.
- macOS-built Web/TUI packages carry a re-signed, stripped Node instead of a
  killed one.
- Linux and Windows staging paths are unchanged.
