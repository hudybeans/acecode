# 电脑操控（Computer Use）

设置 → 工具 → 内置工具中的“电脑操控（实验性）”默认关闭。Windows 用户开启后，Agent 可以观察并操作本机交互桌面的应用窗口。关闭后，新请求不再暴露这组工具，正在运行的执行器终止，历史工具调用也会被拒绝。配置保存在 `computer_use.enabled`，不需要重启 daemon。

点击右侧“配置”可展开鼠标指针样式：默认是右下角带 ACE 标识的主题色指针，也可以选择纯主题色指针。两种样式均跟随当前主题的强调色，默认蓝色主题显示蓝色。选择自动保存，关闭工具时也可配置，修改样式不会开启操控。预览跟随主题即时变色，样式选择以保存成功为准；后续实际操作和截图采用已保存的样式与主题色。

样式保存在 `computer_use.pointer_style`（`ace` / `plain`），解析后的主题色保存在 `computer_use.pointer_color`（`#rrggbb`）。前端在整个应用期间同步实际主题色，支持内置、下载及自定义主题；TUI 使用最近保存的颜色。外观更新不会使当前观察失效，模型参数不能覆盖 broker 注入的指针配置。

本次参考本地 Codex 的 Windows 工具能力与接入方式，自主实现 C++ 原生后端。Codex 仓库中的 MCP 桥接代码不包含其专有 `@oai/sky` 运行时，因此这里不依赖该插件或 JavaScript REPL。

## 功能

| 工具 | 行为 |
|---|---|
| `computer_list_apps` / `computer_launch_app` | 发现、启动应用 |
| `computer_list_windows` / `computer_activate_window` | 查找、激活窗口 |
| `computer_get_window` | 按已返回的窗口标识恢复窗口，可核对应用身份 |
| `computer_get_window_state` | 截图、可访问性控件树、文字与观察标识 |
| `computer_click` / `computer_drag` / `computer_scroll` | 鼠标点击、拖拽、滚动 |
| `computer_type_text` / `computer_press_key` | Unicode 输入与快捷键 |
| `computer_set_value` / `computer_perform_secondary_action` | UI Automation 控件赋值与辅助动作 |
| `computer_release` | 释放当前会话的桌面控制 |

操作顺序是：列出窗口 → 读取窗口状态 → 根据截图或控件索引执行一个动作 → 再次读取状态。输入动作需要最新的 `observation_id`，旧观察、变化后的窗口几何与失效句柄不能继续使用。截图最长边为 2560 像素，坐标使用返回图片的像素；返回值同时提供原生尺寸、屏幕原点和缩放比例，后端负责换算。

一次观察最多返回主窗口及三个有明确归属的弹层，各图拥有独立的 `screenshot_id`、尺寸和坐标映射。多图或主图缺失时，坐标动作必须指定截图标识；动作的 `window` 仍使用这次观察的主窗口标识。菜单、下拉框关闭或移动后必须重新观察，不能继续沿用旧图。

截图作为工具附件保存，并进入支持视觉的模型请求。OpenAI 兼容接口先发送同批全部工具结果，再发送标记来源的图片消息；Anthropic 将图片放入对应的 `tool_result`。非视觉模型获得控件树和图片不可读提示，不应猜测坐标。

大型控件树进入工具结果文件时，预览开头仍保留窗口、观察标识、截图标识及坐标信息。控件索引点击会核对真实可点击点和命中元素；同一窗口内的浮层遮挡也会导致拒绝。控件树包含可用的焦点动作、选择项及文档内容。

组合键支持 Codex 文档中的 keysym 名称和常用别名，例如 `Control_L+Shift_L+period`、`Ctrl+/`、`Numpad_Add` 和 `KP_Enter`。标点快捷键使用 Windows OEM 键码，受当前键盘布局影响；需要 Shift 时应显式传入，直接输入文字应使用 `computer_type_text`。

## Windows 实现与边界

