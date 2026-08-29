import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Familjen_Grotesk } from 'next/font/google';
import { cookies } from 'next/headers';
import BottomTabBar from '@/components/nav/BottomTabBar';
import DesktopNav from '@/components/nav/DesktopNav';
import AutoRefresh from '@/components/AutoRefresh';
import HelpButton from '@/components/HelpButton';
import ThemeButton from '@/components/ThemeButton';
import './globals.css';

// Matchday programme, printed at night: a characterful editorial display
// face over a warm, readable grotesk. The body var keeps its historical
// name so the token bridge in globals.css stays untouched.
const body = Familjen_Grotesk({
  variable: '--font-hanken',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});
const display = Bricolage_Grotesque({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
});

// iOS paints the status bar area (clock, wifi, battery) from
// apple-mobile-web-app-status-bar-style, NOT from theme-color, and a single
// fixed value cannot match both themes: 'black' gives a black strip, which
// looks wrong over the light theme, and 'default' gives a light strip, which
// looks wrong over the dark one. So pick it per request from the theme
// cookie: dark -> 'black' (blends with #0a0912), light -> 'default'
// (light strip, dark text).
export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const theme = jar.get('epld_theme')?.value === 'light' ? 'light' : 'dark';
  return {
    title: 'EPL Fantasy Draft',
    description: 'Draft your squad, set your lineup, and see who knows ball.',
    appleWebApp: {
      capable: true,
      title: 'EPL Draft',
      // Opaque status bar in both themes: iOS reserves the strip, so the page
      // needs no top clearance at all. It is seamless because the strip
      // colours match the page exactly (dark page is #000, matching iOS's
      // black bar; light page is near-white, matching the default bar).
      statusBarStyle: theme === 'light' ? 'default' : 'black',
    },
  };
}

// theme-color is what iOS paints the status bar area with in an installed
// app, so it has to follow the user's chosen theme or you get a black strip
// above a light page. Read the same cookie the shell uses.
//
// No viewport-fit: cover on purpose. Letting iOS inset the web view itself
// keeps env(safe-area-inset-*) at 0, which is what makes a plain
// `fixed bottom-0` tab bar land exactly on the bottom edge.
export const THEME_COLORS = { dark: '#000000', light: '#e9e5db' } as const;

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
      className={`${body.variable} ${display.variable} h-full antialiased`}
    >
      {/* Plain document scroll with a fixed bottom bar, exactly like
          wc26-general. pb-tabbar reserves the bar's height at the end of
          the page so nothing hides behind it. */}
      <body className="min-h-full flex flex-col pb-tabbar">
        <div className="bg-atmosphere" aria-hidden />
        <div className="bg-grain" aria-hidden />
        <AutoRefresh
          initialBuildId={
            process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'
          }
        />
        <ThemeButton initial={theme} />
        <DesktopNav />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-2 lg:max-w-6xl lg:px-8 lg:pt-24">
          {children}
        </main>
        <BottomTabBar />
        <HelpButton />
      </body>
    </html>
  );
}
