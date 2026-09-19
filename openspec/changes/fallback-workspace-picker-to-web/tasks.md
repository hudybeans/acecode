## 1. 工作区目录选择回退

- [x] 1.1 在共享工作区选择函数中实现原生失败后的 Web 回退，保留原生成功、取消及补注册语义；通过工作区选择定向测试验证。
- [x] 1.2 增加失败、无效结果、取消、最终错误传播和真实路径选择宿主接线的回归覆盖；运行 `node src/lib/workspacePicker.test.js` 与路径选择相关测试验证。

## 2. 整体验证

- [x] 2.1 运行完整 `pnpm test`、`pnpm build`、严格 OpenSpec 校验与 `git diff --check`，核对初始无关改动哈希并记录验证边界。

## 验证记录

- 工作区选择的 18 个测试通过；新增用例已先在修改前复现原生错误直接抛出的问题。
- 路径选择纯逻辑、路径选择宿主、文件预览选择器及环境设置的定向测试通过。
- 完整 `pnpm test`、`pnpm build`（含正则兼容检查）、`openspec validate fallback-workspace-picker-to-web --strict`、`git diff --check` 通过。
- 初始 47 个无关修改文件的 SHA-256 保持一致；当前分支仍为 `master`。
- 验证覆盖源码、真实 Promise 宿主接线和 Web 构建；未重新构建或安装 Desktop，也未在 Linux 实机操作原生对话框。
