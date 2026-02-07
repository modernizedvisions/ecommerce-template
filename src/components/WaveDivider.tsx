import type { CSSProperties } from 'react';

interface WaveDividerProps {
  direction?: 'up' | 'down';
  fill?: string;
  className?: string;
  dataTestId?: string;
}

export function WaveDivider({ direction = 'down', fill = '#ffffff', className = '', dataTestId }: WaveDividerProps) {
  const transform = direction === 'down' ? 'scale(-1, -1)' : 'scale(1, -1)';

  return (
    <div
      className={`block w-full leading-[0] m-0 p-0 ${className}`}
      aria-hidden="true"
      data-testid={dataTestId}
    >
      <svg
        className="block w-full h-24 md:h-28 lg:h-32"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        role="presentation"
        style={{ transform, transformOrigin: 'center' } as CSSProperties}
      >
        <path
          d="M0,40 C180,80 360,20 540,50 C720,80 900,10 1080,50 C1260,90 1350,70 1440,40 L1440,0 L0,0 Z"
          fill={fill}
        />
      </svg>
    </div>
  );
}
