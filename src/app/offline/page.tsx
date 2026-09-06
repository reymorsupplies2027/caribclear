import { WifiOff } from 'lucide-react';
import { RetryButton } from './retry-button';

export const metadata = { title: 'Offline — CaribClear' };

export default function OfflinePage() {
  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="text-center max-w-sm">
        <div className="h-16 w-16 rounded-2xl bg-amber-500/15 grid place-items-center mx-auto mb-4">
          <WifiOff className="h-8 w-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-extrabold">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground mt-2">
          No signal right now. Anything you already opened is available from the saved copy, and any approval or note you make will sync automatically the moment the network returns.
        </p>
        <div className="mt-5 flex gap-4 justify-center items-center">
          <a href="/dashboard" className="text-sm font-semibold text-teal-600 hover:underline">Go to dashboard</a>
          <RetryButton />
        </div>
      </div>
    </div>
  );
}
