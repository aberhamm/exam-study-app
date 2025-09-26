import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
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
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}>
        <ThemeProvider>
          <HeaderProvider>
            <div className="min-h-screen bg-background">
              <div className="max-w-4xl mx-auto px-6">
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
