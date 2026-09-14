---
id: theme-surfaces-001
scope: 主题图标色、首页标题色与背景通顶
status: done
depends-on: [theme-management-001]
---

# objective
落实用户新增的三个主题参数及深色通顶白色按钮，并与已实现的主题导出删除一起交付。

# context
- openspec/changes/configure-theme-surfaces/proposal.md
- openspec/changes/configure-theme-surfaces/design.md
- openspec/changes/configure-theme-surfaces/specs/theme-surfaces/spec.md
- docs/themes.md
- docs/daemon-api.md

# ownership
后台作者负责主题校验、草稿/工具、内置技能和相关测试；Web 作者负责主题解释、两个图标及标题栏/首页标题与相关测试；主代理负责契约、文档和协调，独立代理复核。保持当前 master 与既有工作；分别保存本轮基线。共享 CMake 和 Web 构建按交接顺序运行。

# verification
严格数据校验与确认回归、主题包 round trip、Web 行为及实际源渲染测试、完整 pnpm test/build、聚焦 C++ 测试、独立新增量审查、OpenSpec strict、diff check、最终应用构建。真实浏览器环境缺少可信 worker 模块，视觉检查记录为未验证；不修改用户运行中的 daemon。

# evidence
- 用户新增要求已明确授权实施，当前主题 schema 和共享 UI owner 已读。
- 新增 OpenSpec `configure-theme-surfaces` 与既有 `manage-custom-theme-packages` 严格校验均通过。
- 先前主题管理 Web 2233 项、原生聚焦 60 项通过，两份独立审查无阻塞；本轮最终应用包含该部分与新增外观参数。
- 后台参数/草稿/工具/技能已实现并通过独立静态复核，seed revision 为 `2026-09-12.2`。MinSizeRel 测试目标构建成功，聚焦 71/71 通过（14 suites，10.738s，无跳过）；日志为 `build/theme-surfaces-native-build-20260912.log` 与 `build/theme-surfaces-native-tests-20260912.{log,xml}`。
- Web 参数解释、共享静态 SVG/动态图标、首页标题与通顶渲染已完成；完整 `pnpm test` 2249 项通过、0 失败，`pnpm build` 3037 模块/22.95s，4435 正则兼容检查及 i18n audit 通过。日志为 `build/theme-surface-web-baseline-20260912/{web-test.log,web-build.log,i18n-audit.log}`。
- [独立复核](../reviews/theme-surfaces-001.md) 结论 pass，无遗留阻塞；另独立运行 31 项轻量检查通过，并核验后台 22/Web 16 文件基线及最终 15/12 文件哈希。一次 detector 共 12 项：11 项原规则未变，另一项是既有 logo 网格的颜色参数化，结构保留，无新增阻塞。真实浏览器布局、GPU 视觉和系统另存为交互仍未实机验证。
- 最终 `cmake -S . -B build` 与 `cmake --build build --config MinSizeRel --target acecode acecode-desktop --parallel 4`、产物校验和 `--version` 均退出 0。程序位于 `build/MinSizeRel/`，版本输出 `acecode v0.9.14`。Web 冻结产物经 4 处版本占位替换后，完整 12,246,887 字节已在新 `acecode.exe` 中核实；旧 Release 两程序 SHA 未变。日志/退出码与产物明细见 `build/theme-surfaces-final-status-20260912.json`、`build/theme-surfaces-final-artifacts-20260912.json`。
- 最终两个 OpenSpec change 严格校验及全工作区 `git diff --check` 通过；实现保留在当前 master，未提交或发布。
