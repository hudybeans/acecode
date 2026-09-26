## 1. 规范与测试
- [x] 1.1 定义 regular turn terminal event 的 usage 聚合契约。
- [x] 1.2 添加同 turn 多 model step usage 聚合回归测试。

## 2. 实现
- [x] 2.1 在 AgentLoop turn 生命周期内累加已入账 step usage。
- [x] 2.2 在 terminal busy_changed 与 done payload 暴露 turn_id 和 usage。
- [x] 2.3 更新 daemon API 文档。

## 3. 验证
- [x] 3.1 按用户要求不编译；完成 OpenSpec 与静态差异校验，并提交目标回归测试供 CI 执行。
- [x] 3.2 运行 OpenSpec strict validate、git diff --check 和提交前差异审查。
