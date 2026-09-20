## 1. 统一实现

- [x] 1.1 建立共享细条、粗条和显隐模式，替换旧局部规则及自绘标签尺寸；通过原生纵横拖动、悬停像素和布局稳定性检查。
- [x] 1.2 将同一滚动条样式传入 PPT iframe，保留文档生成与缩放；通过定向测试和 iframe 浏览器检查。

## 2. 集成验证

- [x] 2.1 浏览器检查亮暗主题、390px、reduced-motion、侧栏、预览编辑、标签、终端及电子表格的滚动与命中范围。
- [x] 2.2 运行 pnpm test、pnpm build、OpenSpec strict、git diff --check，并记录验证边界。

## 验证记录

- 全量前端测试 2635 项通过；最终生产构建、正则兼容扫描、OpenSpec strict 与限定差异检查通过。
- Chromium 实际像素与拖动验证 44/44 通过：亮暗主题、1000px/390px、reduced-motion 下检查 11 类滚动表面，无页面错误。
- 细条默认隐藏、容器 hover 4px、滑块 hover 8px；12px 透明边缘能纵横拖动，内容 clientWidth 不变；粗条与 always 模式符合约定。
- 真实 xterm、x-data-spreadsheet、自绘标签组件及 PPT iframe 文档通过集成检查；其余采用真实 CSS 类名与结构的最小溢出容器。编辑下层隐藏保留。
- 设计检测发现的其他旧样式提示未扩展处理；本次自绘加粗不引入尺寸动画。
- 未运行完整业务端到端测试、未重建或验证已安装 Desktop；浏览器 PDF 内建界面不由应用 CSS 控制。
