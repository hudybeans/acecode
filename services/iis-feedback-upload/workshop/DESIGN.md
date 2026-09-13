---
name: ACECode 主题工坊
description: 已确认的浅色紫色工坊界面，以主题图像、清晰操作和审核状态组织内容。
colors:
  page: "#f6f7fb"
  surface: "#fff"
  ink: "#202139"
  muted: "#646579"
  line: "#e0e2ec"
  accent: "#7641d3"
  accent-hover: "#6531bf"
  tint: "#f0e9fc"
  danger: "#ab303d"
  control-hover: "#eeedf4"
  group-background: "#eaeaf2"
  focus: "#9e73e5"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(25px, 3vw, 34px)"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.4
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.55
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  button:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    fontWeight: 550
    lineHeight: 1.3
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
    lineHeight: 1.55
rounded:
  badge: "6px"
  control: "8px"
  inset: "10px"
  surface: "12px"
  dialog: "16px"
spacing:
  compact: "4px"
  control-gap: "8px"
  small: "12px"
  control: "16px"
  content: "20px"
  section: "24px"
  gutter: "36px"
  page-top: "48px"
  page-bottom: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.control-hover}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  filter-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "7px 16px"
  review-filter-selected:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
  theme-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  theme-card-content:
    padding: "19px 20px 18px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    width: "min(530px, calc(100% - 32px))"
  preview-dialog:
    width: "min(1040px, calc(100% - 32px))"
---

# Design System: ACECode 主题工坊

## Overview

**Creative North Star: "浅色紫色主题工坊"**

本文件记录已实现并获用户确认的浅色视觉体系：冷浅灰页面、白色表面、深海军蓝文字与紫色操作。主题截图承担主要视觉内容，工坊外框保持稳定，方便用户比较不同主题的配色与壁纸。字体采用系统中文界面栈，不依赖外部字体资源。

目录、上传和管理员审核共用这一体系。深色与浅色是主题内容的分类，工坊自身固定为浅色；浏览深色主题时，页面、控件和弹窗仍沿用同一组浅色令牌。页面策略与已确认原型记录在 [surface.md](surface.md)，产品约束记录在 [PRODUCT.md](PRODUCT.md)。

**Key Characteristics:**

- 主题图像在前，名称、版本、色板和操作紧随其后。
- 白色控件与细边框区分层级，紫色用于主要操作和选中状态。
- 目录卡片常态平坦，较强阴影留给弹窗。
- 状态通过中文文案、控件状态和语义标记共同表达。

此文档于 2026-09-13 从 [index.html](index.html)、[workshop.css](workshop.css) 和 [workshop.js](workshop.js) 提取。前置 YAML 保存实际使用的颜色、字级、圆角和组件值；它没有引入新方向。

交接时，独立审查已将“同文件重试”和“分页竞态”两项修复判定为 `resolved`，处置为 `ship`，范围限于代码及所列修复。浏览器运行环境缺少 `browser-service.mjs`，未取得实际页面截图，因此本文件不代表桌面或移动端视觉验收，也不声称已验证浏览器中的布局、键盘焦点或辅助技术表现。

## Colors

以紫色动作、海军蓝文字和冷浅灰背景形成清晰的操作层级。上述 YAML 保留 CSS 中的实际写法，不额外推导或扩展色阶。

### Primary

- `accent` 是上传、下载、提交审核、通过审核及选中筛选的主要颜色；`accent-hover` 表达主要按钮悬停。
- `tint` 是拖放激活、进度轨道和审核状态筛选的浅紫背景。
- `focus` 用于键盘焦点轮廓，与控件本身的选中状态分开。

### Neutral

- `page` 构成页面与预览图的浅色底，`surface` 构成卡片、表单控件、页头和弹窗。
- `ink` 表达主要文字，`muted` 表达说明、元信息、版本与未选中筛选。
- `line` 是页头、页脚、卡片、控件及弹窗分区的统一细边框。
- `group-background` 收拢色系筛选和预览内容切换；`control-hover` 表达普通按钮悬停。

### Semantic states

`danger` 用于“驳回”操作。错误信息使用源样式中的浅红底与深红字，提交完成使用浅绿底的确认图标。目录中的审核状态仍以明确文字为准，不通过某一种颜色推断公开状态。

