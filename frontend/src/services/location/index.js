import { createBrowserProvider } from './browser-provider.js';
import { createNativeProvider } from './native-provider.js';
/** Chooses the strongest available provider: native bridge (Batch 3, Android APK) else browser. */
export function selectProvider(env = globalThis) {
  const bridge = env.GopsNativeLocation;
  if (bridge && typeof bridge.isAvailable === 'function' && bridge.isAvailable()) return createNativeProvider(bridge);
  return createBrowserProvider(env);
}
