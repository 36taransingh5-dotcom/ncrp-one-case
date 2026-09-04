import "./globals.css";
import "./enhancements.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NCRP One Case",
  description: "One report. One case. One truth.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
