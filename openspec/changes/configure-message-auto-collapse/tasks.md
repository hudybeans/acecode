## 1. 外观配置
- [x] 1.1 新增默认开启的配置字段、API 校验与落盘、Desktop 注入，补齐 API 文档及配置/API 测试。
- [x] 1.2 接入前端偏好保存与回滚，在外观添加“会话 / 消息自动折叠”，补齐英文与默认值/持久化测试。

## 2. 共享消息显示
- [x] 2.1 主会话和子代理接入共享投影开关，关闭非工具折叠并保留工具配对、总结、运行状态与特殊分组入口，覆盖投影测试。

## 3. 验证
- [x] 3.1 完成定向后端验证、前端全量测试/构建、浏览器检查默认/关闭/恢复、中文/英文/窄屏，严格规范验证与差异检查。

验证记录：
- C++ `acecode_unit_tests` MinSizeRel 构建通过；配置、UI preferences API 及启动主题并发保护共 31 项定向测试通过。
- `pnpm test` 2566 项通过，`pnpm build` 通过，`openspec validate configure-message-auto-collapse --strict` 与 `git diff --check` 通过。
- 浏览器使用真实 SettingsPage、共享投影/TranscriptItems、SubagentPanel 和外观保存控制器，API 使用隔离数据。确认默认折叠、关闭后正文展开、单个工具展开/收起、图片显示、子代理导航、系统通知正文、运行状态、重新开启、保存失败回滚及刷新恢复关闭值。
- 中英文、明暗主题、390px 窄屏及 reduced-motion 检查通过；选项字重 400、一级标题 600，无设置面板横向溢出。未重建或安装 Desktop 包。
