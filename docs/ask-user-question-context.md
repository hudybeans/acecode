# AskUserQuestion domain language

ACECode shares one AskUserQuestion tool across its terminal, web, and desktop surfaces. Rendering and transport differ, while validation and configured limits are shared.

## Limits

- **Question budget**: The maximum number of questions in one call, configured by `ask.max_questions`.
- **Option budget**: The maximum number of options in one question, configured by `ask.max_options`.
- **Option floor**: The fixed minimum of two options per question.
- **Over-limit request**: A model request exceeding the configured budget. Validation rejects it with the effective limit instead of truncating it.
- **Out-of-range configuration**: An integer configuration value outside the supported range. Loading clamps it to the nearest boundary and logs a warning.

## Outcomes

- **Structured question**: An interaction that presents choices and waits for an answer, skip, or cancellation.
- **Submitted answers**: The persisted ordered question-and-answer list. Skipped questions remain as unanswered items.
- **Explicit cancellation**: The user deliberately cancels without submitting answers.
- **Interjection**: A normal user message from another interaction surface ends the pending question so conversation can continue. Its persisted outcome remains distinct from explicit cancellation even when Web/Desktop presents the same cancellation text.

See [interaction decisions](ask-user-question-interaction-decisions.md) and [configurable option limit](adr/0001-configurable-ask-option-limit.md).
