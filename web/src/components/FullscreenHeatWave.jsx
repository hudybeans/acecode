import { useEffect } from 'react';
import { installFullscreenHeatWave } from '../lib/fullscreenHeatWave.js';

export function FullscreenHeatWave() {
  useEffect(() => installFullscreenHeatWave(), []);
  return null;
}
