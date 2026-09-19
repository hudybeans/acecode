## Why

正式发布前的真实守护进程验证发现：Windows 原子写入为敏感文件设置仅当前用户可读写的 ACL，但遗漏 DELETE 权限。在父目录允许修改却不授予 FILE_DELETE_CHILD 时，临时文件无法重命名，MCP 配置快照保存失败并阻止启动。

## What Changes

- 为当前用户保留敏感文件原子替换所需的 DELETE 权限，不向其他用户开放访问。
- 添加父目录不授予 FILE_DELETE_CHILD 时的首次写入和重复替换回归。
- 重新验证 CLI、Desktop、配置迁移与 MCP 真实启动。

## Capabilities

### New Capabilities
- `windows-private-file-replacement`: Windows 私有文件在可修改目录中可可靠原子替换。

### Modified Capabilities

## Impact

影响共享 `atomic_write_file` 的 Windows 限制权限分支及其测试；非 Windows 权限行为保持原有规则。
