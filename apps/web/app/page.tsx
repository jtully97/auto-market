import { BarChart3, Brain, CalendarClock, Mail, Rocket, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LandingPricing } from './landing-pricing';

const FEATURES = [
  {
    icon: CalendarClock,
    title: 'Schedule everywhere',
    body: 'Instagram, TikTok, Facebook, YouTube, LinkedIn and X from one composer and one calendar. Queue posts into your best time slots automatically.',
  },
  {
    icon: Sparkles,
    title: 'AI content, if you want it',
    body: 'Opt in to on-brand captions, images and short videos powered by OpenAI and Higgsfield. You always see the credit cost first.',
  },
  {
    icon: Brain,
    title: 'An AI analyst for your niche',
    body: 'It researches your market lane — trends, audience, competitors — so AI content is relevant, not generic.',
  },
  {
    icon: BarChart3,
    title: 'Know what works',
    body: 'Engagement by platform, format and time of day, plus your top posts. Ask the analyst what to do next.',
  },
  {
    icon: Mail,
    title: 'Email campaigns built in',
    body: 'Import contacts from any CSV, write emails with AI, send to lists, track opens and clicks.',
  },
  {
    icon: Rocket,
    title: 'Real autopilot',
    body: 'Turn on Autopilot and every week AI drafts next week’s posts for your approval. Approve, relax, repeat.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <Rocket className="size-4" />
          </span>
          AutoMarket
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <a href="#pricing">Pricing</a>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Start free</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
        <p className="text-muted-foreground mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
          <Sparkles className="size-3.5 text-violet-500" /> Social, AI content, analytics and email
          in one place
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Put your marketing on autopilot.
        </h1>
        <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-balance">
          Plan once and AutoMarket keeps your channels posting. It writes on-brand content when you
          ask, shows you what&apos;s working, and sends your emails.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/register">Start free — no card</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#features">See how it works</a>
          </Button>
        </div>
      </section>

      <section id="features" className="bg-muted/40 border-y py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-background rounded-xl border p-6">
              <f.icon className="mb-4 size-6 text-violet-500" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          Simple plans, with credits for AI
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-center">
          Every plan includes monthly AI credits. Need more? Top up with credit packs any time.
          You&apos;re only charged when a generation succeeds.
        </p>
        <div className="mt-10">
          <LandingPricing />
        </div>
      </section>

      <footer className="text-muted-foreground border-t py-8 text-center text-sm">
        © AutoMarket
      </footer>
    </div>
  );
}
