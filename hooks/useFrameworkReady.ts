import { useEffect } from 'react';

declare global {
  interface Window {
    frameworkReady?: () => void;
  }
}

export function useFrameworkReady() {
  useEffect(() => {
    // #region agent log
    try {
      const hasWindow = typeof window !== 'undefined';
      console.log('[DEBUG-b9137e]', 'useFrameworkReady:useEffect', 'window check', { hasWindow });
      fetch('http://127.0.0.1:7260/ingest/233848d3-ee49-4e11-b914-cf2c146394ee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b9137e' },
        body: JSON.stringify({ sessionId: 'b9137e', hypothesisId: 'H4', location: 'hooks/useFrameworkReady.ts:useEffect', message: 'window check', data: { hasWindow }, timestamp: Date.now() }),
      }).catch(() => {});
    } catch (e) {
      console.log('[DEBUG-b9137e]', 'useFrameworkReady:useEffect', 'log failed', { err: String(e) });
    }
    // #endregion
    window.frameworkReady?.();
  });
}
