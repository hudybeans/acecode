---
name: ai-theme
description: 为 ACECode 创建角色、作品或风格主题；逐步确认 UI 色系与界面原型后，生成可安装的独立背景及本地主题包。适用于 /ai-theme 或用户希望定制 ACECode 外观的请求。
license: MIT
metadata:
  source_id: acecode:ai-theme@2026-09-12
  compatibility: ACECode theme_create and image_generate tools
  tags: [acecode, appearance, themes, image-generation]
---

# AI 主题

把用户的主题想法制作成 ACECode 的背景和界面配色。保持 ACECode 原有布局与功能；这不是修改应用源码的任务。

## 开始或继续

1. 检查当前是否有 `theme_create`；缺少时说明当前 ACECode 版本不支持主题制作。保留已有草稿和图片，不用脚本、HTTP 或写配置绕过。
2. 调用 `theme_create({"action":"status"})` 查看本任务的草稿。继续已有草稿时使用工具返回的 `draft_id` 和实际状态，不凭聊天摘要猜测已经确认。用户明确要新建另一套主题时不复用旧草稿。
3. 已安装的草稿直接交付已有结果；已确认待安装且用户没有提出新修改的草稿继续安装，不重复生成图片。修改已安装主题时新建草稿（`palette` 省略 `draft_id`），保留旧主题。
4. 需要生成或修改图片时，检查 `image_generate` 和可显示图片的 `show_image`。缺少 `image_generate` 时说明到 **设置 > 工具 > 图像生成** 启用并配置；保留当前状态，工具可用后继续。
5. 只补问缺失的主题对象和主色。若开场白仍为「我想生成关于 XXX 的主题，X 色是它的主色调。」或信息不足，先请用户替换占位内容。已有明确要求时直接推进；沿用用户指定的风格、明暗与参考图。

## 1. 确认色系

用 `skill_view` 读取 [references/theme-contract.md](references/theme-contract.md)。需要完整颜色对象时再读取 [references/palette-example.json](references/palette-example.json)，按本次对象和主色重新设计，示例不是固定主题。

给出主题名、明暗模式和包含全部 28 个颜色角色的色表，说明主色、背景、文字、强调色及状态色的用途。同时展示 `appearance` 中的 ACECode 图标主色 `logo_color`、首页“我们该做什么？”文字色 `home_title_color` 和背景是否通顶 `extend_to_titlebar`。保留原图标形状和白色字形；未指定覆盖时说明沿用默认图标、正文色标题和不通顶。确保正文和输入框可读；动漫风格可使用鲜明主辅色，避免把整块工作区铺成高饱和底色。

展示后调用 `theme_create` 的 `palette`，传入本次 `name`、`mode`、`colors` 及已展示的可选 `appearance`；修改已有方案时同时传 `draft_id`，并传完整方案，省略 `appearance` 会移除旧覆盖。该工具让用户选择 **确认色系** 或 **修改**。只有工具明确记录色系确认后才生成图片。用户修改颜色或通顶设置时重新展示并调用 `palette`；不把沉默、取消、自动答复或完全访问权限当作确认。

## 2. 确认界面原型

用 `skill_view` 读取 [references/image-prompts.md](references/image-prompts.md)。先生成可单独使用的背景，再将它与本技能附带的 ACECode 首页参考图一起传给 `image_generate` 生成界面原型。始终用工具返回的实际保存位置；两张图不能混用。

生成结果会作为附件显示。需要重看本地图片时使用 `show_image`；能直接看图就自己检查，不能看图时按已安装的 `vision-image-reader` 使用 `vision_analyze`，不可声称已检查不可见的图。检查主体、云朵、留白、文字可读性、主色与界面位置；发现明显问题先在原图上修改，不整轮重做无关部分。

向用户展示本次界面原型和独立背景，简短说明效果。核对图标色、首页标题色及是否通顶与已确认设置一致；深色模式通顶时右侧按钮为白色，浅色通顶使用主题前景，顶部背景应让按钮可读。随后调用 `theme_create` 的 `prototype`，传入 `draft_id`、`background_path`、`preview_path`，由工具请求 **确认原型并生成** 或 **修改**。这一步仅产生预览草稿。用户修改构图时生成修订图并再次确认；修改色系或 `appearance` 时返回色系步骤，再制作匹配的新原型。

## 3. 制作与交付

只有工具已记录当前色系及当前原型确认，才调用 `theme_create({"action":"install","draft_id":"工具返回的实际 ID"})`。不要添加 `confirmed`、新颜色或新素材参数。安装工具会校验已确认资源、生成缩略图和主题包，保留原主题。

根据实际工具结果报告主题名、独立背景及主题包位置。Web/Desktop 会处理本次实时安装事件并应用主题；不要把「安装成功」擅自说成所有界面都已切换。需要切换时可在 **设置 > 外观** 选择主题。图片已经由工具显示时不重复嵌入。

## 中断和失败

- 每次确认与安装都使用同一任务的 `draft_id`。不读取或覆盖其他任务的草稿，不直接改草稿文件或主题配置。
- 失败时显示具体原因及保留的草稿 ID。重试前用 `status` 获取状态；如果已经安装，交付已有结果，不再生成收费图片。
- 工具要求重新确认就重新展示相关版本。用户说停止时停止；超时或无人值守不继续安装。
- 图像生成默认 `quality="standard"`。工具运行期间不重复提交；高质量档位遵循工具的费用确认。
