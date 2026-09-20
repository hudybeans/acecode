import { useCallback, useSyncExternalStore } from 'react';
import { sessionWorkbench } from './sessionWorkbench.js';

export function useWorkbenchState(owner, field, initial) {
  const subscribe = useCallback((notify) => sessionWorkbench.subscribe(notify), []);
  const getSnapshot = () => sessionWorkbench.get(owner, field, initial);
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setValue = useCallback((updater) => sessionWorkbench.set(owner, field, updater, initial), [owner, field]);
  return [value, setValue];
}
