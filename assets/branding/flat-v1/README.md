# ACECode 扁平图标方案 01

保留「A + >」识别特征，重整几何轮廓和间距。底板、字母、提示符分别采用三种纯色，圆角外透明。

| 角色 | 默认颜色 | SVG 标记 |
| --- | --- | --- |
| 底板 | 黑色 `#000000` | `data-color="background"` |
| A | 白色 `#FFFFFF` | `data-color="foreground"` |
| > | 主题蓝 `#3B82F6` | `data-color="accent"` |

`acecode-icon-flat.svg` 是可编辑的 512 × 512 矢量原稿。没有渐变、滤镜、阴影、外部字体或嵌入位图；修改 `data-color="accent"` 元素的 `fill` 即可换主题色。PNG 边缘的抗锯齿不代表新增设计色。

打开 `preview.html`，可以选择任意主题色、查看深浅底及 16 / 24 / 32 / 48 / 64 px 效果，并下载当前配色 SVG。浅底版只交换黑白，主题色仍只用于提示符。

内联到页面时也可以用样式覆盖主题色：

```css
.acecode-logo [data-color="accent"] {
  fill: var(--ace-logo-accent, #3B82F6);
}
```

这里的 `.acecode-logo` 应放在内联 SVG 或其父元素上。通过 `<img src="...svg">` 引入时，页面 CSS 不会进入 SVG，应改写 SVG 内的填充色，或使用预览页导出所需配色。

这是独立设计交付；应用图标入口尚未切换。概念探索使用内置 `image_gen`，提示词见 `concept-prompt.txt`；最终可编辑资产采用原生 SVG 绘制，并以浏览器渲染结果为准。
