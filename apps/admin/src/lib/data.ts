import { requireAdmin } from "@/lib/adminGuard";
import { getServiceClient } from "@/lib/serviceClient";
import { getPlatformAnalyticsCore } from "@abonten/services/admin/analytics/analyticsAdminCore";
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
import { getCampaignAnalyticsCore } from "@abonten/services/admin/fieldOps/analyticsAdminCore";
import {
  type ListCampaignsFilters,
  getCampaignDetailCore,
  listCampaignsCore,
} from "@abonten/services/admin/fieldOps/campaignsAdminCore";
import {
  type ListCommissionFilters,
  getCommissionAdminDetailCore,
  listCommissionsAdminCore,
} from "@abonten/services/admin/fieldOps/commissionsAdminCore";
import { listContentAdminCore } from "@abonten/services/admin/fieldOps/contentAdminCore";
import {
  type ListOnboardingsFilters,
  getOnboardingAdminDetailCore,
  listOnboardingsAdminCore,
} from "@abonten/services/admin/fieldOps/onboardingsAdminCore";
import { getFieldOpsOverviewCore } from "@abonten/services/admin/fieldOps/overviewAdminCore";
import {
  getPayoutBatchCore,
  listPayoutBatchesCore,
  previewPayoutBatchCore,
} from "@abonten/services/admin/fieldOps/payoutsAdminCore";
import {
  getRegionDetailCore,
  listRegionsCore,
} from "@abonten/services/admin/fieldOps/regionsAdminCore";
import { listFlagQueueAdminCore } from "@abonten/services/admin/fieldOps/reviewQueueAdminCore";
import { listCommissionRulesCore } from "@abonten/services/admin/fieldOps/rulesAdminCore";
import { getFieldOpsSettingsCore } from "@abonten/services/admin/fieldOps/settingsAdminCore";
import { listTeamMembersCore } from "@abonten/services/admin/fieldOps/teamAdminCore";
import {
  type ListTransactionsFilters,
  getFinanceOverviewCore,
  getOrganizerFinanceCore,
  getTransactionDetailCore,
  listPayoutsCore,
  listRefundsCore,
  listTransactionsCore,
} from "@abonten/services/admin/finance/financeAdminCore";
import {
  type ListBlocksFilters,
  listConversationBlocksCore,
} from "@abonten/services/admin/moderation/blocksAdminCore";
import {
  type ListNotificationsFilters,
  getNotificationAdminCore,
  listNotificationsAdminCore,
} from "@abonten/services/admin/notifications/notificationsAdminCore";
import {
  getErrorGroupCore,
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
import { getNotificationDeliveryStatsCore } from "@abonten/services/admin/rewards/notificationDeliveryAdminCore";
import { getPromoterLoyaltySummaryCore } from "@abonten/services/admin/rewards/promoterLoyaltyAdminCore";
import { getRebateSummaryCore } from "@abonten/services/admin/rewards/rebateAdminCore";
import {
  getReferralSummaryCore,
  listRewardEventsCore,
  listRewardRulesCore,
} from "@abonten/services/admin/rewards/referralAdminCore";
import {
  getCreditAccountDetailCore,
  getRewardsOverviewCore,
  listCreditAccountsCore,
  listPendingCreditAdjustmentsCore,
} from "@abonten/services/admin/rewards/rewardsAdminCore";
import { globalSearchCore } from "@abonten/services/admin/search/globalSearchCore";
import {
  getRoleMatrixCore,
  listAdminStaffCore,
} from "@abonten/services/admin/settings/adminSettingsCore";
import {
  type ListSupportFilters,
  getSupportConversationDetailCore,
  listSupportConversationsCore,
} from "@abonten/services/admin/support/supportAdminCore";
import {
  type ListUsersFilters,
  getUserDetailCore,
  listUsersCore,
} from "@abonten/services/admin/users/usersAdminCore";
import {
  type ListVerificationFilters,
  getVerificationCaseDetailCore,
  listVerificationCasesCore,
  verificationOverviewCore,
} from "@abonten/services/admin/verification/verificationAdminCore";
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

// Verification evidence is business paperwork. The link is minted only for
// a reviewer the service already checked holds verification.evidence, and it
// expires in five minutes.
async function signVerificationEvidence(path: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .storage.from("verification-evidence")
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
  const [staff, matrix] = await Promise.all([
    listAdminStaffCore(svc, ctx),
    getRoleMatrixCore(svc, ctx),
  ]);
  return { ctx, staff, matrix };
}

// ── Notification operations ─────────────────────────────────

export async function loadNotifications(filters: ListNotificationsFilters) {
  const ctx = await requireAdmin();
  const list = await listNotificationsAdminCore(
    getServiceClient(),
    ctx,
    filters,
  );
  return { ctx, list };
}

export async function loadNotificationDetail(id: string) {
  const ctx = await requireAdmin();
  const detail = await getNotificationAdminCore(getServiceClient(), ctx, id);
  return { ctx, detail };
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

// ── Phase 3: Finance (read-only) ───────────────────────────

export async function loadFinanceOverview(
  range: DashboardRange,
  from?: string,
  to?: string,
) {
  const ctx = await requireAdmin();
  return getFinanceOverviewCore(getServiceClient(), ctx, { range, from, to });
}
export async function loadTransactions(filters: ListTransactionsFilters) {
  const ctx = await requireAdmin();
  return listTransactionsCore(getServiceClient(), ctx, filters);
}
export async function loadTransactionDetail(id: string) {
  const ctx = await requireAdmin();
  return getTransactionDetailCore(getServiceClient(), ctx, id);
}
export async function loadRefunds(
  filters: Parameters<typeof listRefundsCore>[2],
) {
  const ctx = await requireAdmin();
  return listRefundsCore(getServiceClient(), ctx, filters);
}
export async function loadPayouts(
  filters: Parameters<typeof listPayoutsCore>[2],
) {
  const ctx = await requireAdmin();
  return listPayoutsCore(getServiceClient(), ctx, filters);
}
export async function loadOrganizerFinance(id: string) {
  const ctx = await requireAdmin();
  return getOrganizerFinanceCore(getServiceClient(), ctx, id);
}

// ── Phase 4: error-group detail + analytics ────────────────

export async function loadErrorGroup(fingerprint: string) {
  const ctx = await requireAdmin();
  return getErrorGroupCore(getServiceClient(), ctx, fingerprint);
}

export async function loadAnalytics(
  range: DashboardRange,
  from?: string,
  to?: string,
) {
  const ctx = await requireAdmin();
  return getPlatformAnalyticsCore(getServiceClient(), ctx, { range, from, to });
}

// ── Phase 5: global search ─────────────────────────────────

export async function loadSearch(q: string) {
  const ctx = await requireAdmin();
  return globalSearchCore(getServiceClient(), ctx, { q });
}

// ── In-app support queue + blocked-users browser ────────────

export async function loadSupportQueue(filters: ListSupportFilters) {
  const ctx = await requireAdmin();
  return listSupportConversationsCore(getServiceClient(), ctx, filters);
}

export async function loadSupportConversation(id: string) {
  const ctx = await requireAdmin();
  return getSupportConversationDetailCore(getServiceClient(), ctx, id);
}

export async function loadBlocks(filters: ListBlocksFilters) {
  const ctx = await requireAdmin();
  return listConversationBlocksCore(getServiceClient(), ctx, filters);
}

// ── Rewards (Abonten Credit) ────────────────────────────────

export async function loadRewardsOverview(range: { from: string; to: string }) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [overview, pending] = await Promise.all([
    getRewardsOverviewCore(svc, ctx, range),
    listPendingCreditAdjustmentsCore(svc, ctx),
  ]);
  return { ctx, overview, pending };
}

export async function loadNotificationDelivery(sinceDays = 7) {
  const ctx = await requireAdmin();
  return getNotificationDeliveryStatsCore(getServiceClient(), ctx, sinceDays);
}

export async function loadCreditAccounts(
  filters: Parameters<typeof listCreditAccountsCore>[2],
) {
  const ctx = await requireAdmin();
  return listCreditAccountsCore(getServiceClient(), ctx, filters);
}

export async function loadReferrals(
  filters: Parameters<typeof listRewardEventsCore>[2],
  sinceDays = 30,
) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [summary, events] = await Promise.all([
    getReferralSummaryCore(svc, ctx, sinceDays),
    listRewardEventsCore(svc, ctx, {
      ...filters,
      ruleKeys: [
        "event_referral",
        "friend_referral_referrer",
        "friend_referral_referee",
      ],
    }),
  ]);
  return { ctx, summary, events };
}

