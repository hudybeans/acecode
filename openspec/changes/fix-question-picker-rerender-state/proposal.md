## Why

同一次 AskUserQuestion 因后台事件重新渲染时会清空答案并跳回第一题。PR #72 修复了请求识别，但新增的 useMemo 位于认证提前返回之后，认证完成时会改变 Hook 数量并导致界面崩溃，需要在合并前修正并补齐回归覆盖。

## What Changes

- 保留 PR 中按请求 UUID 重置、同请求重新渲染保留答案的修复。
- 将可见问题的 useMemo 放到所有认证提前返回之前，确保启动、输入 token 和认证成功使用一致的 Hook 顺序。
- 增加认证切换的回归检查，验证问题让位于权限请求和回答状态隔离。

## Capabilities

### New Capabilities

- `desktop-ask-user-question-ui`: 明确同请求状态保留、新请求重置及认证状态切换时的可用性；当前主规范尚未归档该能力，沿用现有变更中的能力名称。

### Modified Capabilities

无。

## Impact

影响 web/src/App.jsx、QuestionPicker 现有回归测试及 PR 审查记录；不改变 daemon 协议、不增加依赖。
