"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "../features/auth/AuthProvider";
import { ThemeProvider, useTheme, type Theme } from "../features/theme/ThemeProvider";

function Notifications() {
  const { theme } = useTheme();
  return <Toaster theme={theme} richColors position="bottom-right" />;
}

export default function Providers({ children, initialTheme }: { children: React.ReactNode; initialTheme: Theme }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <ThemeProvider initialTheme={initialTheme}>
    <QueryClientProvider client={client}>
      <AuthProvider>
        {children}
        <Notifications />
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}
