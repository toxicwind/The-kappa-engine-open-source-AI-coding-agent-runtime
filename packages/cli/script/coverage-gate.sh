#!/usr/bin/env bash
# Run the coverage gate without the run-fast shim
# Bypass the 4s shim by calling bun directly on the script
exec bun run script/coverage-gate.ts "$@"
