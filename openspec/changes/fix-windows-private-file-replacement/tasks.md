## 1. 修复与验证

- [x] 1.1 添加受限父目录的真实 Windows 文件系统回归，确认旧实现失败。
- [x] 1.2 为当前用户补齐文件 DELETE 权限，运行回归通过。
- [x] 1.3 运行原生测试、MCP 守护进程检查和 CLI/Desktop 构建，严格校验变更。

## 验证记录

- 新增回归在旧实现的首次私有写入处失败，修复后通过；确认受保护 DACL 仅保留当前用户并含 DELETE。
- MinSizeRel CLI、Desktop、原生测试构建通过。重发、插话、MCP、配置迁移和权限定向测试 31 项通过。
- Windows 完整原生检查共 4,637 项通过、8 项按平台或显式网络/通知开关跳过，另有 1 项原有禁用测试。隔离测试使用短临时目录规避 Windows MAX_PATH；专门检查系统 TEMP ACL 的用例单独使用真实 TEMP 通过。
- 真实守护进程验证鉴权、两项目独立 MCP 运行时、非法写入拒绝、项目/全局恢复、会话折叠设置重启持久化和 headless 配置边界全部通过。
- `openspec validate fix-windows-private-file-replacement --strict` 和 `git diff --check` 通过。
