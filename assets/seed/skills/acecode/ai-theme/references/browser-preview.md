# HTML 与 Browser 预览

无生图模型时必须走本流程；矢量、本地贴图默认也使用它。只使用 ACECode 原生 browser_open、browser_evaluate、browser_screenshot 等工具，不套用其他宿主的 browser 参数。

## 资源与需求文件

从激活上下文的 SKILL.md 绝对路径解析技能目录；不要硬编码开发机路径。深浅框图为 `assets/preview-light.html` 与 `assets/preview-dark.html`，均为主页在上、聊天页在下。③只指用户发送的消息。脚本 `scripts/render_preview.py` 仅使用 Python 标准库，不调用任何生图服务。

在本任务工作目录保存 theme-plan.json，包含 name、scope（quick/advanced/deep）、asset_mode（bitmap/vector/local）、style_base（light/dark/free）、实际 mode（light/dark）、完整 colors、完整 appearance 和 assets。保留用户已选的图标色、标题色、通顶参数。assets 的键为 home、session、user_message，值为真实本地图片路径，相对路径以需求文件所在目录为基准。快速仅 home，高级增加 session，深度再增加 user_message。

完成草稿文件后执行（路径替换为真实绝对路径）：

```text
python <技能目录>/scripts/render_preview.py --plan <工作目录>/theme-plan.json --output <工作目录>/preview.html
```

脚本把图片内嵌进输出 HTML，预览不依赖网络；读取支持 PNG/JPEG/WebP/SVG。本地图片不会上传。无 Python 时复制对应 HTML，在副本的样式中设置三组背景变量与首页输入框底色，使用真实本地图片 URL；保留已有图标/标题/通顶设置，不能因此改应用源码或绕过主题工具。

## 本地素材

- 矢量模式：用文件工具编写实际 SVG，可使用几何、曲线、渐变和文字，保留可编辑源稿；图形与用户主题一致。禁止调用 image_generate，包括为了生成 preview 或修图。
- 自带贴图：使用用户提供的图片；确认其区域用途，PNG/JPEG/WebP 可直接提交主题工具转换。不要因为是图片就自动调用生图工具。
- 尚无素材：模板标注“待提供素材”，可先讨论构图和色系；最终安装必须使用真实完成的背景。纯色方案可制作纯色 SVG，再按下文输出 PNG。

所有图片只等比缩放。首页、会话背景默认 cover 铺满各自内容区域；会话图不是居中的横幅。除非用户明确约定，否则 SVG 的底色和场景应从画板一边连续铺到另一边，不加上下留边。输出像素尺寸不等于界面显示尺寸，不把 width/height 塞入 appearance。

所有用户消息背景统一显示为 720 CSS px 宽、高度按比例自动计算（720px auto），right bottom、不重复。短消息、长消息及宽窄窗口中的图片缩放比例相同，气泡大小只决定裁切范围；例如 1200×400 素材始终显示为 720×240 CSS px。把树叶等装饰放在右下角，不为了短消息改成按气泡宽度缩放；素材顶部底色必须匹配已确认的 user_message_background_color，或使用透明背景只保留装饰。气泡高于图片时上方用该底色补齐。opacity 的纯色遮罩仍覆盖整个气泡（双层 background-size 为 100% 100%, 720px auto），不按图片高度缩小。

## 打开、检查、截图

按 [代码阅读舒适度](theme-contract.md#代码阅读舒适度) 核对代码区域。可在现有②会话页内加入真实代码文本样例，不增加第四个可定制背景区域；检查代码实际底色、普通文字、语法高亮、注释、行号及选中态。文件查看/编辑等宿主可用时也核对其实际渲染。只展示普通文字或给原型自定义高亮色，不代表最终渲染器的固定 token 已验证；无法检查的部分明确说明。用户明确坚持的例外按已记录的范围展示。

1. `browser_open({"url":"file:///实际本地路径/preview.html"})`，保存工具返回的 page_id，后续操作都指定该页。路径包含中文、空格或 # 时先正确编码为 file URL。无需另开系统浏览器。
2. 用 browser_read_page/browser_evaluate 等待页面与图片加载完成；检查用户正在看的页确实是本次预览。保留主页在上、聊天页在下，以及范围外区域“本次不定制”的标记。
3. 检查首页输入框只透明底色，文字不透明；图片按 opacity 显露主色底色；会话背景与用户消息背景独立；AI 回复不使用用户消息图片。核对 logo_color、home_title_color 和 extend_to_titlebar，深色通顶按钮为白色。改变预览宽度并分别放入短消息、长消息：会话背景始终铺满；所有气泡图片始终为 720 CSS px 宽且高度等比，右下对齐，装饰大小不随消息或窗口宽度变化，超高部分与素材底色无接缝。
4. `browser_screenshot({"page_id":"实际 ID","file_name":"theme-preview.png","full_page":true})`。使用返回的 path 作为 preview_path；必要时缩小页面内容以让上下两页同时可见。打开实际截图确认完整，不能仅凭文件名认定有效。
5. 本地 HTML 已展示且截图与素材对应后，才调用 theme_create prototype 请求原型确认；只提交真实 PNG/JPEG/WebP 路径，不提交 HTML/SVG 路径。

Browser 不可用时保留 HTML 和素材并明确说明，不能伪造截图；用户可在 ACECode Desktop 的 Browser 打开后继续。

## 矢量图转换为安装用 PNG

生成无 UI 的独立画板：

```text
python <技能目录>/scripts/render_preview.py --plan <工作目录>/theme-plan.json --output <工作目录>/home-artboard.html --artboard home
```

session 和 user_message 区域使用各自的 --artboard 值。画板默认保留源图像素尺寸；只有用户约定输出尺寸时才成对添加 `--width 1920 --height 1080`（数字替换为约定值），采用等比 cover 裁切，不拉伸图案。尺寸不受 Browser 面板的宽高影响。画板不预先烘焙主题 opacity，防止安装后重复叠加透明度。

1. 用 browser_open 打开生成的画板；调用 `browser_evaluate`，code 为 `window.aceThemeArtboardReady`，等待返回 `ready: true` 并记录 width/height。失败先修素材，不导出空白画板。
2. 确认当前 browser_screenshot 工具支持 canvas_selector，调用：

```json
{"page_id":"实际 ID","file_name":"session-background.png","canvas_selector":"#theme-artwork"}
```

该模式直接导出画板像素，返回真实 PNG 路径、尺寸及附件；不传 full_page。只用于独立素材，界面原型仍按上文截图。导出宽高必须与画板一致，检查实际 PNG 没有边框、留边、控件或变形，再作为对应 background_path。保留 SVG 源稿，禁止改后缀冒充 PNG；禁止 object-fit: fill、非等比 resize、把 478×605 等窄窗口截图强行变为横向素材。

旧 Browser 未提供 canvas_selector 时，不传未知参数，也不把普通截图拉伸交付。已有 PNG/JPEG/WebP 可直接用于主题；矢量源稿和 HTML 保留，说明需更新支持画板导出的 ACECode 后再导出。无 Python 时可手写同样的 canvas 画板，等图像 decode 后按源图宽高绘制，通过同一导出工具保存。

将渲染后的 PNG 更新到需求文件 assets，再生成最终 preview.html 和截图，保证主题安装使用的像素与确认的原型一致。每次修订只重做受影响的素材和同版预览。
