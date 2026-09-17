## 1. Persist saved model order

- [x] 1.1 Add authenticated order persistence through settings mutations and document the API; verify permutation validation, profile/default preservation, no-op behavior, and persistence failure with focused C++ tests and compilation.

## 2. Enable list interactions

- [x] 2.1 Implement full-list reorder helpers and pointer/keyboard interactions with insertion feedback and edge scrolling; verify filtered moves, no-op moves, cancellation, and existing controls with focused tests and browser checks.
- [x] 2.2 Integrate optimistic save, rollback, picker refresh, and localized copy; verify success/failure and reload behavior with browser checks and the i18n audit.

## 3. Validate integration

- [x] 3.1 Run frontend tests/build, strict OpenSpec validation, and diff checks; record results and native desktop verification limits.

## 4. Refine drag presentation

- [x] 4.1 Make the complete model card follow the pointer without changing its size or grab offset; verify card/handle dragging, stationary source geometry, scrolling, input isolation, and cleanup in Chromium, then run frontend tests/build and scoped validation.
