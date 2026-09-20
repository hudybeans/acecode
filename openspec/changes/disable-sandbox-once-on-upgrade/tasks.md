## 1. 配置迁移

- [x] 1.1 实现迁移标记读取与保存、串行化原子迁移及共享启动入口集成，审查确认标记与开关一起写入且环境变量不被写回。
- [x] 1.2 添加迁移、重新启用后重复启动、其他设置保存、未知字段保留、并发及失败重试测试，运行相关 C++ 测试通过。

## 2. 文档与验证

- [x] 2.1 更新沙盒文档说明首次关闭及用户重新启用的持久行为，核对与实现一致。
- [x] 2.2 运行配置与安全相关回归、OpenSpec 严格校验及 git diff --check，并记录验证范围。

## 验证记录

- [x] 发布集成：将共享启动迁移依赖加入 `acecode_native_bridge_support`，验证 Desktop 与 CLI 完整链接及配置迁移回归。

- Windows MSVC MinSizeRel：`cmake --build build --config MinSizeRel --target acecode_unit_tests --parallel 4` 通过。
- `tests/config/` 全部测试套件及 `SecurityHandler`：57 个套件、336 项测试全部通过。覆盖真实 `load_config()` 启动入口及环境变量不落盘。
- 旧测试 `RuntimeSkillAllowlistIsNeverPersisted` 在再次启动加载前关闭文件读取句柄，以允许 Windows 原子替换；原有业务断言保持不变。
- `openspec validate disable-sandbox-once-on-upgrade --strict`、`git diff --check` 通过。
- 本次完成源码与原生测试验证，未打包或发布安装包。
