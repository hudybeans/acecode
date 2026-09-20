# Windows Computer Use 对照

参考来源为本机 Codex 仓库的 MCP/回合结束接入，以及本机已安装的 `openai-bundled/computer-use/26.915.31945/docs/api.md` 与 `docs/guidance.md`。后两份文档描述 `@oai/sky` 的 Windows API；插件发布物没有原生实现源码，因此以公开接口行为和可验证的运行结果为对照，不能声称原生算法完全相同。

| Codex 行为 | ACECode 实现与尚需验证的内容 |
|---|---|
| list_apps / launch_app / list_windows | 已实现并统一已安装应用与运行窗口身份；AUMID/唯一可执行路径匹配测试通过，歧义路径不猜测。 |
| get_window | 已实现；自有窗口验证按已知标识恢复、核对应用身份及拒绝错误应用。 |
| get_window_state | 已验证 WGC、遮挡捕获、缩放与控件树；主窗加最多三个有明确归属的弹层具备独立截图/坐标，owned popup、标准菜单及 ComboBox 真实捕获通过。 |
| focused_element / selected_text / selected_elements / document_text | 已实现焦点、选中文字、选中控件及可见相关文档；真实 ListBox 选中项和文档优先级测试通过。 |
| click | 已有坐标/元素、双击和三种按钮；真实坐标与元素点击、弹层项目选择、UIA 可点击点及同窗口浮层遮挡拒绝实测通过。 |
| press_key / type_text | 已有组合键、Unicode、文档所列标点与数字键盘别名；键码/扩展标志测试和真实组合键、中文、补充平面字符输入通过。 |
| scroll / drag | 真实滚轮改变自有画布内容位置、拖拽对象到目标坐标、OLE 目标接收到预期 payload 均通过。 |
| set_value / perform_secondary_action | 已有 Value、Invoke、Toggle、Select、Expand/Collapse、Scroll、Focus；真实赋值、焦点、切换、选择、展开/收起和调用均核对控件结果。 |
| activate_window | 使用原生激活并核对实际前台，真实 fixture 激活通过；系统拒绝焦点或存在按住的输入时明确失败。 |
| 多显示器/截图坐标 | 8 项映射测试覆盖负原点、逐图独立缩放、边界和溢出；本机全部可用显示器（1 台）及 3000 像素窗口缩放后的实际坐标点击通过，多屏硬件组合未实测。 |
| 回合结束释放 | 独立执行器和会话租约已接入，超时/取消/关闭/并发测试通过。 |
| 截图反馈模型 | OpenAI 兼容与 Anthropic 多图来源标签测试通过；大控件树落盘后保留各图关键操作字段，中间图片失效不会使后续图片错配。 |

ACECode 使用内置 C++ 工具与私有 helper 管道，接入自身开关、权限模式和模型协议。此次范围为 Windows，macOS/Linux 不开启这项能力。

同一套原生 fixture 已通过直连与生产 broker/helper 两条路径；helper 模式不允许回退为进程内调用。测试用自有可丢弃窗口，验证实际控件状态、画布坐标和 OLE 传输结果。当前工具参数仍有明确边界：点击次数为 1 或 2，每次动作必须使用新观察，多图坐标必须明确目标。
