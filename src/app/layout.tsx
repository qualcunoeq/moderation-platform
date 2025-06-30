import type { Metadata } from "next";
// Rimosse le importazioni dei font Geist e Geist_Mono
import "./globals.css";

// Rimosse le dichiarazioni delle variabili dei font Geist

export const metadata: Metadata = {
  title: "AI Content Moderation Platform", // Titolo aggiornato come da esempio precedente
  description: "Your AI Content Moderation Platform", // Descrizione aggiornata come da esempio precedente
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Rimosso l'attributo className dal body per rimuovere l'applicazione del font */}
      <body>
        {children}
      </body>
    </html>
  );
}
