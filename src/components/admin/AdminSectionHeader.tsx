import React from 'react';

interface AdminSectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function AdminSectionHeader({ title, subtitle, className = '' }: AdminSectionHeaderProps) {
  return (
    <div className={`mb-6 text-center ${className}`}>
      <h2 className="lux-heading text-2xl md:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="lux-subtitle mt-2 text-[11px] md:text-xs uppercase tracking-[0.28em] font-semibold text-deep-ocean/80">
          {subtitle}
        </p>
      )}
    </div>
  );
}
