'use client';

export function RetryButton() {
  return (
    <button onClick={() => window.location.reload()} className="text-sm font-semibold text-teal-600 hover:underline">
      Try again
    </button>
  );
}