export async function loadRebates(
  filters: Parameters<typeof listRewardEventsCore>[2],
  sinceDays = 90,
) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [summary, events] = await Promise.all([
    getRebateSummaryCore(svc, ctx, sinceDays),
    listRewardEventsCore(svc, ctx, {
      ...filters,
      ruleKeys: [
        "organizer_rebate",
        "venue_rebate",
        "organizer_milestone",
        "place_visits",
      ],
    }),
  ]);
  return { ctx, summary, events };
}

export async function loadPromoters(
  filters: Parameters<typeof listRewardEventsCore>[2],
  sinceDays = 30,
) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [summary, events] = await Promise.all([
    getPromoterLoyaltySummaryCore(svc, ctx, sinceDays),
    listRewardEventsCore(svc, ctx, {
      ...filters,
      ruleKeys: ["promoter_commission", "loyalty_fee_rebate"],
    }),
  ]);
  return { ctx, summary, events };
}

export async function loadRewardQueue(cursor?: string | null) {
  const ctx = await requireAdmin();
  const events = await listRewardEventsCore(getServiceClient(), ctx, {
    status: "held",
    cursor,
  });
  return { ctx, events };
}

export async function loadRewardRules() {
  const ctx = await requireAdmin();
  const rules = await listRewardRulesCore(getServiceClient(), ctx);
  return { ctx, rules };
}

// ── Field Ops (regional promotion programme) ────────────────

export async function loadFieldOpsOverview() {
  const ctx = await requireAdmin();
  const overview = await getFieldOpsOverviewCore(getServiceClient(), ctx);
  return { ctx, overview };
}

