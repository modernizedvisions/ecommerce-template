import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

type AdminModalWidth = 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  dataModal?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: AdminModalWidth;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  hideCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
}

const widthClassMap: Record<AdminModalWidth, string> = {
  xl: 'w-[min(96vw,640px)]',
  '2xl': 'w-[min(96vw,760px)]',
  '3xl': 'w-[min(96vw,900px)]',
  '4xl': 'w-[min(96vw,1080px)]',
  '5xl': 'w-[min(96vw,1280px)]',
};

export const AdminModal: React.FC<AdminModalProps> = ({
  open,
  onClose,
  dataModal,
  title,
  description,
  children,
  maxWidth = '3xl',
  headerActions,
  footer,
  panelClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
  hideCloseButton = false,
  closeOnOverlayClick = true,
  closeOnEsc = true,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const previousBodyOverflow = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeOnEsc, onClose]);

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

  const widthClass = useMemo(() => widthClassMap[maxWidth] || widthClassMap['3xl'], [maxWidth]);
  const showHeader = Boolean(title || description || headerActions || !hideCloseButton);

  if (!open) return null;

  const modal = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] overscroll-contain sm:p-6"
      onClick={(event) => {
        if (!closeOnOverlayClick) return;
        if (event.target === overlayRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        data-modal={dataModal}
        className={`admin-modal-panel admin-theme relative flex min-h-0 ${widthClass} max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex-col overflow-hidden ${panelClassName ?? ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {showHeader && (
          <div
            className={`shrink-0 border-b border-[var(--borderLight)] px-6 py-4 ${headerClassName ?? ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {title && <h2 className="text-lg font-semibold uppercase tracking-[0.14em] text-[var(--text)]">{title}</h2>}
                {description && <p className="mt-1 text-sm text-[var(--text2)]">{description}</p>}
              </div>
              <div className="flex items-center gap-2">
                {headerActions}
                {!hideCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="admin-btn-ghost px-3 py-1 text-[10px]"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 ${bodyClassName ?? ''}`}>
          {children}
        </div>

        {footer && (
          <div
            className={`admin-modal-footer shrink-0 border-t border-[var(--borderLight)] px-6 py-4 ${footerClassName ?? ''}`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
};
