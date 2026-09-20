## Results

Validated on Windows with WebView2 152 using an isolated native window built from the repository's unchanged WebHost source and the production Web bundle. API reads were proxied to the current daemon; configuration changes were mocked, and all other writes were rejected. The user's desktop process was not restarted or replaced.

- `pnpm test`: passed, including all 13 browser-default guard tests.
- `pnpm build`: passed; generated-bundle regex compatibility check passed.
- `openspec validate fix-native-select-dropdown-dismissal --strict`: passed.
- Scoped `git diff --check`: passed.
- Physical Windows mouse input opened actual Settings language, inline Settings feedback, and standalone feedback dropdowns. Each remained open for at least 600 ms without changing its value.
- Mouse selection committed language once, with one mocked API write. Mouse and keyboard selection worked in feedback without uploading or submitting the form.
- Escape dismissed the picker while preserving its dialog and feedback draft. A second Escape closed the standalone feedback dialog. Clicking explanatory text outside the picker dismissed it without changing the selection.
- Light/dark theme screenshots were inspected. Long options wrap inside a menu bounded to its control width and viewport height; scrolling to the final option worked. Closed controls retain one line and a visible arrow for long selected labels.
- Disabled controls did not open; keyboard navigation skipped disabled options. Multiple and multirow controls retained native appearance. Removing the opt-in restored native rendering.
- The running desktop daemon's served HTML contains the new select opt-in. Reloading its window loads the fix; a new desktop executable is not required for this local runtime.

## Reproduction and scope

The native-popup dismissal also reproduced with three ordinary selects (language, document, feedback) in a standalone WebView page with no React handlers. Exact internal WebView2 dismissal cause remains unproven. Automated browser clicks did not consistently reproduce it; physical mouse opening is the acceptance check.

The user's specific document dropdown entry has not yet been identified. The shared styles cover single-choice selects in the main ACECode document on supported Windows Desktop engines; no claim is made for native file dialogs or third-party embedded documents.

The isolated native check and screenshots are in the session's temporary `ace-select-host-probe` directory, outside the repository. Other browsers, platforms, and older engines retain their existing select behavior.
