const UNLOCK_KEYS = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'b', 'a',
];
const STORAGE_KEY = 'acecode.developerModeUnlocked';
let unlockedInPage = false;

export function loadDeveloperModeUnlocked() {
  try {
    return unlockedInPage || window.sessionStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return unlockedInPage;
  }
}

export function rememberDeveloperModeUnlocked() {
  unlockedInPage = true;
  try { window.sessionStorage.setItem(STORAGE_KEY, 'true'); } catch { /* Session memory remains available. */ }
}

// Retain the longest matching suffix so an extra leading Up does not make
// users start over. Editable controls and unrelated shortcuts reset progress.
export function createDeveloperModeUnlock() {
  let entered = [];
  return (event) => {
    if (event.repeat || event.key === 'Shift' || event.key === 'CapsLock') return false;
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey
      || event.defaultPrevented || event.target?.isContentEditable
      || event.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
      entered = [];
      return false;
    }
    const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
    entered.push(key);
    while (entered.length && !entered.every((value, index) => value === UNLOCK_KEYS[index])) {
      entered.shift();
    }
    if (entered.length !== UNLOCK_KEYS.length) return false;
    entered = [];
    return true;
  };
}
