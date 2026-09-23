import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ResolveAI — Incident Desk',
  description:
    'Investigate error logs, prioritize incidents, and document verified resolutions.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
