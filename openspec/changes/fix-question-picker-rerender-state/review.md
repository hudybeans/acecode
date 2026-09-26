## 审查结论

PR #72 原始修复按请求 UUID 保留回答的方向正确；审查发现并修复一项 P1 启动回归。

## 问题与修复

原 PR 将 App 的 visibleQuestionReq useMemo 放在 authState 为 checking / need-token 的提前返回之后。从启动检查或 token 提示进入已认证状态时，React 发现本次调用的 Hook 数量增加并抛出 Rendered more hooks than during the previous render。

修复将 memo 移到依赖计算之后、所有认证提前返回之前，保持权限优先级和引用复用。新增基于生产 App 语法树的 Hook 顺序回归，并扩展同请求重新渲染保留自定义草稿的回归。

## 验证

- 新增 Hook 顺序检查在原 PR 上失败，在修复后通过。
- 从生产 App 提取认证分支与 memo 顺序，在 Chromium 和真实 React 18 中验证：修复前复现 Hook 数量错误；修复后 5 次认证状态切换和 2 次权限优先级检查通过，无页面错误。此验证聚焦真实 React 的认证控制流，不代表完整桌面壳验证。
- PR 快照 pnpm test 通过，日志含 2784 条 pass；pnpm build 及 4478 个正则兼容检查通过。
- 初次与 master c0f212ed 合并后的构建通过；318 个测试文件中仅 sidebarAlignmentArchitecture.test.js:22 失败，与未合并的 master 完全一致（旧断言 gap-0，已提交界面 gap-2）。远端 CI 也确认同一失败，因此同步 master 并将这条断言对齐到 gap-2；最终 pnpm test 全部通过（2877 条 pass 记录）；构建使用相同运行时代码的合并快照，测试和文档调整不影响已通过的构建。
- 原 PR 的 C++ 测试改动用于验证不存在的 workspace 会话返回 404；生产路由的归属检查与此一致。本次追加修复不修改 C++；原 head 4111ad0f 的远端 unit-tests 已通过。
- OpenSpec strict 通过；修复提交与远端最终 CI、合并状态另见 PR 评论。
