'use client';

import Header from './components/Header';
import { ThemeProvider, useTheme } from './components/ThemeContext';

function InnerLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const displayName = 'Super Admin';
  const displayRole = 'admin';

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: theme.bodyBg,
        color: theme.bodyText,
        transition: 'background 0.3s ease, color 0.3s ease',
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <Header name={displayName} role={displayRole} />
      </div>

      <main
        className="flex-1 overflow-hidden"
        style={{
          display: 'flex',
          minHeight: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default function SuperAdminLayout({
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
