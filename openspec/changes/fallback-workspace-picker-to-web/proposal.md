## 为什么

Desktop 原生目录选择器不可用时（例如 Linux 缺少 zenity/kdialog），首页“打开现有目录”和侧栏“添加项目”目前直接报错。已有的 Web 目录选择器可以完成同一操作，应作为原生选择失败后的自动回退路径。

## 变更内容

- 保持原生目录选择优先；原生调用失败、返回错误或无法使用的结果时，自动打开现有 Web 文件夹选择器。
- 原生选择被用户取消时直接结束；成功选择仍按现有逻辑返回工作区。
- Web 回退继续通过现有工作区注册接口完成打开目录，取消无副作用，选择器或注册失败仍交给调用方提示。

## Capabilities

### New Capabilities

- `workspace-picker-fallback`: 工作区原生目录选择失败后的 Web 回退、取消与错误传播契约。

### Modified Capabilities

无。现有主规范尚未覆盖目录选择器回退；本变更新增对 `add-web-path-picker` 中 Desktop 始终走原生路径的失败恢复规则。

## 影响范围

- `web/src/lib/workspacePicker.js` 及现有回归测试。
- 首页与侧栏通过共享函数自动获得回退能力，不需要修改组件、弹窗样式、Desktop bridge 或后端接口。
