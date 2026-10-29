import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "DailyBits - 每天学一点",
  description: "发现、订阅并持续学习团队里的优质题库、知识卡片与 AI 资讯。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <template
          data-impeccable-direction="d1f8fdbb"
          dangerouslySetInnerHTML={{
            __html:
              "<!-- THESIS: DailyBits is a living learning catalogue, not a SaaS dashboard. OWN-WORLD: independent editorial catalogues and record sleeves lend warm paper, black ink, signal lime, compact metadata and one rhythmic bar motif. STORY: choose a channel, scan dense real material, subscribe, create, and return to progress. FIRST VIEWPORT: a compact masthead and channel rail lead directly into the catalogue. FORM: standard product controls inside a distinctive publishing system. SEED: d1f8fdbb9c8b8eda. -->",
          }}
        />
        <Providers>
          <div className="app-stage flex min-h-screen flex-col">
            <Header />
            <main className="mx-auto box-border w-full min-w-0 max-w-[1440px] flex-1 px-5 py-7 sm:px-7 lg:px-10 lg:py-9">
              {children}
            </main>
            <Footer />
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
