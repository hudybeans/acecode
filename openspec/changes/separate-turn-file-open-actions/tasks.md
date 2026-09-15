## 1. Implement independent actions

- [x] 1.1 Make the row open file content and provide a separate native change action, keeping both ChatView placements connected to their preview callbacks; verify the existing turn-file regression tests and independent browser click behavior.
- [x] 1.2 Restore original row styling and “打开”, show muted “查看变更” plus arrow on hover with underline only on that action, and translate the labels; verify catalog generation and browser checks for long paths, narrow widths, keyboard activation, folding and both themes/locales.

## 2. Validate integration

- [x] 2.1 Run pnpm test, pnpm build, strict OpenSpec validation and git diff --check; record results in design.md.
