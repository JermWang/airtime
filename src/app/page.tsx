import { StationShell } from "@/components/station/StationShell";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <StationShell channelId="MAIN" />;
}
