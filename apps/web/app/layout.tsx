import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoManual AI - Autonomous SaaS Video Manuals',
  description: 'Convert authenticated web applications into professional user-manual videos autonomously.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-slate-950 text-slate-50 selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
