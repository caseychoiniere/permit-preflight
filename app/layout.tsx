export const metadata = {
  title: "Permit Preflight - Shed Screening (Prototype)",
  description: "Preliminary buildability screening for a proposed shed. Prototype - not a final regulatory determination.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Fixes a real bug: no page in this app ever declared a background color or a color-scheme,
    // so a transparent <body> let the *viewer's* own theme show through - in a dark browser/OS
    // theme, that renders as a near-black canvas behind this app's #1a1a1a (near-black) text,
    // making every page look blank/unresponsive even though it's rendering correctly underneath
    // (confirmed live: the parcel-confirmation UI this same session added WAS rendering after
    // clicking "Find parcel," just illegible against an unintended black background). Declaring
    // color-scheme: light plus an explicit white body background makes this app render
    // consistently regardless of the viewer's own theme, matching the light-theme styling
    // (#1a1a1a text, #ddd borders) every page already assumes.
    <html lang="en" style={{ colorScheme: "light" }}>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, color: "#1a1a1a", backgroundColor: "#ffffff" }}>{children}</body>
    </html>
  );
}
