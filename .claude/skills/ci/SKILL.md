---
name: ci
description: Run local CI pipeline. Use when running CI, tests, lint, type check, format check, or verifying code quality.
argument-hint: "[--use-haiku] [--mode batch|all|single-file] [--allow-dirty]"
allowed-tools: Bash, Read, Grep
---

# CI Skill: Local CI Pipeline

Run the local CI pipeline for @aidevtool/ci.

## Pipeline Stages

1. git-status-check
2. fmt (auto-fix)
3. lockfile-init
4. type-check
5. test-execution
6. lint-check
7. jsr-check

## Commands

### Standard CI

```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts
```

### With haiku summarization (structured JSONL output)

```bash
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --use-haiku
```

Output format:
```json
{"status":"PASS","summary":"All 7 stages passed","error_count":0,"errors":[]}
```

### Other options

```bash
# Batch mode
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --mode batch

# Allow dirty working directory
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --allow-dirty

# Silent mode
deno run --allow-read --allow-write --allow-run --allow-env mod.ts --log-mode silent
```

## Quick checks (individual stages)

```bash
# Type check only
deno check mod.ts

# Format check only
deno fmt --check

# Lint only
deno lint

# Tests only
deno test --allow-read --allow-write --allow-run --allow-env
```

## Interpreting results

- Exit code 0 = all stages passed
- Exit code 1 = one or more stages failed
- `--use-haiku` returns structured JSON with `status`, `summary`, `error_count`, `errors` (1-level dir paths)
