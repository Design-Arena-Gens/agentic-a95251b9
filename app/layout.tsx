import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Sora-2 Inspired Video Generator",
  description: "Text-to-video generative playground running fully client-side."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
