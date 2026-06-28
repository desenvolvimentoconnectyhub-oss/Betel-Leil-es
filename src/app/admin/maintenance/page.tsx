import MaintenanceClient from "./MaintenanceClient";
import { getMaintenanceStatus } from "@/lib/maintenance/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MaintenancePage() {
  const initialStatus = await getMaintenanceStatus();
  return <MaintenanceClient initialStatus={initialStatus} />;
}
