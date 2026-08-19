import "./globals.css";

export const metadata = {
  title: "DevCopilot",
  description: "AI engineering assistant scoped to GitHub + CI/CD",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
