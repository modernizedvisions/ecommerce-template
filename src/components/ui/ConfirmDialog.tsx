import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

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
      ? 'lux-button px-4 py-2 text-[11px]'
      : 'lux-button px-4 py-2 text-[11px] !bg-rose-600 hover:!bg-rose-700';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !cancelDisabled) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelDisabled}
            className="lux-button--ghost px-4 py-2 text-[11px] disabled:opacity-50"
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
