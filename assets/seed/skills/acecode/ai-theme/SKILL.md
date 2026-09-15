---
name: ai-theme
description: 为 ACECode 分级定制主页、会话页、用户消息背景与 UI 样式；支持 AI 位图、本地矢量和用户贴图，无生图模型时使用 HTML 与 Browser 预览，确认后安装主题。适用于 /ai-theme 或定制 ACECode 外观的请求。
license: MIT
metadata:
  source_id: acecode:ai-theme@2026-09-15.2
  compatibility: ACECode theme_create, AskUserQuestion and Browser tools; image_generate optional
  tags: [acecode, appearance, themes, image-generation, offline]
---

# AI 主题

把用户的主题想法制作成 ACECode 的背景和界面配色，保持原有布局与功能；不修改应用源码。

## 开始或继续

1. 检查当前是否有 `theme_create`；缺少时说明当前版本不支持主题制作。保留已有草稿和图片，不用脚本、HTTP 或写配置绕过。
2. 调用 `theme_create({"action":"status"})` 查看本任务草稿。继续时使用工具返回的 `draft_id` 和实际状态，不凭聊天摘要猜测已确认；用户明确新建另一套主题时不复用旧草稿。
3. 已安装草稿交付已有结果；已确认待安装且没有新修改时继续安装，不重复生成素材。修改已安装主题时新建草稿（palette 省略 draft_id），保留旧主题。
4. 读取 [references/customization-questions.md](references/customization-questions.md)，用 `AskUserQuestion` 一次询问 **主题定制程度、主题模式、风格基座** 三个问题。已明确回答的项目直接沿用。不要先要求配置生图工具，只有位图模式依赖它。
5. 只补问缺失的主题对象和主色。开场白仍为「我想生成关于 XXX 的主题，X 色是它的主色调。」时补齐信息，不把占位文本当作真实主题。
6. 按范围补问首页文本框透明度、首页背景主色和透明度；高级/深度增加会话背景主色和透明度；深度还确定用户消息背景。每题三档具体建议和“其他”自定义入口，已有答案直接采用。将需求和真实素材路径记录到本任务工作目录的 `theme-plan.json`，不写内部草稿或主题配置。
7. 快速=主页和样式；高级=主页、会话页和样式；深度=主页、会话页、用户消息卡片及样式。**聊天卡片只指用户发送的消息，不包含 AI 回复。** 不限明暗是设计偏好，最终仍需确认实际 light/dark 模式。
8. 透明度 0% 表示不透明，100% 表示完全透明；写入参数时 `opacity = 1 - 透明度/100`，不能直接把透明百分比当作 opacity。
9. **所有主题图片只允许等比缩放。** 会话背景默认铺满右侧会话区域（cover），不制作带上下留边的横幅；只有用户明确约定尺寸或构图时才按约定处理。用户消息背景按气泡宽度等比缩放、底部对齐、不重复；长消息高出图片的部分由同色底色补齐。

## 1. 确认色系

用 `skill_view` 读取 [references/theme-contract.md](references/theme-contract.md)。需要完整颜色对象时读取 [references/palette-example.json](references/palette-example.json)，按本次对象和主色重新设计，示例不是固定主题。

展示主题名、实际明暗模式及全部 28 色，说明主色、背景、文字、强调与状态色。同步展示 `appearance` 的图标主色 `logo_color`、首页标题色 `home_title_color`、通顶 `extend_to_titlebar`，以及本次各背景主色、图片和首页文本框透明度。保留原图标形状和白色字形；新建时未指定旧参数则沿用默认图标、正文色标题和不通顶。

**分级问答不替代或删除图标色、标题色和通顶参数。** 修改局部颜色、透明度或素材模式时，合并用户未修改的全部旧参数并传回完整 appearance。只有用户明确恢复默认才移除对应覆盖。保证正文和输入框可读，保持成功、警告、错误颜色的区分。

展示后调用 `palette`，传入 name、mode、完整 colors 和已展示的 appearance；更新同一草稿时传 draft_id。该动作是全量替换，省略 appearance 会移除旧覆盖。工具通过 **确认色系** / **修改** 记录真实用户选择；确认后才制作素材。沉默、取消、超时、自动答复或完全访问权限都不是确认。

