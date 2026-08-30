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
  title: 'نظام متابعة الخطط والإنجاز اليومي | المديرية العامة للموانئ',
  description: 'المنظومة التنفيذية لمتابعة وإدارة الخطط الصباحية وملخصات الإنجاز لمديريات ومكاتب المديرية العامة للموانئ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`${qomraFont.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans bg-[#f4f3ed] text-[#0c3e35]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
