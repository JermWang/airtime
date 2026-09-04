import { StationShell } from "@/components/station/StationShell";

export const dynamic = "force-dynamic";

/** The auditorium: the 3D room, the picture and the two panels beside it. */
export default function StationPage() {
  return <StationShell channelId="MAIN" />;
}