export async function loadFieldOpsCampaigns(filters: ListCampaignsFilters) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [campaigns, regions] = await Promise.all([
    listCampaignsCore(svc, ctx, filters),
    listRegionsCore(svc, ctx),
  ]);
  return { ctx, campaigns, regions };
}

export async function loadFieldOpsCampaign(campaignId: string) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [detail, members, rules] = await Promise.all([
    getCampaignDetailCore(svc, ctx, campaignId),
    listTeamMembersCore(svc, ctx, campaignId),
    listCommissionRulesCore(svc, ctx, campaignId),
  ]);
  return { ctx, detail, members, rules };
}

export async function loadFieldOpsRegions() {
  const ctx = await requireAdmin();
  const regions = await listRegionsCore(getServiceClient(), ctx);
  return { ctx, regions };
}

export async function loadFieldOpsRegion(regionId: string) {
  const ctx = await requireAdmin();
  const detail = await getRegionDetailCore(getServiceClient(), ctx, regionId);
  return { ctx, detail };
}

export async function loadFieldOpsRules() {
  const ctx = await requireAdmin();
  const rules = await listCommissionRulesCore(getServiceClient(), ctx, null);
  return { ctx, rules };
}

export async function loadFieldOpsOnboardings(filters: ListOnboardingsFilters) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [onboardings, campaigns] = await Promise.all([
    listOnboardingsAdminCore(svc, ctx, filters),
    listCampaignsCore(svc, ctx, { status: "all" }),
  ]);
  return { ctx, onboardings, campaigns };
}

export async function loadFieldOpsOnboarding(onboardingId: string) {
  const ctx = await requireAdmin();
  const detail = await getOnboardingAdminDetailCore(
    getServiceClient(),
    ctx,
    onboardingId,
  );
  return { ctx, detail };
}

export async function loadFieldOpsCommissions(filters: ListCommissionFilters) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [commissions, campaigns] = await Promise.all([
    listCommissionsAdminCore(svc, ctx, filters),
    listCampaignsCore(svc, ctx, { status: "all" }),
  ]);
  return { ctx, commissions, campaigns };
}

export async function loadFieldOpsCommission(commissionId: string) {
  const ctx = await requireAdmin();
  const detail = await getCommissionAdminDetailCore(
    getServiceClient(),
    ctx,
    commissionId,
  );
  return { ctx, detail };
}

export async function loadFieldOpsFlagQueue(filters: {
  campaignId?: string;
  cursor?: string;
}) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [queue, campaigns] = await Promise.all([
    listFlagQueueAdminCore(svc, ctx, filters),
    listCampaignsCore(svc, ctx, { status: "all" }),
  ]);
  return { ctx, queue, campaigns };
}

export async function loadFieldOpsPayouts(filters: {
  campaignId?: string;
  status?: string;
}) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [batches, campaigns] = await Promise.all([
    listPayoutBatchesCore(svc, ctx, filters),
    listCampaignsCore(svc, ctx, { status: "all" }),
  ]);
  // The preview only makes sense for one campaign at a time.
  const preview = filters.campaignId
    ? await previewPayoutBatchCore(svc, ctx, filters.campaignId)
    : null;
  return { ctx, batches, campaigns, preview };
}

export async function loadFieldOpsPayoutBatch(batchId: string) {
  const ctx = await requireAdmin();
  const detail = await getPayoutBatchCore(getServiceClient(), ctx, batchId);
  return { ctx, detail };
}

export async function loadFieldOpsContent(filters: {
  campaignId?: string;
  status?: string;
}) {
  const ctx = await requireAdmin();
  const svc = getServiceClient();
  const [content, campaigns] = await Promise.all([
    listContentAdminCore(svc, ctx, filters),
    listCampaignsCore(svc, ctx, { status: "all" }),
  ]);
  return { ctx, content, campaigns };
}

export async function loadFieldOpsCampaignAnalytics(campaignId: string) {
  const ctx = await requireAdmin();
  const analytics = await getCampaignAnalyticsCore(
    getServiceClient(),
    ctx,
    campaignId,
  );
  return { ctx, analytics };
}

export async function loadFieldOpsSettings() {
  const ctx = await requireAdmin();
  const settings = await getFieldOpsSettingsCore(getServiceClient(), ctx);
  return { ctx, settings };
}

export async function loadCreditAccountDetail(userId: string) {
  const ctx = await requireAdmin();
  const detail = await getCreditAccountDetailCore(
    getServiceClient(),
    ctx,
    userId,
  );
  return { ctx, detail };
}

// ── Trust & Verification ────────────────────────────────────

export async function loadVerificationCases(filters: ListVerificationFilters) {
  const ctx = await requireAdmin();
  return listVerificationCasesCore(getServiceClient(), ctx, filters);
}

export async function loadVerificationCaseDetail(id: string) {
  const ctx = await requireAdmin();
  return getVerificationCaseDetailCore(getServiceClient(), ctx, id, {
    signDoc: signVerificationEvidence,
  });
}

export async function loadVerificationOverview() {
  const ctx = await requireAdmin();
  return verificationOverviewCore(getServiceClient(), ctx);
}
