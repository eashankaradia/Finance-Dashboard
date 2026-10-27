import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-1 text-2xl font-semibold">Page not found</h1>
        <Link href="/" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
