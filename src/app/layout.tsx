import "./globals.css";

export const metadata = {
  title: "Sguild Swim Instruction — Choose Your Location",
  description:
    "Select your city to get started with Sguild Swim Instruction. Serving O'ahu (Honolulu) and Dallas–Fort Worth with private lessons focused on technique and water safety.",
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16.png" />
        <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
        <link rel="manifest" href="/assets/site.webmanifest" />
        <meta name="theme-color" content="#0ea5e9" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-50 text-slate-800">{children}</body>
    </html>
  );
}

