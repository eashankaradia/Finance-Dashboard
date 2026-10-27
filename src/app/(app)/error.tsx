'use client';

import { ErrorState } from '@/components/common';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState message={error.message || 'Something went wrong.'} onRetry={reset} />;
}
