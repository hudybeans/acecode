## 1. 全局查询实现

- [x] 1.1 扩展全局目录的归档及子代理包含选项，并用目录测试验证默认过滤不变。
- [x] 1.2 将列表、读取和等待接入全局查询，加入工作区属性、归档参数及列表分页，用隔离数据目录的跨工作区测试验证。
- [x] 1.3 更新工具描述、schema 和协议文档，通过工具入口测试核对参数实际传递。

## 2. 集成验证

- [x] 2.1 完成 C++ 定向构建，运行 thread 工具和全局目录/搜索相关回归测试，记录结果。
- [x] 2.2 运行 OpenSpec 严格校验及 git diff --check，核对原有无关改动未被修改。

验证记录：`cmake --build build --config MinSizeRel --target acecode_unit_tests --parallel 4` 成功；`ThreadTools.*:GlobalSessionCatalog.*:GlobalSessionCatalogIndex.*:GlobalSessionSearchService.*` 共 21 项测试通过，结果记录在 `build/thread-discovery-tests.xml`。此次未重新打包或替换正在运行的 ACECode。

`openspec validate globalize-thread-discovery --strict` 与 `git diff --check` 通过；原有 13 个修改或未跟踪文件的 SHA-256 均与实施前一致。
