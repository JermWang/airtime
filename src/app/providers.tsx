"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getWagmiConfig } from "@/lib/wagmi";
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
  const [config] = useState(() => getWagmiConfig());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Bridges />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
