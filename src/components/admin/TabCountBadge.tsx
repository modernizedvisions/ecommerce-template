import React from 'react';

interface TabCountBadgeProps {
  count: number;
  className?: string;
}

export const TabCountBadge: React.FC<TabCountBadgeProps> = ({ count, className = '' }) => {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (safeCount <= 0) return null;

  const label = safeCount > 99 ? '99+' : String(safeCount);

  return (
    <span
      className={`notif-circle inline-flex h-5 min-w-5 items-center justify-center px-1.5 text-[11px] font-semibold leading-none tabular-nums bg-[var(--accent)] text-[var(--accentContrast)] border border-[var(--border)] shadow-sm ${className}`}
      aria-label={`${safeCount} unread`}
    >
      {label}
    </span>
  );
};

