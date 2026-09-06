'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Day/night switch — easy to hit on phone and desktop.
 * Shows Moon in daylight (tap to enter night), Sun at night (tap to surface).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" aria-label="Toggle theme" className={cn('h-9 w-9 rounded-full shrink-0', className)} />
    );
  }
  const isDark = theme === 'dark';
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'h-9 w-9 rounded-full shrink-0 gap-0 border-border/80 bg-card/60 backdrop-blur transition-colors',
        'hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-[18px] w-[18px] text-amber-400" /> : <Moon className="h-[18px] w-[18px] text-primary" />}
    </Button>
  );
}
