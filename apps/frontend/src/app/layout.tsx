import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: { default: 'DevTrack', template: '%s · DevTrack' },
  description: 'Issue and project tracking for small software teams.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#f5f6f8' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
