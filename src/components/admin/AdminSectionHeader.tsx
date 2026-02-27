import React from 'react';

interface AdminSectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function AdminSectionHeader({ title, subtitle, className = '' }: AdminSectionHeaderProps) {
  return (
    <div className={`mb-6 text-center ${className}`}>
      <div className="admin-divider mx-auto mb-4 h-px w-24" />
      <h2 className="admin-header text-2xl md:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="admin-subtext mt-2 text-[11px] md:text-xs uppercase tracking-[0.18em] font-semibold">
          {subtitle}
        </p>
      )}
    </div>
  );
}
