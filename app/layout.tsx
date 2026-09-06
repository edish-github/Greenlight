import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Greenlight — find what will demonetize your video, before you upload it',
  description:
    'A pre-publish linter for video. Greenlight locates risky spans, cites the YouTube clause with its effective date, and renders a corrected file.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ink-950 font-sans text-slate-200 antialiased">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" aria-hidden />
              <span className="text-sm font-medium tracking-tight text-slate-100">Greenlight</span>
            </Link>
            <nav className="flex items-center gap-5 text-[13px] text-slate-400">
              <Link href="/compare" className="transition-colors hover:text-slate-200">
                Versus a bare model
              </Link>
              <a
                href="https://support.google.com/youtube/answer/6162278"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-slate-200"
              >
                YouTube guidelines
              </a>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
