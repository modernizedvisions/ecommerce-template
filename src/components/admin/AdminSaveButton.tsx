import { CheckCircle, Loader2 } from 'lucide-react';

export type AdminSaveState = 'idle' | 'saving' | 'success' | 'error';

interface AdminSaveButtonProps {
  saveState: AdminSaveState;
  onClick: () => void;
  disabled?: boolean;
  idleLabel?: string;
}

export function AdminSaveButton({
  saveState,
  onClick,
  disabled = false,
  idleLabel = 'Save',
}: AdminSaveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || saveState === 'saving'}
      className="lux-button px-4 py-2 text-[11px] tracking-[0.22em]"
    >
      {saveState === 'saving' ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : saveState === 'success' ? (
        <>
          <CheckCircle className="h-4 w-4 text-green-200" />
          Saved
        </>
      ) : (
        idleLabel
      )}
    </button>
  );
}
