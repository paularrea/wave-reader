'use client';

import React, { useState } from 'react';
import { Drawer } from 'vaul';
import { Check, Waves } from 'lucide-react';
import { useStore, SkillLevel } from '@/store/useStore';

const LEVELS: Array<{ id: SkillLevel; label: string; description: string }> = [
  { id: 'beginner', label: 'Beginner', description: 'Alerts when waves break above 1.5 m' },
  { id: 'intermediate', label: 'Intermediate', description: 'No size alerts' },
  { id: 'expert', label: 'Expert', description: 'No size alerts' },
];

/**
 * The level only drives the safety alert; the score is the same for everyone.
 * It lives behind a chip because it is set once, not checked every visit.
 */
export function LevelPicker() {
  const { userSkillLevel, setUserSkillLevel } = useStore();
  const [open, setOpen] = useState(false);
  const current = LEVELS.find(l => l.id === userSkillLevel) ?? LEVELS[1];

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      <Drawer.Trigger asChild>
        <button
          type="button"
          data-testid="level-button"
          data-level={userSkillLevel}
          aria-label={`Your level: ${current.label}`}
          className="h-11 shrink-0 flex items-center gap-1.5 px-3.5 rounded-full bg-sheet/90 backdrop-blur-md border border-line text-[13px] font-medium text-ink-1"
        >
          <Waves size={15} className="text-ink-2" />
          {current.label}
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content
          data-testid="level-picker"
          className="bg-sheet text-ink-0 flex flex-col rounded-t-3xl fixed bottom-0 left-0 right-0 z-50 border-t border-line outline-none max-w-lg mx-auto"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-zinc-700 mt-2 shrink-0" />
          <div className="px-5 pt-3.5">
            <Drawer.Title className="text-[22px] font-semibold tracking-tight">Your level</Drawer.Title>
            <Drawer.Description className="text-[14px] text-ink-2 mt-1">
              Scores are the same for everyone. Your level only decides when a spot warns you it&apos;s too big.
            </Drawer.Description>
          </div>
          <ul className="px-5 mt-3 flex flex-col gap-2">
            {LEVELS.map(level => {
              const active = level.id === userSkillLevel;
              return (
                <li key={level.id}>
                  <button
                    type="button"
                    data-testid={`level-${level.id}`}
                    aria-pressed={active}
                    onClick={() => {
                      setUserSkillLevel(level.id);
                      setOpen(false);
                    }}
                    className={`w-full min-h-14 flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-left transition-colors ${
                      active ? 'border-ink-0 bg-raised' : 'border-line hover:bg-card'
                    }`}
                  >
                    <span className="flex flex-col flex-1 leading-tight">
                      <span className="text-[16px] font-medium">{level.label}</span>
                      <span className="text-[13px] text-ink-2 mt-0.5">{level.description}</span>
                    </span>
                    {active && <Check size={18} strokeWidth={2.5} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
