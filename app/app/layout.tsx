import React from "react";
import type { Metadata } from "next";
import "./globals.css";
import "./polish.css";
import { AppShell } from "../src/components/AppShell";

export const metadata: Metadata = { title: { default: "Veriq", template: "%s · Veriq" }, description: "Quality-based settlement for autonomous agent work." };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><AppShell>{children}</AppShell></body></html>; }
