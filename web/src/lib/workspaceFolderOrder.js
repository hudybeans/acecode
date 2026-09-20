function workspaceHashes(workspaces) {
  if (!Array.isArray(workspaces)) return null;
  const hashes = workspaces.map((workspace) => workspace?.hash);
  if (hashes.some((hash) => typeof hash !== 'string' || !hash)
    || new Set(hashes).size !== hashes.length) return null;
  return hashes;
}

function isPermutation(hashes, baseline) {
  if (!Array.isArray(hashes) || hashes.length !== baseline.length) return false;
  const remaining = new Set(baseline);
  return hashes.every((hash) => remaining.delete(hash));
}

export function reorderWorkspaceFolders(workspaces, sourceHash, targetHash, placement = 'before') {
  if (!workspaceHashes(workspaces) || (placement !== 'before' && placement !== 'after')) return workspaces;
  const source = workspaces.findIndex((workspace) => workspace.hash === sourceHash);
  const target = workspaces.findIndex((workspace) => workspace.hash === targetHash);
  if (source < 0 || target < 0 || source === target) return workspaces;
  const next = [...workspaces];
  const [moved] = next.splice(source, 1);
  const destination = next.findIndex((workspace) => workspace.hash === targetHash);
  next.splice(destination + (placement === 'after' ? 1 : 0), 0, moved);
  return next.every((workspace, index) => workspace === workspaces[index]) ? workspaces : next;
}

// Reorder the latest objects, appending additions and never restoring removed folders.
export function applyWorkspaceFolderOrder(workspaces, hashes) {
  if (!workspaceHashes(workspaces) || !Array.isArray(hashes)) return workspaces;
  const remaining = new Map(workspaces.map((workspace) => [workspace.hash, workspace]));
  const next = [];
  for (const hash of hashes) {
    if (!remaining.has(hash)) continue;
    next.push(remaining.get(hash));
    remaining.delete(hash);
  }
  next.push(...remaining.values());
  return next.every((workspace, index) => workspace === workspaces[index]) ? workspaces : next;
}

export function workspaceFolderDropTarget(rows, bounds, x, y) {
  if (!Array.isArray(rows) || !rows.length || !bounds
    || ![x, y, bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)
    || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
  for (const row of rows) {
    if (y < (row.top + row.bottom) / 2) return { hash: row.hash, placement: 'before' };
    if (y <= row.bottom) return { hash: row.hash, placement: 'after' };
  }
  return { hash: rows[rows.length - 1].hash, placement: 'after' };
}

export function createWorkspaceFolderOrderController({
  getWorkspaces,
  setWorkspaces,
  save,
  onError = () => {},
  onSavingChange = () => {},
}) {
  let revision = 0;
  let saving = false;

  return {
    captureRefresh() {
      return revision;
    },

    acceptRefresh(workspaces, token) {
      const next = saving || token !== revision
        ? applyWorkspaceFolderOrder(workspaces, workspaceHashes(getWorkspaces()))
        : workspaces;
      setWorkspaces(next);
      return next;
    },

    async reorder(nextWorkspaces) {
      if (saving) return false;
      const current = getWorkspaces();
      const previousHashes = workspaceHashes(current);
      const nextHashes = workspaceHashes(nextWorkspaces);
      if (!previousHashes || !isPermutation(nextHashes, previousHashes)
        || nextHashes.every((hash, index) => hash === previousHashes[index])) return false;

      saving = true;
      revision++;
      setWorkspaces(applyWorkspaceFolderOrder(current, nextHashes));
      onSavingChange(true);
      let saveError;
      try {
        const confirmed = await save(nextHashes);
        if (!isPermutation(confirmed?.hashes, nextHashes)) {
          throw new Error('Invalid workspace folder order response');
        }
        setWorkspaces(applyWorkspaceFolderOrder(getWorkspaces(), confirmed.hashes));
        return true;
      } catch (error) {
        setWorkspaces(applyWorkspaceFolderOrder(getWorkspaces(), previousHashes));
        saveError = error;
      } finally {
        saving = false;
        // Also invalidate refreshes started while the write was pending.
        revision++;
        onSavingChange(false);
      }
      // A recovery refresh must start after the final revision is established.
      onError(saveError);
      return false;
    },
  };
}
