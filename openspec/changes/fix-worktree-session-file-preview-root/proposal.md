## Why

工作树会话把生成文件写入独立的 worktree，但会话列表和恢复响应仍把 `working_cwd` 指向原工作区。侧栏及跨工作区导航还会丢失 `worktree` 信息，因此轮次文件列表的“打开”把相对路径拼到原工作区，报文件不存在。

## What Changes

- 会话列表、全局搜索和恢复响应使用会话实际执行目录作为 `working_cwd`，保留 `cwd` 作为工作区归属目录。
- 导航目标保留已生效的 worktree 信息；恢复后的状态以服务端当前会话状态为准。
- 验证运行中、历史及重新恢复的工作树会话都能从正确目录打开相对文件。

## Capabilities

### Modified Capabilities

- `shared-daemon-workspaces`：工作树会话的文件预览目录必须与实际执行目录一致。

## Impact

影响 Web 会话序列化、恢复响应、前端导航目标及相关测试；不修改“查看变更”的轮次差异行为。
