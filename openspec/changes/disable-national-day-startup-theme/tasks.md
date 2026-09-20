## 1. 启动策略

- [x] 1.1 移除认证恢复后的节日主题启动调用，补充入口、已保存外观与手动国庆节下载回归检查，运行相关前端测试验证。
- [x] 1.2 更新主题与接口文档，核对当前启动行为及旧协议兼容说明一致。

## 2. 集成验证

- [x] 2.1 运行 `pnpm test`、`pnpm build`、严格 OpenSpec 验证与 `git diff --check`，记录结果及验证边界。

## 验证结果

- 外观恢复、默认主题、下载控制器及主题卡片定向测试通过。
- `pnpm test` 通过，输出 2582 条 `[pass]`。
- `pnpm build` 通过，产物正则兼容检查通过。
- `openspec validate disable-national-day-startup-theme --strict` 与 `git diff --check` 通过。
- 仅完成源码和 Web 构建验证，未重新打包、安装或发布 Desktop。
