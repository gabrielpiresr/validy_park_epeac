import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Validação de Ticket",
  description: "Fluxo simples para validação de ticket"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
