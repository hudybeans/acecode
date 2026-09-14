# PR #49 审查与修复

审查原始提交：`63b77f76f5edf713acb1a7cdae8b861d42c4961f`。
合入前 master：`ff5546960265fa049887b77d4a06027d31e05eee`。

## 已修复问题

1. **P1：前端测试无法启动。** `runTests.js` 导入了未提交的 `questionFeedback.test.js`，持久化测试也依赖不存在的 `questionFeedback.js`。实际运行 `pnpm test` 得到 `ERR_MODULE_NOT_FOUND`。已补齐共享反馈逻辑和测试。
2. **P1：测试中的取消数据没有真实生产来源。** `make_rejected_ask_result()` 只返回失败与英文错误文本，没有测试使用的 `ask_user_question_result.cancelled`。已在真实取消路径写入 UI metadata，并验证异步提问结果及 `format_tool_result` 持久化，同时保持 provider 输出和 TUI 文本回退不变。
3. **P1：测试要求的渲染接口不存在，取消结果也没有卡片。** 仓库实际使用 `ToolBlock` 渲染确认卡，PR 的 `renderAfterItem` 断言针对未提交的另一套实现。已沿用共享 `ToolBlock` 显示提交/取消反馈，以 React 渲染实际 JSX 验证各场景，取消卡没有无效的展开操作。
4. **P2：中断调用复用 ID 后仍可能串工具名。** 原实现只记录第一个未消费的 ID；旧调用没有结果时，新调用会继承旧名称。新增回归确实得到 `bash` 而非预期 `file_read`。现按最近前序调用更新，并在用户回合边界清理未完成映射。
5. **P2：取消卡会丢失或错误套用。** 缺少原始调用、工具改名且取消结果没有回答项时，会被折叠进活动摘要；普通工具的裸 `metadata.cancelled` 又可能被误判为问答。现仅解析命名空间下的问答结果，并以结构化反馈决定卡片是否常驻。

同时保留原 PR 的初始化列表兼容修复，并在 GitHub PR/master 工作流增加前端测试及构建。原来的绿色检查只有 C++，无法发现上述缺失模块。

## 验证

- `pnpm test`：通过，日志包含 2323 项通过记录。
- `pnpm build`：通过，产物正则兼容检查通过。
- `pnpm i18n:catalog`：重新生成中英文目录，仅增加取消反馈文案。
- Windows `MinSizeRel` 测试目标编译通过；提问、主题确认、轮次引导、工具名映射、取消结果持久化等 219 项原生回归全部通过。
- Ubuntu GCC 11：本次涉及的工具实现及测试文件 `-fsyntax-only` 检查通过。
- `openspec validate style-ask-question-result-card --strict`：变更校验通过。工具提示既有主 spec 含 delta 标题，影响后续归档；本次未执行归档。
- GitHub workflow YAML 解析通过，包含 `web-tests` 与 `unit-tests` 两个任务。
- `QueueCardList.jsx` 与 `globals.css` 的原有未提交修改按 SHA-256 核对保持不变。

本次原生验证为上述定向回归，未宣称完整 CTest 套件通过；最终 Linux 全量结果由推送后的 CI 继续验证。
