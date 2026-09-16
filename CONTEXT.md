# ACECode Interaction Language

ACECode across terminal, web, and desktop surfaces uses shared language for structured question interactions and their outcomes.

## Language

**Structured question**:
An AskUserQuestion interaction that presents one or more choices and waits for the user to answer, skip, or cancel.
_Avoid_: Questionnaire, popup question

**Submitted answers**:
The persisted question-and-answer list produced when the user completes a structured question. Skipped questions remain part of the list as unanswered items.
_Avoid_: Completion card, submission card

**Explicit cancellation**:
The outcome produced when the user deliberately cancels a structured question without submitting answers.
_Avoid_: Rejection, failed submission

**Interjection**:
A normal user message received from another interaction surface while a structured question is waiting, which ends that question so the message can continue the conversation. It remains distinct from explicit cancellation even when a surface presents both outcomes as a cancelled answer.
_Avoid_: Explicit cancellation, submitted answer
