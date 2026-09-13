import type { Json } from "@abonten/types/database.types";
import type {
  WeeklyAdminEdition,
  WeeklyAdminEditionHeader,
  WeeklyAdminItem,
  WeeklyAdminSection,
  WeeklyEditionDocument,
  WeeklyEditionHeader,
  WeeklyEventRow,
  WeeklyItem,
  WeeklyPlaceRow,
  WeeklySection,
  WeeklyValidation,
} from "@abonten/types/weeklyType";

// Maps the jsonb documents built by weekly_edition_document() /
// weekly_edition_view() into typed objects. Event and place rows keep the
// discovery RPC column names so EventCard and PlaceCard (web and mobile)
// render them as they are; the few fields those cards read that the weekly
// document does not carry are filled with the same defaults the discovery
// actions use.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
};
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function mapWeeklyEventRow(raw: unknown): WeeklyEventRow | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  const attendance = num(raw.attendance_count) ?? 0;
  const ticketTypes = arr(raw.ticket_types)
    .filter(isObj)
    .map((t) => ({
      price: num(t.price) ?? 0,
      currency: str(t.currency) ?? "GHS",
      quantity: num(t.quantity),
    }));
  return {
    ...(raw as unknown as WeeklyEventRow),
    address: isObj(raw.address)
      ? (raw.address as { full_address: string })
      : { full_address: "" },
    min_price: num(raw.min_price) ?? undefined,
    currency: str(raw.currency) ?? "GHS",
    capacity: num(raw.capacity) ?? undefined,
    attendance_count: attendance,
    attendanceCount: attendance,
    ticket_type: ticketTypes,
    organizer_username: str(raw.organizer_username),
    organizer_verified: bool(raw.organizer_verified),
  };
}

export function mapWeeklyPlaceRow(raw: unknown): WeeklyPlaceRow | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    owner_id: str(raw.owner_id) ?? "",
    name: str(raw.name) ?? "",
    slug: str(raw.slug) ?? "",
    description: "",
    category_id: num(raw.category_id) ?? 0,
    category_name: str(raw.category_name) ?? "",
    category_slug: str(raw.category_slug) ?? "",
    location: "",
    address: isObj(raw.address) ? raw.address : { full_address: "" },
    website_url: null,
    phone: null,
    whatsapp: null,
    cover_public_id: str(raw.cover_public_id) ?? "",
    cover_version: str(raw.cover_version) ?? "",
    status: str(raw.status) ?? "published",
    temporary_status: str(raw.temporary_status),
    claimed: bool(raw.claimed),
    verified: bool(raw.verified),
    created_at: str(raw.created_at) ?? "",
    avg_rating: num(raw.avg_rating),
    review_count: num(raw.review_count) ?? 0,
    is_open: bool(raw.is_open),
    distance_km: null,
  };
}

function mapItem(raw: Obj): WeeklyItem | null {
  const subjectType = raw.subjectType;
  if (subjectType !== "event" && subjectType !== "place") return null;
  return {
    id: String(raw.id),
    position: num(raw.position) ?? 0,
    subjectType,
    subjectId: String(raw.subjectId),
    headline: str(raw.headline),
    blurb: str(raw.blurb),
    event: subjectType === "event" ? mapWeeklyEventRow(raw.event) : null,
    place: subjectType === "place" ? mapWeeklyPlaceRow(raw.place) : null,
  };
}

function mapSection(raw: Obj): WeeklySection {
  return {
    id: String(raw.id),
    position: num(raw.position) ?? 0,
    kind: raw.kind as WeeklySection["kind"],
    subjectScope: (str(raw.subjectScope) ??
      "mixed") as WeeklySection["subjectScope"],
    layout: (str(raw.layout) ?? "carousel") as WeeklySection["layout"],
    title: str(raw.title) ?? "",
    subtitle: str(raw.subtitle),
    iconKey: str(raw.iconKey),
    body: str(raw.body),
    items: arr(raw.items)
      .filter(isObj)
      .map(mapItem)
      .filter((i): i is WeeklyItem => i !== null),
  };
}

