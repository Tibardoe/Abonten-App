import { requireAdmin } from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import { listAuditLogCore } from "@abonten/services/admin/audit/listAuditLogCore";
import {
  type ListEventsFilters,
  type ListOrganizersFilters,
  type ListPlacesFilters,
  getEventDetailCore,
  getOrganizerDetailCore,
  getPlaceDetailCore,
  listEventsCore,
  listOrganizersCore,
  listPlacesCore,
} from "@abonten/services/admin/catalog/catalogAdminCore";
import {
  type ListClaimsFilters,
  getClaimDetailCore,
  listClaimsCore,
} from "@abonten/services/admin/claims/claimsAdminCore";
import {
  type ListContentFilters,
  contentModerationCountsCore,
  listModeratableContentCore,
} from "@abonten/services/admin/content/contentBrowseCore";
import { getDashboardCore } from "@abonten/services/admin/dashboard/getDashboardCore";
import {
  getHealthSnapshotCore,
  getMetricsOverviewCore,
  listErrorGroupsCore,
  listIncidentsCore,
} from "@abonten/services/admin/observability/observabilityCore";
import {
  type ListReportsFilters,
  getReportDetailCore,
  listReportGroupsCore,
  listReportsCore,
} from "@abonten/services/admin/reports/reportsAdminCore";
import {
  getRoleMatrixCore,
  listAdminStaffCore,
} from "@abonten/services/admin/settings/adminSettingsCore";
import {
  type ListUsersFilters,
  getUserDetailCore,
  listUsersCore,
} from "@abonten/services/admin/users/usersAdminCore";
import type { DashboardRange } from "@abonten/types/adminTypes";

const REPORT_ATTACH_TTL = 300;

async function signReportAttachment(path: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .storage.from("report-attachments")
    .createSignedUrl(path, REPORT_ATTACH_TTL);
  return data?.signedUrl ?? null;
}

async function signClaimDocument(path: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .storage.from("place-claim-documents")
    .createSignedUrl(path, REPORT_ATTACH_TTL);
  return data?.signedUrl ?? null;
}

export async function loadDashboard(
  range: DashboardRange,
  from?: string,
  to?: string,
) {
  const ctx = await requireAdmin();
  return getDashboardCore(getServiceClient(), ctx, { range, from, to });
}

export async function loadReports(filters: ListReportsFilters) {
  const ctx = await requireAdmin();
  return listReportsCore(getServiceClient(), ctx, filters);
}

export async function loadReportGroups() {
  const ctx = await requireAdmin();
  return listReportGroupsCore(getServiceClient(), ctx, {
    onlyOpen: true,
    limit: 50,
  });
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

export async function loadAudit(
  filters: Parameters<typeof listAuditLogCore>[2],
) {
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

// ── Phase 2: Claims ─────────────────────────────────────────

export async function loadClaims(filters: ListClaimsFilters) {
  const ctx = await requireAdmin();
  return listClaimsCore(getServiceClient(), ctx, filters);
}

export async function loadClaimDetail(id: string) {
  const ctx = await requireAdmin();
  return getClaimDetailCore(getServiceClient(), ctx, id, {
    signDoc: signClaimDocument,
  });
}

// ── Phase 2: Content moderation browse ──────────────────────

export async function loadContent(filters: ListContentFilters) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [list, counts] = await Promise.all([
    listModeratableContentCore(svc, ctx, filters),
    contentModerationCountsCore(svc, ctx, filters.targetType),
  ]);
  return { list, counts };
}

// ── Phase 2: Catalog (events / places / organizers) ─────────

export async function loadEvents(filters: ListEventsFilters) {
  const ctx = await requireAdmin();
  return listEventsCore(getServiceClient(), ctx, filters);
}
export async function loadEventDetail(id: string) {
  const ctx = await requireAdmin();
  return getEventDetailCore(getServiceClient(), ctx, id);
}
export async function loadPlaces(filters: ListPlacesFilters) {
  const ctx = await requireAdmin();
  return listPlacesCore(getServiceClient(), ctx, filters);
}
export async function loadPlaceDetail(id: string) {
  const ctx = await requireAdmin();
  return getPlaceDetailCore(getServiceClient(), ctx, id);
}
export async function loadOrganizers(filters: ListOrganizersFilters) {
  const ctx = await requireAdmin();
  return listOrganizersCore(getServiceClient(), ctx, filters);
}
export async function loadOrganizerDetail(id: string) {
  const ctx = await requireAdmin();
  return getOrganizerDetailCore(getServiceClient(), ctx, id);
}
