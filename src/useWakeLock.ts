import { useEffect } from 'react';

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !navigator.wakeLock) return;
    let disposed = false;
    let lock: WakeLockSentinel | undefined;
    let pending = false;
    const acquire = async () => {
      if (disposed || pending || document.hidden || (lock && !lock.released)) return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (disposed || document.hidden) await next.release();
        else lock = next;
      } catch { /* Unsupported modes and low battery may deny a wake lock. */ }
      finally { pending = false; }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true; document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}
