import { requireAdmin } from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import { getDashboardCore } from "@abonten/services/admin/dashboard/getDashboardCore";
import { listAuditLogCore } from "@abonten/services/admin/audit/listAuditLogCore";
import {
  getReportDetailCore,
  listReportGroupsCore,
  listReportsCore,
  type ListReportsFilters,
} from "@abonten/services/admin/reports/reportsAdminCore";
import {
  getUserDetailCore,
  listUsersCore,
  type ListUsersFilters,
} from "@abonten/services/admin/users/usersAdminCore";
import {
  getHealthSnapshotCore,
  getMetricsOverviewCore,
  listErrorGroupsCore,
  listIncidentsCore,
} from "@abonten/services/admin/observability/observabilityCore";
import {
  getRoleMatrixCore,
  listAdminStaffCore,
} from "@abonten/services/admin/settings/adminSettingsCore";
import type { DashboardRange } from "@abonten/types/adminTypes";

const REPORT_ATTACH_TTL = 300;

async function signReportAttachment(path: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .storage.from("report-attachments")
    .createSignedUrl(path, REPORT_ATTACH_TTL);
  return data?.signedUrl ?? null;
}

export async function loadDashboard(range: DashboardRange, from?: string, to?: string) {
  const ctx = await requireAdmin();
  return getDashboardCore(getServiceClient(), ctx, { range, from, to });
}

export async function loadReports(filters: ListReportsFilters) {
  const ctx = await requireAdmin();
  return listReportsCore(getServiceClient(), ctx, filters);
}

export async function loadReportGroups() {
  const ctx = await requireAdmin();
  return listReportGroupsCore(getServiceClient(), ctx, { onlyOpen: true, limit: 50 });
}

export async function loadReportDetail(id: string) {
  const ctx = await requireAdmin();
  return getReportDetailCore(getServiceClient(), ctx, id, {
    signAttachment: signReportAttachment,
  });
}

export async function loadUsers(filters: ListUsersFilters) {
  const ctx = await requireAdmin();
  return listUsersCore(getServiceClient(), ctx, filters);
}

export async function loadUserDetail(id: string) {
  const ctx = await requireAdmin();
  return getUserDetailCore(getServiceClient(), ctx, id);
}

export async function loadAudit(filters: Parameters<typeof listAuditLogCore>[2]) {
  const ctx = await requireAdmin();
  return listAuditLogCore(getServiceClient(), ctx, filters);
}

export async function loadMonitoring() {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [health, errors, metrics, incidents] = await Promise.all([
    getHealthSnapshotCore(svc, ctx),
    listErrorGroupsCore(svc, ctx, { status: "all" }),
    getMetricsOverviewCore(svc, ctx, { sinceHours: 24 }),
    listIncidentsCore(svc, ctx),
  ]);
  return { ctx, health, errors, metrics, incidents };
}

export async function loadSettings() {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [staff] = await Promise.all([listAdminStaffCore(svc, ctx)]);
  return { ctx, staff, matrix: getRoleMatrixCore(ctx) };
}
