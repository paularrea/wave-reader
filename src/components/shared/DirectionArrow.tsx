'use client';

import React from 'react';
import { compassPoint } from '@/services/conditions';

interface DirectionArrowProps {
  /** Bearing the swell or wind comes FROM, in degrees. */
  fromDegrees: number | null;
  size?: number;
  className?: string;
}

/**
 * Arrow for a meteorological bearing.
 *
 * Wind and swell directions are reported as the bearing they come *from*, but
 * an arrow is read as the way something travels. Drawing a "from 315" arrow
 * pointing at 315 would tell the surfer the exact opposite of the truth, so the
 * glyph is rotated to the reciprocal and the label keeps saying "from NW".
 */
export function DirectionArrow({ fromDegrees, size = 14, className = '' }: DirectionArrowProps) {
  if (fromDegrees === null) return null;

  const travelling = (fromDegrees + 180) % 360;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ transform: `rotate(${travelling}deg)` }}
      data-testid="direction-arrow"
      data-from={Math.round(fromDegrees)}
      aria-label={`From ${compassPoint(fromDegrees)}`}
      role="img"
    >
      {/* Points up at rotation 0, i.e. travelling north. */}
      <path
        d="M12 3 L18 20 L12 16 L6 20 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
