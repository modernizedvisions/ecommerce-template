import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  overlayClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  overlayClassName,
  contentClassName,
  children,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange?.(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    previousBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (previousBodyOverflow.current !== null) {
        document.body.style.overflow = previousBodyOverflow.current;
      } else {
        document.body.style.overflow = '';
      }
    };
  }, [open]);

  if (!open) return null;

  const overlay = (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center bg-deep-ocean/40 px-4 py-4 backdrop-blur-[2px] sm:items-center sm:py-8 ${overlayClassName ?? ''}`}
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onOpenChange?.(false);
        }
      }}
    >
      <div
        className={`relative flex w-full max-w-2xl max-h-[92vh] flex-col overflow-hidden rounded-shell-lg border border-driftwood/70 bg-white lux-shadow ${contentClassName ?? ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return overlay;
  }

  return createPortal(overlay, document.body);
};

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export const DialogContent: React.FC<DialogContentProps> = ({ children, className }) => {
  return <div className={`p-6 space-y-4 text-charcoal ${className ?? ''}`}>{children}</div>;
};

interface DialogHeaderProps {
  children: React.ReactNode;
}

export const DialogHeader: React.FC<DialogHeaderProps> = ({ children }) => {
  return <div className="mb-4 space-y-2">{children}</div>;
};

interface DialogTitleProps {
  children: React.ReactNode;
}

export const DialogTitle: React.FC<DialogTitleProps> = ({ children }) => {
  return <h2 className="text-lg font-semibold uppercase tracking-[0.18em] text-deep-ocean">{children}</h2>;
};

interface DialogDescriptionProps {
  children: React.ReactNode;
}

export const DialogDescription: React.FC<DialogDescriptionProps> = ({ children }) => {
  return <p className="text-sm text-charcoal/75">{children}</p>;
};

interface DialogFooterProps {
  children: React.ReactNode;
}

export const DialogFooter: React.FC<DialogFooterProps> = ({ children }) => {
  return <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">{children}</div>;
};
