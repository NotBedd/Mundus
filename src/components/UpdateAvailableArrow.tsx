/**
 * v0.8.1: green "update available" arrow shown next to the version badge
 * (Sidebar + Atlas) when a newer Mundus release exists on GitHub.
 *
 * Self-contained: runs one throttled update check on mount (see
 * lib/updateCheck.ts) and stays invisible on failure / when up to date.
 * Rendered as a <span> so it is valid nested inside the Sidebar's logo
 * <button>; clicking opens the GitHub releases page (routed to the system
 * browser in Electron via the window-open handler).
 */

import React, { useEffect, useState } from 'react';
import { CircleArrowUp } from 'lucide-react';
import { checkForUpdate, RELEASES_PAGE_URL, type UpdateCheckResult } from '../lib/updateCheck';

export const UpdateAvailableArrow: React.FC = () => {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let alive = true;
    checkForUpdate()
      .then((r) => {
        if (alive && r?.updateAvailable) setResult(r);
      })
      .catch(() => { /* never surface check errors in the UI */ });
    return () => { alive = false; };
  }, []);

  if (!result?.updateAvailable) return null;

  return (
    <span
      role="button"
      tabIndex={-1}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        try { window.open(result.releaseUrl || RELEASES_PAGE_URL, '_blank'); } catch { /* ignore */ }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center text-green-500 hover:text-green-400 transition-colors cursor-pointer"
      title={`Update available: ${result.latestVersion || 'newer version'} — click to get it`}
      data-mundus-update-arrow="true"
    >
      <CircleArrowUp className="w-3.5 h-3.5" />
    </span>
  );
};
