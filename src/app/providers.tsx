"use client";

import { useState, type ReactNode } from "react";
import { SolanaWalletProvider } from "@/lib/solana-wallet";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useRealtimeConnection, useServerClockSync } from "@/lib/hooks";

function Bridges() {
  useServerClockSync();
  useRealtimeConnection();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 3_000 },
        },
      }),
  );

  return (
    <SolanaWalletProvider>
      <QueryClientProvider client={queryClient}>
        <Bridges />
        {children}
      </QueryClientProvider>
    </SolanaWalletProvider>
  );
}
