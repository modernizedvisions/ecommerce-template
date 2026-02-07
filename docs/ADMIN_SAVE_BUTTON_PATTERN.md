# Admin Save Button Pattern Report

## Hero Images Save Button (Source of Truth)
**File:** `src/components/admin/AdminHomeTab.tsx`  
**Component:** `HeroCollageAdmin`  
**State:** `saveState` (prop) controlled by `AdminHomeTab` (`'idle' | 'saving' | 'success' | 'error'`)

### Exact JSX
```tsx
<button
  onClick={onSave}
  disabled={saveState === 'saving'}
  className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
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
    'Save'
  )}
</button>
```

### State transitions (timing/behavior)
- `idle` → `saving` when user clicks Save (button disabled, spinner + "Saving...")
- `saving` → `success` after successful API save
- `success` → `idle` after 1500ms
- On error: `saveState` set to `error`, and a separate error banner in `AdminHomeTab` shows the message

### Styling / Variant
- **ClassName:** `inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60`
- **Spinner:** `<Loader2 className="h-4 w-4 animate-spin" />`
- **Success:** `<CheckCircle className="h-4 w-4 text-green-200" />` + label "Saved"

### Error feedback
Handled outside the button in `AdminHomeTab` via an error banner (not part of the button UI).
