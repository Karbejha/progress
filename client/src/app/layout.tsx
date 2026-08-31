import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const qomraFont = localFont({
  src: [
    {
      path: '../../public/fonts/itfQomraArabic-Light.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../public/fonts/itfQomraArabic-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/itfQomraArabic-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/itfQomraArabic-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../public/fonts/itfQomraArabic-Black.ttf',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-qomra',
});

export const metadata: Metadata = {
  title: 'منظومة متابعة الخطط والإنجاز اليومي | المديرية العامة للموانئ',
  description: 'المنظومة التنفيذية لمتابعة وإدارة الخطط الصباحية وملخصات الإنجاز لمديريات ومكاتب المديرية العامة للموانئ',
  icons: {
    icon: [
      { url: '/assets/Syrian_logo_icon_gold.svg', type: 'image/svg+xml' },
      { url: '/assets/Syrian_logo_icon_gold.png', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: ['/assets/Syrian_logo_icon_gold.png'],
    apple: [
      { url: '/assets/Syrian_logo_icon_gold.png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`${qomraFont.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/assets/Syrian_logo_icon_gold.svg" type="image/svg+xml" />
        <link rel="icon" href="/assets/Syrian_logo_icon_gold.png" type="image/png" />
        <link rel="apple-touch-icon" href="/assets/Syrian_logo_icon_gold.png" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#f4f3ed] text-[#0c3e35]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
