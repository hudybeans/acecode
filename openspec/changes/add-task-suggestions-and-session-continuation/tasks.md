## 1. Durable suggestions and reminder policy

- [x] 1.1 Add scoped durable suggestion storage, validation, deduplication and atomic acceptance; verify persistence, dismissal, limits and concurrent-claim unit tests.
- [x] 1.2 Count successful summary checkpoints with repair/fork handling and generate once-per-session reminders; verify manual/auto/failure/restart/fork policy tests.
- [x] 1.3 Configure the continuation threshold (default three, zero disabled) and preserve settings serialization; verify configuration tests.

## 2. Session startup and continuation

- [x] 2.1 Implement idempotent suggestion startup and retry/recovery with persisted target/input identity; verify duplicate and partial-failure tests.
- [x] 2.2 Preserve actual cwd, worktree and effective configuration, queue shared-directory work, and create isolated worktrees from pinned commits; verify busy/worktree/dirty/base tests.
- [x] 2.3 Build bounded current handoffs with structured source references and pause source automatic execution after transfer; verify recent progress, goal/background boundaries and retained history.

## 3. Tools and HTTP contract

- [x] 3.1 Register bounded suggest/dismiss tools and capability guidance without automatic task launch; verify tool schema and service-dispatch tests.
- [x] 3.2 Add authenticated session-scoped list/accept/dismiss routes and document payloads, statuses and recovery; verify API tests or daemon smoke checks.

## 4. Web and desktop cards

- [x] 4.1 Add themed accessible suggestion cards with location selection, queued/error/retry states and target links; verify interaction and narrow-screen behavior.
- [x] 4.2 Scope asynchronous state to the source session, handle old backends and prevent duplicate acceptance; verify controller race and lifecycle tests.
- [x] 4.3 Add Chinese/English copy and regenerate the localization catalog; verify catalog generation, pnpm test and pnpm build.

## 5. Integrated validation

- [x] 5.1 Build native changes and execute focused native tests plus appropriate broader checks; review failures and document any platform limitations.
- [x] 5.2 Review end-to-end behavior and final diff, run strict OpenSpec validation and git diff --check, and reconcile the completed tasks with actual evidence.

## 6. 建议卡片 30 秒自动关闭

- [x] 6.1 控制器维护独立截止时间，复用关闭接口，处理轮询、接受、失败及销毁竞态，并补充可控时钟测试。
- [x] 6.2 按确认视觉实现进度条左上方“xx秒后关闭”、细线与微光端点，适配减少动态效果和中英文。
- [x] 6.3 验证桌面及 390px 中英文／明暗／减少动态效果，运行前端测试、构建、严格 OpenSpec 校验及差异检查。
- [x] 6.4 将端点微光调整为克制的小火苗闪动，验证普通／减少动态效果、明暗主题及前端测试构建。
- [x] 6.5 修复任务位置下拉菜单缺失背景和层级，验证明暗主题、窄屏、中英文以及选择和 Escape 焦点恢复。

### 本次追加验证（2026-09-19）

- 20 项建议控制器测试通过，新增覆盖两类建议到期关闭、轮询不重置、独立截止时间、接受与到期竞态、关闭失败、状态变化、重复关闭、延迟调度及销毁。
- 完整 `pnpm test` 通过（2559 条通过记录），`pnpm build`、中英文目录生成及严格 OpenSpec 校验通过，`git diff --check` 无错误。
- 真实组件与生产样式搭配模拟 API 的 Chromium 检查共 19 项通过：1100px／390px、中英文、明暗主题、普通／减少动态效果的 16 种组合，以及临界接受、关闭失败、切换会话 3 项交互。已核对真实截图中文案位于进度条左上方。
- 本次仅验证前端与浏览器，未重建桌面安装包，未运行原生平台打包验证。
- 小火苗追加验证：8 项 Chromium 组合检查通过（1100px／390px、明暗主题、普通／减少动态效果），实测外焰形变和双层明暗变化、减少动态效果时静止且无光晕，无横向溢出；已核对实际动画帧，完整 `pnpm test` 和 `pnpm build` 再次通过。
- 下拉菜单追加验证：修复前实际计算样式为透明背景、无边框／圆角／阴影且层级为 auto，菜单项目被底层卡片遮挡。补齐调用方容器样式后，8 项 Chromium 组合检查通过（1100px／390px、明暗主题、中英文），验证实底、边框、阴影、层级、点击命中、切换位置不启动任务及 Escape 恢复焦点；完整前端测试、构建通过。

## 原有实现验证记录

- Windows Release builds passed for `acecode`, `acecode-desktop`, and `acecode_unit_tests` in `build/task-suggestions`; the latest Web bundle is embedded.
- 496 native tests passed across suggestion, handoff, compaction, worktree, configuration, model binding, session persistence, and HTTP integration suites. The production dispatch path runs a fake provider through the real AgentLoop; no live provider account was used.
- The test-only WorkerGate lifetime race was identified from CDB thread stacks and fixed with callback-owned shared state. The affected worktree case then passed five repetitions before the complete selected suite passed.
- `pnpm test`, `pnpm build`, and localization catalog generation passed. Twelve browser interaction checks passed with the actual card component, production styles, and mocked HTTP responses, including themes, 360px layout, keyboard navigation, cancel/retry, and stale-response handling.
- Strict OpenSpec validation and `git diff --check` passed. macOS/Linux native builds, live model quality, and installer publication were not performed.
