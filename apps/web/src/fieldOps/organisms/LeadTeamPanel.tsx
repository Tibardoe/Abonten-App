"use client";

import { inviteFieldOpsTeamMember } from "@/actions/fieldOps/inviteFieldOpsTeamMember";
import { setFieldOpsLeadMemberStatus } from "@/actions/fieldOps/setFieldOpsLeadMemberStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { useToast } from "@/hooks/useToast";
import type { FieldOpsTeamMember } from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const ROLE_LABEL: Record<FieldOpsTeamMember["role"], string> = {
  team_lead: "Team lead",
  content_creator: "Content creator",
  offline_member: "Field member",
  online_member: "Online member",
};

/** The lead's team: invite by phone; suspend / reactivate / remove. */
export default function LeadTeamPanel({
  campaignId,
  members,
  canManage,
}: {
  campaignId: string;
  members: FieldOpsTeamMember[];
  canManage: boolean;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<
    "offline_member" | "online_member" | "content_creator"
  >("offline_member");
  const [acting, setActing] = useState<{
    id: string;
    status: "active" | "suspended" | "left";
  } | null>(null);
  const [reason, setReason] = useState("");

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await inviteFieldOpsTeamMember({
        campaignId,
        role,
        invitedPhoneE164: `+${phone.replace(/\D/g, "")}`,
        fullName,
      });
      if (res.status === 200) {
        toast.success(res.message ?? t("invited"));
        setPhone("");
        setFullName("");
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTInviteThem"));
      }
    });
  };

  const applyStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!acting) return;
    start(async () => {
      const res = await setFieldOpsLeadMemberStatus({
        campaignId,
        memberId: acting.id,
        status: acting.status,
        reason,
      });
      if (res.status === 200) {
        toast.success(res.message ?? t("updated"));
        setActing(null);
        setReason("");
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTDoThat"));
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y rounded-xl border">
        {members.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">
                  {m.fullName ??
                    m.username ??
                    m.invitedPhoneMasked ??
                    t("member")}
                </span>{" "}
                · {ROLE_LABEL[m.role]}
                {m.status === "invited" && m.invitedPhoneMasked
                  ? ` · ${m.invitedPhoneMasked}`
                  : ""}
              </span>
              <div className="flex items-center gap-2">
                <StatusChip status={m.status} />
                {canManage && m.role !== "team_lead" && !acting ? (
                  <>
                    {m.status === "active" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setActing({ id: m.id, status: "suspended" })
                        }
                      >
                        {t("suspend")}
                      </Button>
                    ) : null}
                    {m.status === "suspended" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setActing({ id: m.id, status: "active" })
                        }
                      >
                        {t("reactivate")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActing({ id: m.id, status: "left" })}
                    >
                      {t("remove")}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {m.suspendedReason && m.status === "suspended" ? (
              <p className="text-xs text-muted-foreground">
                {t("suspended", { suspendedReason: m.suspendedReason })}
              </p>
            ) : null}
            {acting?.id === m.id ? (
              <form onSubmit={applyStatus} className="flex flex-wrap gap-2">
                <Input
                  required
                  minLength={3}
                  maxLength={1000}
                  placeholder={t("reasonKeptOnRecord")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="max-w-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant={
                    acting.status === "active" ? "default" : "destructive"
                  }
                  disabled={pending}
                >
                  {t("confirm")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setActing(null)}
                >
                  {t("cancel")}
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {canManage ? (
        <form
          onSubmit={invite}
          className="flex flex-col gap-3 rounded-xl border p-4"
        >
          <h2 className="text-lg font-semibold">{t("inviteAMember")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("theyJoinTheMomentTheySign")}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="inv-name">{t("fullName")}</Label>
              <Input
                id="inv-name"
                required
                minLength={2}
                maxLength={120}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="inv-phone">{t("phoneInternational")}</Label>
              <Input
                id="inv-phone"
                required
                inputMode="tel"
                placeholder="+233241234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="inv-role">{t("role")}</Label>
              <Select
                id="inv-role"
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="offline_member">
                  {t("fieldMemberInPerson")}
                </option>
                <option value="online_member">{t("onlineMember")}</option>
                <option value="content_creator">{t("contentCreator")}</option>
              </Select>
            </div>
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {t("invite")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
