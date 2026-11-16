import { Rocket } from 'lucide-react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col p-6 md:p-10">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <Rocket className="size-4" />
          </span>
          AutoMarket
        </Link>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-500 lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
          <p className="text-3xl leading-tight font-semibold">Your marketing, on autopilot.</p>
          <p className="mt-3 max-w-md text-white/80">
            Plan once. AutoMarket publishes everywhere, writes on-brand content with AI, and tells
            you what&apos;s working.
          </p>
        </div>
      </div>
    </div>
  );
}
