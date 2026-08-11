import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import BottomTabBar from '@/components/nav/BottomTabBar';
import DesktopNav from '@/components/nav/DesktopNav';
import AutoRefresh from '@/components/AutoRefresh';
import HelpButton from '@/components/HelpButton';
import ThemeButton from '@/components/ThemeButton';
import './globals.css';

// One face for everything, per the reference design. The CSS var keeps its
// historical name so the token bridge in globals.css stays untouched.
const body = Inter({
  variable: '--font-hanken',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'EPL Fantasy Draft',
  description: 'Draft your squad, set your lineup, and see who knows ball.',
  appleWebApp: {
    capable: true,
    title: 'EPL Draft',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0714',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Extend the page under the status bar / notch in the installed app, so
  // the backdrop is continuous instead of a cut-off colored strip.
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Floodlit Night is the default; only an explicit cookie switches to day.
  const jar = await cookies();
  const theme = jar.get('epld_theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-tabbar pt-[env(safe-area-inset-top)]">
        <div className="bg-atmosphere" aria-hidden />
        <AutoRefresh />
        <ThemeButton initial={theme} />
        <DesktopNav />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 lg:max-w-6xl lg:px-8 lg:pt-24">
          {children}
        </main>
        <BottomTabBar />
        <HelpButton />
      </body>
    </html>
  );
}
