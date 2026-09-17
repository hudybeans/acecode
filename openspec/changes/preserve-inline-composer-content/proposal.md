## Why

Files and skills cannot consistently stay between the words that refer to them: uploaded attachments are moved to the beginning and skill selection only works at the start. Plain-text drafts and separate attachment arrays lose that order when sending or restoring input.

## What Changes

- Preserve an ordered, versioned composer content model through editing, drafts, queueing, history/fork restoration, and sent-message rendering.
- Insert files and skills at the caret, keep attachment positions stable across upload updates, and support atomic deletion, undo, and clipboard operations.
- Reuse Slate, existing compact tags, attachment storage, and explicit skill activation; preserve legacy plain-text messages and builtin command routing.
- Extend message/draft APIs with validated composer content and expose canonical skill references.

## Capabilities

### New Capabilities
- `ordered-composer-content`: End-to-end ordered text, file, attachment, and skill references in the shared Web/Desktop composer.

### Modified Capabilities
None. This supersedes the fixed-leading attachment and leading-only skill limitations of the earlier unarchived composer changes.

## Impact

Shared React composer and message renderer, draft/history/queue helpers, session message and draft routes/storage, skill command catalog, focused JS/C++ tests, and daemon API documentation. No new editor dependency or TUI interaction change.
