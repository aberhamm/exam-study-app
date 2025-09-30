import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import Script from 'next/script';
import { HeaderProvider } from '@/contexts/HeaderContext';
import { Header } from '@/components/Header';
import { APP_CONFIG } from '@/lib/app-config';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: APP_CONFIG.APP_NAME,
  description: 'Interactive quiz app for studying',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Keep SSR and client in sync for theme class. A tiny pre-hydration
    // script in <head> sets the initial `dark` class before React hydrates
    // to prevent flashes and root-level hydration mismatches.
    <html lang="en" className="h-full">
      <head>
        {/* No-flash theme script: runs before hydration to set html.dark */}
        <Script id="theme-mode" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;c.toggle('dark', d);}catch(e){}})();`}
        </Script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}>
        <ThemeProvider>
          <HeaderProvider>
            <div className="min-h-screen bg-background">
              <div className="mx-auto w-full max-w-6xl px-6 md:px-10 lg:px-14">
                <div className="py-8">
                  <Header />
                </div>
                <div className="pb-8">
                  {children}
                </div>
              </div>
            </div>
          </HeaderProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
