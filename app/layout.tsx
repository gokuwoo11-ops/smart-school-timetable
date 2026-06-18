import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart School Timetable",
  description: "User-friendly school timetable generator"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
