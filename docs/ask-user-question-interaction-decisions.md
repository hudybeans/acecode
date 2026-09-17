# AskUserQuestion interaction decisions

This document records the agreed prototype changes for ACECode Desktop/Web. It describes the intended user-visible behavior; it is not an implementation plan.

## Pending question

- The pending question replaces the normal composer in the same composer dock. It must not overlay or coexist with the composer.
- Its left and right edges align exactly with the normal composer card.
- It uses the main UI font-size tokens and the composer's compact visual density rather than fixed, oversized typography.
- The header allows the question text to wrap while progress and navigation controls remain visible.
- The header and footer remain fixed when content is tall; only the options region scrolls.
- The footer uses compact, right-aligned actions.
- When collapsed, the pending question becomes one header row containing the pending-question count, current progress, and expand control. There is no second “继续回答” row.
- Desktop does not expose a separate “直接输入” action while a question is pending. The user must cancel the question or answer through the custom option.

## Submitted answers

- A completed AskUserQuestion uses the existing `AskUserQuestion` activity/tool line as its only result header.
- Submitted answers are collapsed by default, including after history reload.
- The entire activity line toggles the answer details and remains keyboard accessible through the existing activity-line interaction.
- Expanded answers appear as a compact inline list directly beneath the activity line.
- The inline list has no independent result heading, summary row, rounded card, success badge, or outer border.
- Questions remain in their original order. Skipped questions are retained and display the muted text “未作答”.
- The independent feedback-card presentation, including “全部提交完成” and “已回答 4/5”, is removed.

## Cancelled answer

- Explicit cancellation keeps a non-expandable `AskUserQuestion` activity/tool line.
- Muted plain text “用户已取消回答” appears directly beneath the activity line.
- Results produced by interjection on another interaction surface use the same Desktop/Web presentation text, while the persisted domain outcome remains an interjection.
- Cancellation has no card, large icon, or expand control.

## Unchanged behavior

The redesign does not change single-select, multi-select, custom-answer, skip, question navigation, copy, or keyboard semantics.

## Validation matrix

Validate all states in:

- normal and near-minimum chat-pane widths;
- compact, default, and large UI font-size modes;
- light and dark themes;
- long questions, many options, long submitted answers, and skipped questions.
