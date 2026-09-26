## Why

The user reports that LIUXIN557's latest sidebar changes have an excessive impact on the interface and requests a rollback. PR #65 introduced those changes in merge commit `398f906c3b77d31d7d2967e4c3bb122b9a358c26`; the adjacent PR #67 changes the development launcher and is outside this rollback.

## What Changes

- Reverse the net changes from PR #65 against its first parent, restoring the previous sidebar spacing, alignment, disclosure controls, workspace actions, menu labels, and four-dot running indicator.
- Restore the corresponding onboarding steps, regression tests, and motion checker; remove the preview and design document introduced only by PR #65.
- Regenerate the localization catalog for the restored UI text while preserving subsequent independent changes, including tool preambles and queue behavior.
- Record the rollback as a new local commit on the current branch, preserving Git history.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `webui-custom-sidebar`: Restore the sidebar presentation and workspace interactions from the first-parent baseline of PR #65.

## Impact

The 19 paths changed by PR #65, the generated source catalog and any required English overrides, and this OpenSpec change. No daemon protocol or dependency changes are needed. Existing release packages are not rebuilt or published by this change.