function mapHeader(raw: Obj): WeeklyEditionHeader {
  return {
    id: String(raw.id),
    scopeSlug: str(raw.scopeSlug) ?? "",
    scopeName: str(raw.scopeName) ?? "",
    scopeIsNational: bool(raw.scopeIsNational),
    weekStart: str(raw.weekStart) ?? "",
    weekEnd: str(raw.weekEnd) ?? "",
    title: str(raw.title) ?? "",
    subtitle: str(raw.subtitle),
    intro: str(raw.intro),
    publishedAt: str(raw.publishedAt),
    weekIsOver: bool(raw.weekIsOver),
  };
}

/** A public document from weekly_edition_view(), or a preview from weekly_edition_document(p_admin false). */
export function mapWeeklyDocument(
  json: Json | null,
): WeeklyEditionDocument | null {
  if (!isObj(json) || !isObj(json.edition)) return null;
  const header = mapHeader(json.edition);
  return {
    edition: header,
    sections: arr(json.sections).filter(isObj).map(mapSection),
    requestedScope: str(json.requestedScope) ?? header.scopeSlug,
    isFallbackScope: bool(json.isFallbackScope),
    isPreviousWeek: bool(json.isPreviousWeek),
    isCurrent: json.isCurrent === undefined ? false : bool(json.isCurrent),
  };
}

export function mapWeeklyValidation(json: Json | null): WeeklyValidation {
  if (!isObj(json)) {
    return { canPublish: false, validItems: 0, errors: [], warnings: [] };
  }
  return {
    canPublish: bool(json.canPublish),
    validItems: num(json.validItems) ?? 0,
    errors: arr(json.errors) as WeeklyValidation["errors"],
    warnings: arr(json.warnings) as WeeklyValidation["warnings"],
  };
}

/** The admin document from weekly_edition_document(p_admin true). */
export function mapWeeklyAdminDocument(
  json: Json | null,
  validation: Json | null,
): WeeklyAdminEdition | null {
  if (!isObj(json) || !isObj(json.edition)) return null;
  const e = json.edition;
  const edition: WeeklyAdminEditionHeader = {
    ...mapHeader(e),
    scopeId: String(e.scopeId),
    scopeLat: num(e.scopeLat),
    scopeLng: num(e.scopeLng),
    scopeRadiusKm: num(e.scopeRadiusKm),
    status: (str(e.status) ?? "draft") as WeeklyAdminEditionHeader["status"],
    scheduledFor: str(e.scheduledFor),
    unpublishedAt: str(e.unpublishedAt),
    archivedAt: str(e.archivedAt),
    version: num(e.version) ?? 1,
    duplicatedFromEditionId: str(e.duplicatedFromEditionId),
    createdAt: str(e.createdAt) ?? "",
    updatedAt: str(e.updatedAt) ?? "",
  };
  const sections: WeeklyAdminSection[] = arr(json.sections)
    .filter(isObj)
    .map((raw) => {
      const base = mapSection({ ...raw, items: [] });
      const items: WeeklyAdminItem[] = arr(raw.items)
        .filter(isObj)
        .map((item) => {
          const subjectType = item.subjectType === "place" ? "place" : "event";
          return {
            id: String(item.id),
            position: num(item.position) ?? 0,
            subjectType,
            subjectId: String(item.subjectId),
            headline: str(item.headline),
            blurb: str(item.blurb),
            event:
              subjectType === "event" ? mapWeeklyEventRow(item.event) : null,
            place:
              subjectType === "place" ? mapWeeklyPlaceRow(item.place) : null,
            source: (str(item.source) ?? "manual") as WeeklyAdminItem["source"],
            pinned: bool(item.pinned),
            validity: str(item.validity) as WeeklyAdminItem["validity"],
            score: num(item.score),
            createdAt: str(item.createdAt) ?? "",
          };
        });
      return {
        ...base,
        isVisible: raw.isVisible !== false,
        config: isObj(raw.config) ? raw.config : {},
        updatedAt: str(raw.updatedAt) ?? "",
        items,
      };
    });
  return { edition, sections, validation: mapWeeklyValidation(validation) };
}
