import React from 'react';
import { AdminModal } from '../admin/AdminModal';

type ConfirmVariant = 'danger' | 'primary';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: ConfirmVariant;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  description = "This action can't be undone.",
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  confirmDisabled = false,
  cancelDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClasses =
    confirmVariant === 'primary'
      ? 'admin-btn-primary px-4 py-2 text-[11px]'
      : 'admin-btn-danger px-4 py-2 text-[11px]';

  return (
    <AdminModal
      open={open}
      onClose={() => {
        if (!cancelDisabled) onCancel();
      }}
      title={title}
      description={description}
      maxWidth="xl"
      closeOnOverlayClick={!cancelDisabled}
      hideCloseButton={cancelDisabled}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelDisabled}
            className="admin-btn-secondary px-4 py-2 text-[11px] disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`disabled:opacity-50 ${confirmClasses}`}
          >
            {confirmText}
          </button>
        </div>
      }
    >
      <div className="text-sm text-[var(--text2)]">{description}</div>
    </AdminModal>
  );
}
