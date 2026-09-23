import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '影像共振 · 展览互动', description: '上传你的影像，让它成为展览的一部分。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
