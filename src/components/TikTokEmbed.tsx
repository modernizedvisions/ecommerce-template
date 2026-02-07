import { useEffect, useRef, useState } from 'react';

const TIKTOK_SCRIPT_SRC = 'https://www.tiktok.com/embed.js';
let tiktokScriptPromise: Promise<void> | null = null;

function loadTikTokScript() {
  if (tiktokScriptPromise) return tiktokScriptPromise;

  // If script already in the DOM, reuse it
  const existing = document.querySelector(`script[src="${TIKTOK_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
  if (existing) {
    tiktokScriptPromise = existing.dataset.loaded === 'true'
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener('load', () => {
            existing.dataset.loaded = 'true';
            resolve();
          });
          existing.addEventListener('error', () => reject(new Error('TikTok embed failed to load')));
        });
    return tiktokScriptPromise;
  }

  tiktokScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TIKTOK_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error('TikTok embed failed to load'));
    document.body.appendChild(script);
  });

  return tiktokScriptPromise;
}

interface TikTokEmbedProps {
  videoId: string;
  citeUrl: string;
}

type EmbedStatus = 'loading' | 'loaded' | 'failed';

export function TikTokEmbed({ videoId, citeUrl }: TikTokEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<EmbedStatus>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pollId: number | null = null;
    let timeoutId: number | null = null;

    setStatus('loading');

    const startPolling = () => {
      pollId = window.setInterval(() => {
        const iframe = containerRef.current?.querySelector('iframe');
        if (iframe) {
          if (!cancelled) setStatus('loaded');
          if (pollId) window.clearInterval(pollId);
          if (timeoutId) window.clearTimeout(timeoutId);
        }
      }, 250);

      timeoutId = window.setTimeout(() => {
        if (!cancelled) setStatus('failed');
        if (pollId) window.clearInterval(pollId);
      }, 7000);
    };

    loadTikTokScript()
      .then(() => {
        if (cancelled) return;
        if ((window as any).tiktokEmbed?.load) {
          (window as any).tiktokEmbed.load();
        }
        startPolling();
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [retryKey]);

  return (
    <div className="w-full">
      <div className="relative w-full max-w-[420px] mx-auto">
        <div className="relative w-full min-h-[520px] sm:min-h-[560px] overflow-hidden rounded-md border border-slate-200 bg-white">
          <div ref={containerRef} className="w-full">
            <blockquote
              key={`${videoId}-${retryKey}`}
              className="tiktok-embed"
              cite={citeUrl}
              data-video-id={videoId}
              style={{ maxWidth: 605, minWidth: 280, width: '100%' }}
            >
              <section>
                <a
                  target="_blank"
                  rel="noreferrer noopener"
                  title="@thechesapeakeshell"
                  href="https://www.tiktok.com/@thechesapeakeshell?refer=embed"
                >
                  @thechesapeakeshell
                </a>
                {' '}Packing up orders is as much fun for me as it is to make the orders!{' '}
                <a
                  title="christmasornaments"
                  target="_blank"
                  rel="noreferrer noopener"
                  href="https://www.tiktok.com/tag/christmasornaments?refer=embed"
                >
                  #christmasornaments
                </a>{' '}
                <a
                  title="shellart"
                  target="_blank"
                  rel="noreferrer noopener"
                  href="https://www.tiktok.com/tag/shellart?refer=embed"
                >
                  #shellart
                </a>{' '}
                <a
                  title="crafttok"
                  target="_blank"
                  rel="noreferrer noopener"
                  href="https://www.tiktok.com/tag/crafttok?refer=embed"
                >
                  #crafttok
                </a>{' '}
                <a
                  title="coastaldecor"
                  target="_blank"
                  rel="noreferrer noopener"
                  href="https://www.tiktok.com/tag/coastaldecor?refer=embed"
                >
                  #coastaldecor
                </a>{' '}
                <a
                  title="handmadegifts"
                  target="_blank"
                  rel="noreferrer noopener"
                  href="https://www.tiktok.com/tag/handmadegifts?refer=embed"
                >
                  #handmadegifts
                </a>{' '}
                <a
                  target="_blank"
                  rel="noreferrer noopener"
                  title="ŸT¦ Gabrielle (From Paris When It Sizzles) - Audrey Hepburn / Nelson Riddle"
                  href="https://www.tiktok.com/music/Gabrielle-From-Paris-When-It-Sizzles-239015199201030144?refer=embed"
                >
                  ŸT¦ Gabrielle (From Paris When It Sizzles) - Audrey Hepburn / Nelson Riddle
                </a>
              </section>
            </blockquote>
          </div>

          {status === 'failed' && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/95">
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <p className="text-sm font-medium text-slate-700">Having trouble loading this.</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <a
                    href={citeUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    aria-label="Open TikTok video in a new tab"
                  >
                    Open on TikTok
                  </a>
                  <button
                    type="button"
                    onClick={() => setRetryKey((key) => key + 1)}
                    className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    aria-label="Retry TikTok video"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
