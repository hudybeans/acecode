function visibleText(token) {
  if (token.type === 'text' || token.type === 'code_inline') return token.content;
  if (token.type === 'softbreak' || token.type === 'hardbreak') return '\n';
  // Images and generated HTML interrupt text adjacency without inspecting attributes.
  if (token.type === 'image' || token.type === 'html_inline') return '\uFFFC';
  return '';
}

function wrapColor(value, html) {
  return `<span class="ace-md-hex-color">${html}`
    + `<span class="ace-md-hex-swatch" data-hex-color-swatch="${value}"`
    + ` style="background-color:${value}" aria-hidden="true"></span></span>`;
}

export function markdownColorSwatches(md) {
  md.core.ruler.after('text_join', 'hex_color_swatches', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      const text = block.children.map(visibleText).join('');
      if (!text.includes('#')) continue;

      const prContext = /\bprs?\b/i.test(text);
      const issueOffsets = new Set();
      for (const match of text.matchAll(/\b(?:issue|pr)\W*(#[\da-fA-F]{6})(?!\w)/gi)) {
        issueOffsets.add(match.index + match[0].length - match[1].length);
      }

      let offset = 0;
      let linkDepth = 0;
      for (const token of block.children) {
        if (token.type === 'link_open') linkDepth += 1;
        const isCode = token.type === 'code_inline';
        if (linkDepth === 0 && (token.type === 'text' || isCode)) {
          const pattern = isCode ? /^(#[\da-fA-F]{6})$/g : /(^|\s)(#[\da-fA-F]{6})(?!\w)/g;
          const matches = [];
          for (const match of token.content.matchAll(pattern)) {
            const value = isCode ? match[1] : match[2];
            const index = match.index + (isCode ? 0 : match[1].length);
            const position = offset + index;
            if (!isCode && ((position > 0 && !/\s/.test(text[position - 1]))
                || /\w/.test(text[position + value.length] || ''))) continue;
            if (issueOffsets.has(position) || (prContext && /^#\d{6}$/.test(value))) continue;
            matches.push({ index, value });
          }
          if (matches.length) token.meta = { ...token.meta, hexColorSwatches: matches };
        }
        offset += visibleText(token).length;
        if (token.type === 'link_close') linkDepth -= 1;
      }
    }
  });

  const renderText = md.renderer.rules.text;
  md.renderer.rules.text = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const matches = token.meta?.hexColorSwatches;
    if (!matches) return renderText(tokens, index, options, env, renderer);
    let html = '';
    let start = 0;
    for (const match of matches) {
      html += md.utils.escapeHtml(token.content.slice(start, match.index));
      html += wrapColor(match.value, match.value);
      start = match.index + match.value.length;
    }
    return html + md.utils.escapeHtml(token.content.slice(start));
  };

  const renderCode = md.renderer.rules.code_inline;
  md.renderer.rules.code_inline = (tokens, index, options, env, renderer) => {
    const html = renderCode(tokens, index, options, env, renderer);
    const match = tokens[index].meta?.hexColorSwatches?.[0];
    return match ? wrapColor(match.value, html) : html;
  };
}
