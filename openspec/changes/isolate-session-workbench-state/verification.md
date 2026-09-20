# 验证记录

本次在 `master` 上实现，起点为干净的 `b973acec`，没有发布或替换用户正在使用的 Desktop。

## 自动化

- `web`：`pnpm test` 完整通过，包括新增会话存储、A 五页签/B 两页签、同名文件编辑、重排、关闭/关闭其他/关闭右侧/全部关闭、外来页签动作、后台页签移除不抢激活、Git owner/迟到请求、终端过滤和恢复测试。
- C++：`cmake --build build --config Release --target acecode_unit_tests -- /m:2 /nologo` 成功。
- `PtySessionRegistryTest.*:PtyControlFrameTest.*`：11 项通过；真实 shell 验证 owner 过滤、移交 PID 不变、订阅输出继续送达、移交后迟到创建、独立关闭。
- `WebServerHttp.PtyOwnerProtocolFiltersAndTransfersWithoutRestart`：真实本地 HTTP 服务和 shell 测试通过，覆盖创建、过滤、移交、迟到创建和拒绝无效移交。
- 新增英文文案来自 `web/scripts/i18n-en-overrides.mjs`，通过 `pnpm i18n:catalog` 生成。
- 最终 `pnpm build` 通过，生产 bundle 的正则兼容性检查通过。
- `openspec validate isolate-session-workbench-state --strict --no-interactive` 与 `git diff --check` 通过。

## 浏览器操作

Chromium 加载实际 Vite/React 页面；API、原生浏览器桥和 WebSocket 使用隔离夹具，不访问用户真实文件或会话。

- 同 cwd：A 五页签 → B 空 → B 两页签 → A 五页签；顺序、激活项、同名文件独立，B 关闭不影响 A。
- 编辑：取消留在原位置；保存失败保留草稿与会话；保存成功再切换；不保存恢复磁盘基线；聊天草稿 A/B 独立。
- 文件浏览：文件滚动/选区、树展开/滚动恢复；选中项位于可视区外时不覆盖已保存滚动；迟到目录响应不进入 B。
- 面板：A/B 宽度、最大化、隐藏状态分别恢复。
- Git：基线 A=dev/B=HEAD，栏目、目录折叠、全部 diff 折叠、单双栏与滚动分别恢复。
- 终端：tab/选中项独立，切换保留同一个 xterm DOM 与连接；后台标题更新、迟到创建只进入原会话；关闭 B 不删除 A；刷新按 owner 恢复且不重复创建。
- 新建：临时页签和终端只交给刚创建的会话，已有 A/B 保持原样；纯状态测试验证下一次新建轮换临时 owner。
- 原生浏览器桥：手动/自动切换遵守未保存确认；后台 A 页面事件不进入 B；返回时保留用户选中的文件。
- 跨工作区：另一 cwd 的会话独立从空页签开始，回到来源会话恢复原状态；取消工作区切换时没有调用原生激活。
- 中文、英文以及 390px / reduced-motion 下三按钮文案和弹窗边界通过，没有页面异常。

## 验证边界

浏览器测试证明前端交互与桥接调用；真实进程和 HTTP 协议由 C++ 测试覆盖。本次没有重新打包、安装或启动新版原生 Desktop，因此不把上述结果表述为已安装客户端验收。
