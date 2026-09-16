// Sizes are border-box CSS pixels. Return a scrollable menu rectangle contained
// in the viewport, keeping the preferred below-anchor placement when it fits.
export function anchoredMenuPosition({
  anchorRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  maxHeight = viewportHeight,
  preferredPlacement = 'below',
  gap = 4,
  margin = 8,
}) {
  const width = Math.min(menuWidth, Math.max(0, viewportWidth - margin * 2));
  const desiredHeight = Math.min(menuHeight, maxHeight);
  const below = Math.max(0, viewportHeight - margin - anchorRect.bottom - gap);
  const above = Math.max(0, anchorRect.top - gap - margin);
  const placement = preferredPlacement === 'above'
    ? (desiredHeight <= above || above >= below ? 'above' : 'below')
    : (desiredHeight <= below || below >= above ? 'below' : 'above');
  const heightLimit = Math.min(maxHeight, placement === 'below' ? below : above);
  const height = Math.min(menuHeight, heightLimit);
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  return {
    left: clamp(anchorRect.left, margin, viewportWidth - margin - width),
    top: clamp(
      placement === 'below' ? anchorRect.bottom + gap : anchorRect.top - gap - height,
      margin,
      viewportHeight - margin - height,
    ),
    width,
    maxHeight: heightLimit,
    placement,
  };
}
