import React from 'react';
import { BRAND, MARK_ACCENT, MARK_BARS } from '@/services/brand';

/** The bars in the current text colour, the peak in epic yellow. */
export function BrandMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden focusable="false">
      {MARK_BARS.map(bar => (
        <rect
          key={bar.x}
          x={bar.x}
          y={28 - bar.height}
          width={4}
          height={bar.height}
          rx={2}
          fill={bar.accent ? MARK_ACCENT : 'currentColor'}
        />
      ))}
    </svg>
  );
}

/** Mark and wordmark: "wave" set heavier than "reader". */
export function BrandLockup({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-0" aria-label={BRAND.name} role="img">
      <BrandMark size={size} />
      <span
        aria-hidden
        className="font-semibold tracking-[-0.035em] leading-none whitespace-nowrap"
        style={{ fontSize: Math.round(size * 0.8) }}
      >
        wave<span className="font-normal text-ink-2">reader</span>
      </span>
    </span>
  );
}