- UI Automation 用于控件信息与支持的控件动作；SendInput 用于鼠标和键盘。
- 操作时显示独立的桌面指针，包含移动和点击反馈；UIA 控件操作也显示目标位置。指针层不会抢焦点或挡住点击，回合结束、取消、关闭工具或释放执行器时清理。
- 窗口截图包含属于当前窗口的操控指针；没有操控指针时读取系统光标。各图的 `cursor` 提供 `visible`、`source`、热点坐标 `x/y`、`hotspot_x/hotspot_y` 与指针尺寸，均使用该图像素。原生合成后整体缩放，避免放大界面时光标错位；被其他窗口遮住的指针不会叠到目标截图。
- Windows.Graphics.Capture 用于窗口捕获，支持被其他窗口遮挡的目标。若当前系统或构建缺少该能力，仅在确认目标可见且无遮挡时回退到屏幕捕获，结果明确标记来源；不能可靠捕获时返回错误。
- 系统安全桌面、UAC 界面、受保护画面、应用完整性级别限制仍由 Windows 决定。某些自绘界面没有完整控件树，可以使用截图坐标。
- 每个交互桌面同一时间只允许一个 ACECode 会话控制。执行器在回合结束、取消或关闭开关时退出；主动启动的应用保留运行。
- 原生调用有 20 秒硬截止时间，输入序列包含按键或鼠标释放，超时后必须重新观察。
- 电脑操作使用现有工具审批模式，Plan 模式拒绝写操作。开关开启表示工具可用，具体动作仍遵守当前会话权限。
- macOS 和 Linux 暂不实现原生控制，设置中显示当前仅支持 Windows。

## 安装与开发

Windows 构建生成 `acecode-computer-use.exe`，必须与 `acecode.exe` 放在同一目录。CMake `computer_use_runtime` 安装组件负责交付该文件；单独复制 daemon 时也需要复制 helper。执行器只使用父进程创建的私有管道通信，不开放额外网络端口。

当前 MSVC + Windows SDK 构建可使用 WGC；缺少 C++/WinRT 头的工具链使用明确标记的可见屏幕回退。构建与测试方式见根目录开发指南。

原生集成验证使用专门的可丢弃窗口：构建 `computer_use_native_smoke`，传入 `--observe-owned-window` 检查窗口发现、应用启动、遮挡截图、缩放、密码字段、弹层归属和控件命中；传入 `--run-owned-window` 继续检查鼠标键盘、控件操作和真实 OLE 拖放。后者需要测试窗口能获得前台焦点，系统搜索菜单等界面可能阻止激活，此时明确失败，不向错误窗口发送输入。可用 `--wait-for-foreground` 等待用户点击测试窗口标题栏后执行，超时自动结束。独立的 `computer_use_broker_smoke` 使用私有假执行器验证超时、取消、并发租约和大响应，不接触桌面。

`--run-owned-window-via-helper` 通过生产 broker、真实独立执行器和私有管道运行同一套完整检查，不回退到进程内调用。它验证中文与补充平面字符输入、辅助控件动作、菜单/下拉框选择、画布对象最终位置、OLE 目标 payload，以及可用显示器和缩放截图的实际坐标点击。测试窗口结束时销毁，不把事件已入队当作动作已完成。主题指针验证覆盖本次可用的一台显示器及 3000 像素窗口缩放；负原点等布局另有坐标单测覆盖。测试同时核对系统光标、UIA/点击后的可见桌面指针、PNG 指针热点及缩放一致性，并检查 ACE / plain 在默认蓝色和指定主题色下的实际 PNG 像素，截图保存到系统临时目录。

## 设置 API

`GET /api/config/computer-use` 返回：

```json
{"enabled":false,"supported":true,"platform":"windows","pointer_style":"ace","pointer_color":"#2563eb"}
```

`PUT /api/config/computer-use` 接收 `enabled`、`pointer_style`、`pointer_color` 的任意子集，返回保存后的同结构对象；未传入的字段保持原值。例如 `{"pointer_style":"plain"}` 只修改样式。`enabled` 必须是布尔值，样式只能为 `ace` 或 `plain`，颜色必须为六位 `#RRGGBB` 并以小写保存。需要现有 daemon 身份认证；非法字段返回 `400 BAD_REQUEST`。非 Windows 开启返回 `400 COMPUTER_USE_PLATFORM_UNSUPPORTED`，但可保存外观；保存失败不改变已确认的运行时配置。UI 以服务端确认值显示状态，网络结果不确定时重新读取，避免把失败的关闭或样式保存显示为成功。
