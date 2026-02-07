# Build Fix — PostCSS “Unknown word” in src/index.css

## Error observed
Cloudflare Pages:
```
[vite:css] [postcss] src/index.css:1:1 Unknown word
```

Local reproduction attempts (this environment):
- `npm ci` failed with EPERM (cannot unlink `node_modules\.package-lock.json`).
- `npm run build` failed with EPERM (esbuild spawn) before CSS parsing.

## Root cause
`src/index.css` contained unresolved git merge conflict markers at the very top of the file. The first token was:
```
<<<<<<< HEAD
```
PostCSS treats `<<` at 1:1 as invalid and throws “Unknown word”.

## Evidence (exact offending bytes / lines)
First 40 lines (showing the conflict marker at line 1):
```
<<<<<<< HEAD
=======
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --sand: #F6F1E9;
  --linen: #FBF9F5;
  --warm-linen: #FBF9F5;
  --stone: #E6DFD4;
  --driftwood: #CBBFAF;
  --sea-glass: #9FBFBB;
  --deep-ocean: #2F4F4F;
  --charcoal: #1F2933;
  --gold-accent: #D9C7A1;
  --soft-gold: #D9C7A1;
  --shell-noise: radial-gradient(circle at 1px 1px, rgba(47, 79, 79, 0.05) 1px, transparent 0);
}

>>>>>>> d37b4caaad1d17e72ef4a3f220961c2ff9eec2dd
@tailwind base;
```

First 64 bytes (PowerShell equivalent of the requested Python output):
```
First 64 bytes: 60 60 60 60 60 60 60 32 72 69 65 68 13 10 61 61 61 61 61 61 61 13 10 64 105 109 112 111 114 116 32 117 114 108 40 39 104 116 116 112 115 58 47 47 102 111 110 116 115 46 103 111 111 103 108 101 97 112 105 115 46 99 111 109
```

First 200 chars repr (PowerShell output):
```
"\u003c\u003c\u003c\u003c\u003c\u003c\u003c HEAD\r\n=======\r\n@import url(\u0027https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700\u0026family=Inter:wght@300;400;500;600;700\u0026display=swap\u0027);\r\n\r\n:root {\r\n  --sand: #F6F1E9"
```

Hex view of the start of the file (PowerShell `Format-Hex`):
```
00000000   3C 3C 3C 3C 3C 3C 3C 20 48 45 41 44 0D 0A 3D 3D  <<<<<<< HEAD..==
```

Control-character view (PowerShell equivalent of `cat -A`):
```
<<<<<<< HEAD<CR><LF>
=======<CR><LF>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');<CR><LF>
```

## Git history comparison
Recent history:
- `git log -n 10 --oneline -- src/index.css`
- Last known good: `7e1b11b` (pre-merge conflict).

Diff against good version:
- The only top-of-file change was the insertion of conflict markers around the `@import` + `:root` block.
- Another conflict block appeared inside `@layer base` and replaced the intended body typography with a different snippet.

## Fix applied (minimal)
- Removed conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in `src/index.css`.
- Kept the intended `@import` + `:root` block and the body styles from the last known good version.
- Restored `@apply font-serif;` on heading tags to match the prior, working styles.

No other CSS was changed.

## Verification
Commands run:
```
rg -n "<<<<<<<|=======|>>>>>>>" src/index.css
```
Result: no matches (conflict markers removed).

Local build note:
- `npm run build` still fails in this environment due to `Error: spawn EPERM` (esbuild spawn issue). This is unrelated to the PostCSS error and prevented a full local build confirmation here.

## Minimal diff summary
- `src/index.css`: removed merge conflict markers and preserved the previously working `@import`, `:root`, and base typography rules.
