---
name: branch-strategy
description: Guide for branch naming conventions and Git workflow. Use when creating branches, making PRs, or asking about Git workflow.
argument-hint: "[branch-type] [description]"
---

# Branch Strategy: GitHub Flow (Simplified)

This project uses a simplified GitHub Flow optimized for individual development with JSR package releases.

## Branch Structure

```
main (default, protected)
  |
  +-- feature/xxx    # New features
  +-- fix/xxx        # Bug fixes
  +-- docs/xxx       # Documentation updates
  +-- refactor/xxx   # Code refactoring
  +-- test/xxx       # Test additions/improvements
  +-- chore/xxx      # Maintenance tasks
```

## Branch Naming Convention

Format: `<type>/<short-description>`

| Type | Purpose | Example |
|------|---------|---------|
| `feature` | New functionality | `feature/add-parallel-execution` |
| `fix` | Bug fixes | `fix/batch-size-validation` |
| `docs` | Documentation only | `docs/update-api-reference` |
| `refactor` | Code restructuring | `refactor/simplify-error-handling` |
| `test` | Test improvements | `test/add-integration-tests` |
| `chore` | Maintenance, deps | `chore/update-dependencies` |

### Naming Rules

1. Use lowercase letters, numbers, and hyphens only
2. Keep descriptions short (2-4 words)
3. Use present tense verbs (add, fix, update, remove)
4. Reference issue numbers when applicable: `fix/issue-123-login-error`

## Workflow

### Creating a Branch

```bash
# From main branch
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### Committing Changes

```bash
# Stage specific files (preferred over git add -A)
git add src/file1.ts src/file2.ts

# Commit with descriptive message
git commit -m "Add parallel execution support for batch mode"
```

### Creating a Pull Request

```bash
# Push branch to remote
git push -u origin feature/your-feature-name

# Create PR via GitHub CLI
gh pr create --title "Add parallel execution support" --body "## Summary
- Implemented parallel execution for batch mode
- Added configuration option for concurrency level

## Test plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed"
```

## Main Branch Rules

1. **Always releasable**: main must pass all CI checks
2. **No direct pushes**: All changes via Pull Request
3. **CI required**: Merges blocked until CI passes
4. **Squash merge preferred**: Keep history clean

## Release Process

1. Merge PR to main
2. Update version in `deno.json`
3. Create and push tag:
   ```bash
   git tag v0.1.9
   git push origin v0.1.9
   ```
4. JSR publish triggers automatically (or manually via `deno publish`)

## Quick Reference

```bash
# Check current branch
git branch --show-current

# List all branches
git branch -a

# Delete merged branch locally
git branch -d feature/completed-feature

# Delete remote branch
git push origin --delete feature/completed-feature
```

## When to Use Each Type

- **feature/**: Adding new CLI options, new execution modes, new log formats
- **fix/**: Correcting bugs, fixing edge cases, resolving issues
- **docs/**: README updates, adding examples, API documentation
- **refactor/**: Improving code structure without changing behavior
- **test/**: Adding missing tests, improving test coverage
- **chore/**: Dependency updates, CI configuration, tooling changes