**The Stable Shell Rule.** 用户主题的颜色只进入主题截图、色板和外观详情，不替换工坊页面的设计令牌。

## Typography

所有字级共用前置令牌中的系统字体栈，以平台可用字体呈现中文和拉丁字符。正文采用 `body`，页面主标题采用 `display`；标题仅使用紧凑字距，不加入展示字体或大写装饰。

| 角色 | 已实现用途与变化 |
| --- | --- |
| `display` | 页面主标题，随视口缩放；公开目录显示“让灵感成为你的主题”，管理页显示“主题审核”。 |
| `heading` | 空目录、登录区等分区标题；弹窗标题局部缩小为 18px。 |
| `title` | 主题卡片名称与上传预览名称。卡片名称单行省略，并保留完整名称的提示。 |
| `body` | 正文、输入框和默认控件基础字级。 |
| `button` | 默认操作文字；卡片操作局部使用 12px，筛选使用 13px。 |
| `label` | 元信息、结果数量、辅助说明与详情；版本文字为 11px，页脚为 12px。 |

上传帮助文字局部采用 1.8 倍行高。上传文件名、主题预览标题和错误内容允许断行；进度数字采用等宽数字特性，减少百分比变化时的移动。

**The Readable Metadata Rule.** 名称与操作保持主层级，版本、大小、色系和说明使用次级字级与 `muted`，不把所有信息加粗。

## Layout

页面与页头内层居中，最大宽度为 1280px。桌面页头最小高度为 80px，左右留白为 36px；正文留白为上 48px、左右 36px、下 64px。页脚最大宽度为 1208px，与正文内部内容对齐。

| 视口宽度 | 目录和工具栏 | 页头、详情及弹窗 |
| --- | --- | --- |
| 大于 1000px | 三列等宽网格，列间距 24px。搜索宽度为 `min(390px, 40%)`，色系筛选紧随，排序靠右。 | 介绍区右侧显示审核提示；预览详情为两列，间距 30px。 |
| 641px 至 1000px | 两列等宽网格，保留 24px 间距。 | 隐藏介绍区右侧审核提示；页脚可换行，左右留白 36px。 |
| 640px 及以下 | 单列网格，间距 20px。搜索独占一行，工具栏换行，色系筛选与排序位于后续行。 | 页头最小高度 68px，左右留白 20px；隐藏品牌后的“主题工坊”分隔文字。正文留白为 `32px 20px 44px`，预览详情变为单列，弹窗分区留白统一为 18px，底部操作可换行。 |

页面最小宽度为 320px。卡片使用 `minmax(0, 1fr)` 与可收缩内容，避免长标题把网格撑宽。每页显示 24 个主题，超过一页时在目录底部居中显示页码及上一页、下一页。

上传弹窗与宽预览弹窗的宽度分别由前置组件令牌限定，两侧至少保留合计 32px 的视口空间。弹窗最高为 `calc(100dvh - 48px)`，内部允许纵向滚动并限制滚动链；打开弹窗时锁定页面滚动。

## Elevation & Depth

层级主要来自白色表面、浅色容器与细边框。卡片常态没有阴影，页头没有悬浮效果。弹窗使用 `0 18px 64px rgb(29 22 53 / 16%)` 的结构阴影，背景遮罩为 `rgb(27 24 44 / 46%)`。底部提示使用 `0 8px 26px rgb(21 17 32 / 16%)` 的较小阴影。

按钮的背景与边框变化持续 160ms；卡片截图悬停时在 240ms 内放大到 1.025 倍，曲线为 `cubic-bezier(.2,.7,.2,1)`。弹窗打开时在 200ms 内从下方 10px 移入，曲线为 `cubic-bezier(.16,1,.3,1)`。系统请求减少动态效果时，取消动画和过渡。

**The Flat Catalogue Rule.** 目录层级依靠图像、间距和边框，弹窗承担主要投影；不要把弹窗阴影复用到全部卡片。

## Shapes

卡片采用 `surface` 圆角并裁切截图边缘。按钮和输入框采用 `control` 圆角，内嵌预览与分段控件底座采用 `inset` 圆角，弹窗采用 `dialog` 圆角。色系角标使用更小的 `badge` 圆角。

