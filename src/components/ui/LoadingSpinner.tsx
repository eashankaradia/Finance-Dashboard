import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  message?: string;
}

export function LoadingSpinner({ fullScreen = false, message }: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
        {message && <p className="text-sm text-slate-500">{message}</p>}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={24} className="animate-spin text-indigo-600" />
    </div>
  );
}
