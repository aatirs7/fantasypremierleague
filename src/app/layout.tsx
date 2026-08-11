import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Hanken_Grotesk } from 'next/font/google';
import BottomTabBar from '@/components/nav/BottomTabBar';
import DesktopNav from '@/components/nav/DesktopNav';
import AutoRefresh from '@/components/AutoRefresh';
import './globals.css';

const display = Bebas_Neue({
  variable: '--font-bebas',
  subsets: ['latin'],
  weight: '400',
});

const body = Hanken_Grotesk({
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col pb-tabbar">
        <div className="bg-atmosphere" aria-hidden />
        <div className="bg-pitch" aria-hidden />
        <div className="bg-grain" aria-hidden />
        <AutoRefresh />
        <DesktopNav />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pt-14 lg:max-w-6xl lg:px-8 lg:pt-24">
          {children}
        </main>
        <BottomTabBar />
      </body>
    </html>
  );
}