主要边框宽度为 1px。上传区以虚线边框标识可放置文件的区域，拖放激活时变为紫色边框和浅紫背景。色板使用带细边框的小方块：目录为 20px，完整预览为 28px，外观详情中的色块为 16px。

图标来自实现中的内联线性 SVG，默认 19px、描边宽度 1.7，圆端点与圆转角；图标跟随文字颜色。上传、空状态和登录图标依角色放大，色系角标及卡片下载图标缩小。

## Components

### Buttons and fields

主要按钮为紫底白字，普通按钮为白底深字加细边框。“刷新”“更换文件”采用紫色文字按钮，“驳回”采用危险文字色。默认按钮最小高度为 40px，输入框和选择框最小高度为 44px；目录内操作采用更紧凑的 33px 最小高度。

禁用按钮透明度为 0.55，并移除可点击光标。可见键盘焦点使用 3px 轮廓与 3px 外偏移；可点击卡片图像将轮廓内移，避免被卡片裁切。搜索、排序和管理密钥均有文本标签，部分标签只在辅助技术中呈现。占位文字不承担唯一标签的作用。

### Navigation, filters and list states

页头左侧是 ACECode 标志和品牌，右侧放“上传主题”。管理页显示“返回工坊”，已登录后显示“退出管理”。页脚保留下载 ZIP 后通过“设置 → 外观 → 本地导入”使用的说明和管理员入口。

“全部／浅色／深色”及“主题预览／基础模板”使用带浅色底座的分段按钮组，选中项为白底紫字，并同步 `aria-pressed`。审核筛选独立为“待审核／已通过／已驳回”，选中项为浅紫底、紫字和紫色细边框。

目录支持名称搜索、最新上传或名称排序。搜索延迟 220ms 发起请求；搜索、排序、色系和审核状态变化会返回第一页。新请求会中止旧目录请求，并拒绝过期成功结果；请求期间禁用翻页按钮，点击处理同时检查禁用状态并约束页码，避免连续点击跳过尚未加载的页面。

结果数量通过礼貌级动态状态区域更新，目录容器声明 `aria-busy`。加载失败显示错误面板和“重试”；无公开主题、无匹配主题及无当前审核状态主题分别使用对应空状态文案，不填充示例主题。

### Theme cards and full preview

卡片自上而下由可点击的主题图像、右上角色系角标、名称和版本、色板及操作组成。图像以 `2442 / 1511` 比例铺满宽度并裁切；加载失败时回退到对应深浅基础模板。公开卡片提供“预览”和“下载主题”，管理卡片显示审核状态与“预览并审核”。

完整预览使用宽弹窗，图片保持同一比例但使用完整容纳方式。用户可切换主题包缩略图与对应深浅基础模板。配色展示 `accent`、`bg`、`surface`、`fg`、`send-bg`、`ok`、`warn`、`danger`；另列“ACECode 图标”“首页标题”“背景通顶”，保留主题包中的外观设置。

色板提供颜色值及名称提示，预览图片有随主题名称或模板模式更新的替代文字。目录缩略图与预览图片采用延迟加载。公开预览提供完整主题 ZIP 下载，不在网页中执行本地导入。

### Upload preview and progress

上传是“选择 ZIP → 校验并预览 → 提交审核 → 结果”的分步过程。拖放区同时是可键盘激活的文件选择按钮，支持非空、最大 16 MiB 的 ZIP；对外文案保留“最大 16 MB”。校验失败在弹窗内显示具体错误。

选择文件后显示文件名和“更换文件”，先向预览接口提交主题包。校验成功才显示截图、主题名称、模式、版本、大小、关键色板和外观详情，并启用“提交审核”。选择文件本身不会成为公开提交。文件选择器在读取选择后清空其值，因此出错后可以重新选择同一个文件；新选择以版本计数隔离旧预览结果。

传输期间显示原生进度条与百分比。达到 100% 后切换为不确定进度，读取阶段显示“正在校验主题包…”，提交阶段显示“正在保存主题，准备提交审核…”，避免把传输完成误报为处理完成。读取可以取消；提交期间禁用更换、再次提交、取消和关闭，并阻止 Escape 关闭。

