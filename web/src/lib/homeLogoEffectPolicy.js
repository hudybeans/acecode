// Temporarily suspend all logo shader effects; retain the renderer for restoration.
export const HOME_LOGO_SHADER_ENABLED = false;

export function nextHomeLogoEffectEnabled(currentEnabled, activeSessionId) {
  if (!currentEnabled) return false;
  return !activeSessionId;
}
