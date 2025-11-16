import type { ReactNode } from "react";
import "./globals.css";
import Toasts from "@/components/Toasts";

export const metadata = {
  title: "Men of War 2 Battle Planner Online",
  description: "Online tactical battle planner for Men of War II"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="h-screen w-screen overflow-hidden">
        {children}
        <Toasts />
      </body>
    </html>
  );
}
