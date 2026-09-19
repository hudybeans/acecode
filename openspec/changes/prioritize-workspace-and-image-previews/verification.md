# 验证记录

2026-09-18：

- `pnpm test` 通过。新增纯函数用例覆盖图片与文字分离、混合附件、上传身份更新、删除后晚到上传、草稿恢复和本地图片路径引用的类型保留；更新现有编辑及结构约束用例。
- `pnpm build` 通过，包括生成产物的正则兼容检查。
- `openspec validate prioritize-workspace-and-image-previews --strict` 和 `git diff --check` 通过。
- Chromium 使用实际 TopBar、ChatView、InputBar、RichComposer 组件及模拟 API 验证：粘贴图片不增加文件名标签；光标处继续输入保持位置；选择图片与 PDF 时仅 PDF 进入文字流；图片可打开预览；切换会话后草稿恢复；拖入图片后删除，晚到上传结果不恢复图片；发送只包含仍有效的图片和文件，成功后清空。
- 首页英文深色界面验证：仅有图片时可发送，发送前不创建会话或上传，草稿保留原始 File；发送时创建会话、上传并提交附件，成功后清空。
- 布局验证：Windows 1280/640 px、浏览器 390 px、模拟 macOS 1280 px；长标题与长目录名完整布局，无目录省略、按钮覆盖或横向越界。超长目录换行时，Windows/macOS 操作按钮仍在原顶部位置。

浏览器脚本、结果和截图：`C:/Users/shao/.codex/visualizations/2026/09/17/01a0afdc-a96a-78f0-82dd-98da630d06ef/image-workspace/`。

本次验证覆盖源码构建与浏览器组件，未重新打包已安装桌面端，也未进行 macOS 真机验证。