成功结果保留三种实际状态文案：新提交显示“已提交，等待管理员确认”；已公开的重复提交显示“这份主题已经公开展示”；已驳回的重复提交显示“这份主题此前已被驳回”，并提示调整主题、更新版本号后重新导出提交。完成后底部按钮改为“完成”。网络中断、超时或服务端错误在当前弹窗中显示，并允许重试。

### Native dialogs and accessibility

上传与预览采用原生 `<dialog>`，通过 `showModal()` 打开，通过 `aria-labelledby` 关联可见标题。关闭按钮有明确的中文无障碍名称，装饰性 SVG 标记为 `aria-hidden`。上传处理对原生 `cancel` 事件作出响应：读取时取消请求并关闭，提交时阻止关闭；普通预览保留原生 Escape 行为。

实现依赖浏览器原生模态语义提供背景不可交互、焦点约束及关闭后的焦点处理；这些浏览器行为尚未在本次交接环境中实测。页面另提供“跳转到主题列表”链接、错误告警区域、动态结果与提交结果状态区域，以及带名称的原生上传进度条。

### Administrator review

管理页复用目录和预览结构。未认证时显示管理密钥表单；认证后读取管理目录，默认停留在“待审核”。会话失效时返回登录界面。登录错误展示在表单内，退出管理后恢复登录状态。

| 当前状态 | 预览弹窗中的审核操作 | 对公开目录的含义 |
| --- | --- | --- |
| 待审核 | “通过审核”“驳回” | 尚不公开。 |
| 已通过 | “驳回” | 可公开浏览和下载；驳回后移出公开访问。 |
| 已驳回 | “通过审核” | 不公开；管理员重新通过后可公开。 |

管理预览隐藏公众下载按钮，保留图片、配色和外观详情。操作中同时禁用两项审核按钮；成功后关闭预览、显示结果提示并刷新当前筛选，失败时保留预览并显示错误。公开目录只展示已通过主题，待审核与已驳回主题的资源访问边界由服务端执行，不能仅依赖前端隐藏。

### Image provenance

原图来源记录在 [assets/PROVENANCE.md](assets/PROVENANCE.md)。两个基础模板保持用户提供截图的原始分辨率（2442 × 1511），用作预览中的“基础模板”和目录图片故障回退；它们不是已上线工坊的验证截图。

| 文件 | 来源与角色 |
| --- | --- |
| `assets/acecode-light.png` | 用户提供的 ACECode v0.9.14 浅色截图，原附件为 `codex-clipboard-adb626cb-6395-47a4-9b67-2a95f9ded9b8.png`。 |
| `assets/acecode-dark.png` | 用户提供的 ACECode v0.9.14 深色截图，原附件为 `codex-clipboard-6c797f68-1565-4de9-9df8-c13aa17a3175.png`。 |
| `assets/acecode-logo.png` | 从仓库已有 `web/public/acecode-logo.png` 复制的 ACECode 品牌素材，尺寸为 256 × 256。 |

主题目录图像来自经校验的用户主题包，服务不附带虚构目录条目。已确认工坊原型路径记录于 `surface.md`；该原型表达已批准方向，不能替代当前实现的浏览器截图证据。

## Do's and Don'ts

### Do

- **Do** 保留浅色页面、白色表面、海军蓝文字与紫色操作，并使用已有令牌。
- **Do** 保留 3／2／1 列目录和移动端完整宽度搜索，让主题图像、名称及直接操作保持相邻。
- **Do** 在上传前展示真实主题预览、关键色板和外观设置，明确表达提交审核及处理状态。
- **Do** 保留中文控件名称、可见焦点、语义状态、原生模态行为和减少动态效果支持。
- **Do** 记录用户提供截图与品牌素材的来源，将模板、批准原型和实际验证截图分别标识。

### Don't

- **Don't** 因主题为深色就改变工坊外框的浅色视觉体系。
- **Don't** 把传输达到 100% 表述为校验或提交已经完成。
- **Don't** 在用户确认“提交审核”之前创建正式提交，或将待审核、已驳回主题当作公开主题展示。
- **Don't** 让重复选择同一文件失去重试入口，或在目录请求未完成时允许连续翻页。
- **Don't** 将代码审查处置、用户提供模板或批准原型描述为当前页面已经通过浏览器视觉验收。
