---
name: release
description: Release a new version to JSR. Use when publishing a new version, bumping version, or releasing to JSR.
argument-hint: "[patch|minor|major]"
disable-model-invocation: true
allowed-tools: Read, Edit, Bash, Grep
---

# Release Skill: JSR Package Publishing

This skill handles the complete release process for @aidevtool/ci to JSR.

## Prerequisites

Before releasing:
1. All changes must be merged to `main`
2. CI must be passing
3. Working directory must be clean

## Version Files

**Both files must be updated together:**
- `deno.json` - Package version for JSR
- `src/version.ts` - VERSION constant for `--version` CLI output

## Release Process

### Step 1: Verify Prerequisites

```bash
# Ensure on main branch
git checkout main
git pull origin main

# Verify clean working directory
git status

# Verify CI passes
deno task test
deno lint
deno fmt --check
```

### Step 2: Determine New Version

Current version: Check `deno.json` and `src/version.ts`

Version bump rules:
- **patch** (0.1.8 -> 0.1.9): Bug fixes, minor improvements
- **minor** (0.1.8 -> 0.2.0): New features, backward compatible
- **major** (0.1.8 -> 1.0.0): Breaking changes

### Step 3: Update Version Files

**deno.json:**
```json
{
  "version": "X.Y.Z"
}
```

**src/version.ts:**
```typescript
export const VERSION = "X.Y.Z";
```

### Step 4: Commit and Tag

```bash
# Stage version files
git add deno.json src/version.ts

# Commit with version message
git commit -m "Bump version to X.Y.Z"

# Create annotated tag
git tag vX.Y.Z

# Push commit and tag
git push origin main --tags
```

### Step 5: Verify Release

```bash
# Check workflow status
gh run list --limit 3

# Wait for "Publish to JSR" workflow to complete
# If failed, check logs:
gh run view <run-id> --log-failed
```

### Step 6: Verify Published Version

```bash
# Test the published version
deno run --allow-all --reload jsr:@aidevtool/ci --version
```

## Troubleshooting

### Workflow Failed

1. Check the error:
   ```bash
   gh run view <run-id> --log-failed
   ```

2. Common issues:
   - **Format check failed**: Run `deno fmt`
   - **Lint check failed**: Run `deno lint` and fix issues
   - **Type check failed**: Run `deno check mod.ts`

3. Fix, commit, delete old tag, recreate:
   ```bash
   # Fix the issue and commit
   git add . && git commit -m "Fix: <description>"

   # Delete old tag
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z

   # Create new tag and push
   git tag vX.Y.Z
   git push origin main --tags
   ```

### Version Mismatch

If `--version` shows old version after release:
- `src/version.ts` was not updated
- Need to release a new patch version

## Quick Release Commands

```bash
# Full release sequence (replace X.Y.Z with actual version)
git checkout main && git pull origin main
# Edit deno.json and src/version.ts
git add deno.json src/version.ts
git commit -m "Bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
gh run list --limit 1  # Monitor workflow
```

## Publish Workflow Reference

The `.github/workflows/publish.yml` triggers on:
- Push of tags matching `v*`
- Manual workflow dispatch

Steps:
1. Checkout code
2. Setup Deno
3. Clean lock file
4. Type check (`deno check mod.ts`)
5. Run tests (`deno task test`)
6. Format check (`deno fmt --check`)
7. Lint check (`deno lint`)
8. Update version from tag
9. Dry run publish
10. Publish to JSR
