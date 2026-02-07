# Build Fix — PostCSS “Unexpected token, expected ","” in src/index.css

## Error observed (Cloudflare Pages)
```
[vite:css] [postcss] Unexpected token, expected "," (10:3)
file: /opt/buildhome/repo/src/index.css:undefined:NaN
```

## Forensics (index.css)
Top of `src/index.css` with line numbers (PowerShell equivalent of `nl -ba ... | sed -n '1,120p'`):
```
  1: @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');
  2:
  3: :root {
  4:   --sand: #F6F1E9;
  5:   --linen: #FBF9F5;
  6:   --warm-linen: #FBF9F5;
  7:   --stone: #E6DFD4;
  8:   --driftwood: #CBBFAF;
  9:   --sea-glass: #9FBFBB;
 10:   --deep-ocean: #2F4F4F;
 11:   --charcoal: #1F2933;
 12:   --gold-accent: #D9C7A1;
 13:   --soft-gold: #D9C7A1;
 14:   --shell-noise: radial-gradient(circle at 1px 1px, rgba(47, 79, 79, 0.05) 1px, transparent 0);
 15: }
```

Hidden characters / line endings (PowerShell equivalent of `cat -A ... | sed -n '1,60p'`):
```
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap');<LF>
<CR><LF>
:root {<CR><LF>
  --sand: #F6F1E9;<CR><LF>
  --linen: #FBF9F5;<CR><LF>
  --warm-linen: #FBF9F5;<CR><LF>
  --stone: #E6DFD4;<CR><LF>
  --driftwood: #CBBFAF;<CR><LF>
  --sea-glass: #9FBFBB;<CR><LF>
  --deep-ocean: #2F4F4F;<CR><LF>
```

Hex dump of the start of the file (PowerShell `Format-Hex` equivalent of `xxd -g 1 -l 256`):
```
00000000   40 69 6D 70 6F 72 74 20 75 72 6C 28 27 68 74 74  @import url('htt
00000010   70 73 3A 2F 2F 66 6F 6E 74 73 2E 67 6F 6F 67 6C  ps://fonts.googl
```

Line 10 (the location reported by the error) is a valid CSS custom property and has only ASCII bytes:
```
Line10 text:   --deep-ocean: #2F4F4F;
Line10 bytes: 32 32 45 45 100 101 101 112 45 111 99 101 97 110 58 32 35 50 70 52 70 52 70 59
```

## Root cause
The failure did **not** originate from invalid CSS in `src/index.css`. The error was triggered by invalid JavaScript in `tailwind.config.js` (merge conflict markers), which caused Tailwind’s parser (sucrase) to throw while PostCSS was processing `src/index.css`.

Evidence (diff showing the exact offending characters):
```
-<<<<<<< HEAD
-=======
-  fontFamily: {
-    serif: ['"Cormorant Garamond"', 'serif'],
-    sans: ['Inter', 'sans-serif'],
-  },
->>>>>>> d37b4caaad1d17e72ef4a3f220961c2ff9eec2dd
```

## Minimal fix applied
- Removed the merge conflict markers from `tailwind.config.js` and restored the last known good Tailwind config content.
- No changes to `src/index.css` content beyond earlier conflict cleanup.

## Verification
Reproduced the error via Tailwind+PostCSS directly:
```
node -e "const fs=require('fs'); const postcss=require('postcss'); const tailwind=require('tailwindcss'); const autoprefixer=require('autoprefixer'); const css=fs.readFileSync('src/index.css','utf8'); postcss([tailwind, autoprefixer]).process(css,{from:'src/index.css'})..."
```
- Before fix: `Unexpected token, expected "," (10:3)`
- After fix: `tailwind+postcss ok`

Local `npm run build` could not be completed in this environment due to `spawn EPERM` (esbuild) and a locked `node_modules\.package-lock.json`. Cloudflare Pages should now pass the PostCSS step because Tailwind config is valid JS again.

## Minimal diff summary
- `tailwind.config.js`: removed merge conflict markers and kept the intended `extend.fontFamily` settings.
