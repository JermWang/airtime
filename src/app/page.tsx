import { StationHome } from "@/components/station/StationHome";

export const dynamic = "force-dynamic";

/** The front page: the live picture as the splash, everything that explains the
 *  network stacked underneath it. No WebGL. */
export default function HomePage() {
  return <StationHome channelId="MAIN" />;
}
