import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Portfolio', template: '%s · Portfolio' },
  description: 'Personal investment and finance tracker',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Portfolio', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0e' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'rounded-xl' }} />
      </body>
    </html>
  );
}
