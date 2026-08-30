import "./globals.css";

export const metadata = {
  title: "Permit Preflight - Shed Screening (Prototype)",
  description: "Preliminary buildability screening for a proposed shed. Prototype - not a final regulatory determination.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
            <span className="text-base font-semibold tracking-tight text-slate-900">Permit Preflight</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Prototype</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
