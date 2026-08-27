import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EPL Fantasy Draft',
    short_name: 'EPL Draft',
    description: 'Draft your squad, set your lineup, and see who knows ball.',
    start_url: '/home',
    display: 'standalone',
    // Every screen is a single portrait column; landscape only ever
    // stretched it into something nobody designed.
    orientation: 'portrait',
    background_color: '#0a0912',
    theme_color: '#0a0912',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
