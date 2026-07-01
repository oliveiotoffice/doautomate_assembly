'use client';

import { ThemeProvider, useTheme } from './components/ThemeContext';

function InnerLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: theme.bodyBg,
        color: theme.bodyText,
        transition: 'background 0.3s ease, color 0.3s ease',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <main
        className="flex-1 overflow-hidden"
        style={{
          display: 'flex',
          minHeight: 0,
          height: '100%',
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default function AssemblyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <InnerLayout>{children}</InnerLayout>
    </ThemeProvider>
  );
}
