## Why

长会话标题挤压工作目录徽标；输入图片同时显示缩略图和正文附件标签，造成重复。

## What Changes

- 顶部工作目录名优先获得空间，会话标题先截断；取消目录名的省略与窄屏隐藏，极长名称可换行完整显示。
- 主输入区和首页输入区的图片仅显示独立缩略图，不插入正文附件标签；非图片附件继续使用原内联形式。
- 保留图片发送、草稿、预览、移除和上传完成后的身份更新。

## Capabilities

### New Capabilities
- `workspace-and-image-presentation`: 工作目录优先显示和图片独立附件展示。

### Modified Capabilities

## Impact

SessionTitleBar、顶栏样式、InputBar 和图片展示数据适配；复用原结构化附件协议及上传流程。
