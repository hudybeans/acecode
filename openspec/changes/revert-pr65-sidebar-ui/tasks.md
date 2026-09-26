## 1. Restore the prior sidebar

- [x] 1.1 Reverse PR #65's first-parent merge delta and verify that the rollback patch exactly matches its inverse while preserving later changes in shared files.
- [x] 1.2 Regenerate the restored static-copy catalog, adding English overrides only where needed; verify the catalog diff contains only relevant restored and removed text.

## 2. Verify and record the rollback

- [x] 2.1 Run `pnpm test`, `pnpm build`, the existing loading-motion browser check when available, strict OpenSpec validation, and `git diff --check`; record results and any runtime coverage limitation.
- [x] 2.2 Create a scoped local revert commit and verify its file list, current branch, and final working-tree status.
