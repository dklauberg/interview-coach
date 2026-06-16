import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Coach",
  description: "Practice English job interviews by voice, with AI feedback.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
