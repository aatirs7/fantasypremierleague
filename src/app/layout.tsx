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
    // 'default' lets iOS paint the status bar area with the page's own
    // background in both themes. 'black-translucent' is only right when the
    // page draws under the status bar (viewport-fit: cover), which we do
    // not do, so it left a black strip up top.
    statusBarStyle: 'default',
  },
};

// theme-color is what iOS paints the status bar area with in an installed
// app, so it has to follow the user's chosen theme or you get a black strip
// above a light page. Read the same cookie the shell uses.
//
// No viewport-fit: cover on purpose. Letting iOS inset the web view itself
// keeps env(safe-area-inset-*) at 0, which is what makes a plain
// `fixed bottom-0` tab bar land exactly on the bottom edge.
export const THEME_COLORS = { dark: '#0a0912', light: '#f2f3f8' } as const;

export async function generateViewport(): Promise<Viewport> {
  const jar = await cookies();
  const theme = jar.get('epld_theme')?.value === 'light' ? 'light' : 'dark';
  return {
    themeColor: THEME_COLORS[theme],
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  };
}

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
      {/* Plain document scroll with a fixed bottom bar, exactly like
          wc26-general. pb-tabbar reserves the bar's height at the end of
          the page so nothing hides behind it. */}
      <body className="min-h-full flex flex-col pb-tabbar">
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
