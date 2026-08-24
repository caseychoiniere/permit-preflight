export const metadata = {
  title: "Permit Preflight - Shed Screening (Prototype)",
  description: "Preliminary buildability screening for a proposed shed. Prototype - not a final regulatory determination.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, color: "#1a1a1a" }}>{children}</body>
    </html>
  );
}
