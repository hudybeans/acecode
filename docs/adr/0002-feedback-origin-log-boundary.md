# Feedback packages include only their originating surface log

TUI feedback includes the latest TUI surface log, while GUI/Desktop feedback includes the latest Desktop surface log; neither includes the other surface's log. This keeps diagnostic attachments relevant to the reporting surface and avoids unnecessarily sending diagnostics from an unrelated interface.

## 术语

- **Feedback origin（反馈来源）**：发起诊断反馈包的运行界面。终端命令使用 `tui`，GUI/Desktop 接口使用 `desktop`；避免用 Feedback client 或 UI type 混淆运行界面与客户端。
- **Surface log（界面运行日志）**：某个运行界面在有效数据目录的 `logs` 子目录中生成的按日期日志，文件名使用该界面的前缀；避免称作 Shared UI log 或 Workspace log。
