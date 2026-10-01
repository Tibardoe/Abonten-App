"use client";

import { createFieldOpsProspect } from "@/actions/fieldOps/createFieldOpsProspect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** "Add a business": logs a prospect in the territory the member is on. */
export default function ProspectForm({
  campaignId,
  territoryId,
}: {
  campaignId: string;
  territoryId: string;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"place" | "event" | "organizer">("place");
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("in_person");
  const [notes, setNotes] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createFieldOpsProspect({
        campaignId,
        territoryId,
        kind,
        name,
        contactName: contactName || null,
        contactPhoneE164: phone ? `+${phone.replace(/\D/g, "")}` : null,
        contactChannel: channel,
        notes: notes || null,
      });
      if (res.status === 200) {
        toast.success(res.message ?? t("saved"));
        setName("");
        setContactName("");
        setPhone("");
        setNotes("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTSaveThat"));
      }
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full md:w-auto">
        {t("addABusiness")}
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-kind">{t("whatIsIt")}</Label>
          <Select
            id="prospect-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="place">{t("aBusinessPlace")}</option>
            <option value="event">{t("anEvent")}</option>
            <option value="organizer">{t("anEventOrganizer")}</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-name">{t("name")}</Label>
          <Input
            id="prospect-name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("eGAuntieAmaSChop")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-contact">{t("whoDidYouSpeakTo")}</Label>
          <Input
            id="prospect-contact"
            maxLength={120}
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-phone">{t("theirPhoneInternational")}</Label>
          <Input
            id="prospect-phone"
            inputMode="tel"
            placeholder="+233241234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="prospect-channel">{t("how")}</Label>
          <Select
            id="prospect-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="in_person">{t("inPerson2")}</option>
            <option value="phone">{t("phoneCall")}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="social">{t("socialMedia")}</option>
            <option value="email">{t("email")}</option>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="prospect-notes">{t("notes")}</Label>
        <Textarea
          id="prospect-notes"
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
