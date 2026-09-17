// Move one profile without reconstructing it or losing filtered-out entries.
export function reorderSavedModels(models, sourceName, targetName, placement = 'before') {
  const source = models.findIndex((model) => model.name === sourceName);
  const target = models.findIndex((model) => model.name === targetName);
  if (source < 0 || target < 0 || source === target) return models;
  if (placement !== 'before' && placement !== 'after') return models;
  const next = [...models];
  const [moved] = next.splice(source, 1);
  const destination = next.findIndex((model) => model.name === targetName);
  next.splice(destination + (placement === 'after' ? 1 : 0), 0, moved);
  return next.every((model, index) => model === models[index]) ? models : next;
}

export function savedModelDropTarget(rows, bounds, x, y) {
  if (!rows.length || x < bounds.left || x > bounds.right
    || y < bounds.top || y > bounds.bottom) return null;
  for (const row of rows) {
    if (y < (row.top + row.bottom) / 2) {
      return { name: row.name, placement: 'before' };
    }
  }
  return { name: rows[rows.length - 1].name, placement: 'after' };
}