## 2. 准备素材与界面原型

按用户选择执行，使用真实保存路径，不把 UI 原型当作背景：

- **位图**：读取 [references/image-prompts.md](references/image-prompts.md)，仅在 `image_generate` 配置并可用时调用。按范围准备主页、会话和用户消息独立素材；生图原型沿用随包的深浅首页参考图。
- **矢量图（不使用图形生成工具）**：读取 [references/browser-preview.md](references/browser-preview.md)，用代码创建可编辑 SVG/CSS，不调用 image_generate，也不要求配置生图模型。通过 Browser 画板导出原始像素的独立 PNG，保留 SVG 源稿；不把窄窗口截图拉伸成壁纸。
- **使用自带贴图（不使用图形生成工具）**：使用**用户提供的本地图片**，询问各图片用于哪些区域。同图可经用户选择复用；只做必要适配，不默认搜索、上传图片或调用生成/修图模型。

**没有可用生图模型时，preview 一律使用 HTML + ACECode Browser。** 工具缺失、未配置、无可用模型或生成失败都进入 [references/browser-preview.md](references/browser-preview.md)，不能只让用户去配置模型而终止。矢量和贴图模式默认也使用此路径。若位图素材尚缺，先用明确标注的框图确认构图，询问改用矢量或提供本地图片；坚持生成位图则保留草稿等待模型，不用占位框图冒充最终素材。

图像工具结果通常已作为附件显示；重看本地图片用 `show_image`。能直接看图就自行检查；不能看图时按已安装的 vision-image-reader 使用 vision_analyze，不声称检查了不可见图片。检查主体、云朵、留白、文字可读性、主色和布局；局部问题只修订相关素材。

用户消息素材的叶子、花纹等装饰安排在底部；顶部使用与 `user_message_background_color` 一致的纯色，或将装饰背景设为透明以露出该底色，避免长消息出现色差接缝。必须预览短消息、长消息及窄窗口；检查底部装饰可见、图案不变形、超高部分同色衔接。背景色有改动仍保留其它 appearance 参数并重新确认。

HTML 预览主页在上、聊天页在下；①主页、②会话页、③仅用户消息，使用与安装相同的颜色和 opacity。核对图标色、首页标题色和通顶；深色通顶右侧按钮为白色，浅色通顶使用主题前景，顶部背景必须可读。

展示原型与本次全部独立素材后调用 `prototype`，传入 draft_id、background_path、preview_path；高级/深度附加 session_background_path，深度附加 user_message_background_path。**preview_path 必须是图片路径**；HTML 需用 browser_screenshot 截图，不能把 HTML/SVG 改扩展名充当 PNG。工具请求 **确认原型并生成** / **修改**；此时只生成预览草稿，不安装。

修改构图则修订对应素材并再次确认；修改色系或任一 appearance 值则返回色系确认，再生成匹配预览。每次 prototype 全量提交所选范围的资源；不要因只改一张图而遗漏仍需保留的其它素材。

## 3. 制作与交付

只有工具记录了当前色系与当前原型确认后，才调用 `theme_create({"action":"install","draft_id":"实际 ID"})`。不传 confirmed、新颜色或替换素材。工具校验已确认资源、制作缩略图和主题包，并保留旧主题。

按实际结果交付主题名、各独立背景、可编辑源稿（若有）和主题包位置。Web/Desktop 处理本次实时安装事件并应用；不把安装成功说成所有界面都已切换。需要切换时到 **设置 > 外观** 选择，图片已由工具显示则不重复嵌入。

## 中断和失败

- 所有确认和安装都使用同一任务的 draft_id；不读取或覆盖其它任务的草稿，不直接改草稿文件或主题配置。
- 失败报告具体原因及草稿 ID，重试前用 status 核实；已安装则交付已有结果，不再次生成收费图片。
- 工具要求重新确认就展示相关版本；停止、超时、取消或无人值守不继续安装。
- 位图生成默认 `quality="standard"`；运行中不重复提交，高质量档位遵循费用确认。
- 无生图能力不妨碍矢量/本地贴图和 HTML 预览。Browser 不可用时保留 HTML 和素材，说明需在 ACECode Desktop 的 Browser 查看；不伪造截图或绕过确认。
