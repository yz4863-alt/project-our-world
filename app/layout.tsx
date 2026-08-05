import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jason + Ania | Globe",
  description: "An interactive 3D map of places Jason and Ania have been.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
