// The operating company, as recorded by Ghana's Registrar-General's Department
// (Form 3 and Beneficial Ownership Profile, certified true copies dated
// 04-Feb-2026, held by the founder — not committed). Copyright lines, the
// public legal pages and internal documents all take the entity from here.
// Contact channels (support / privacy / security addresses) are deliberately
// NOT here: none has been designated yet (legal item A3).

export const LEGAL_ENTITY = {
  name: "Abonten Hub Ltd",
  /** Office of the Registrar of Companies number. */
  registrationNumber: "CS015010126",
  companyType: "Private company limited by shares",
  incorporationDate: "2026-01-24",
  jurisdiction: "Ghana",
  incorporationAct: "Companies Act, 2019 (Act 992)",
  registeredAddress:
    "House No. 10, Purple Street, near Mount Zion Church, Weija Block Factory, Accra, Ga South District, Greater Accra Region, Ghana",
  postalAddress: "P.O. Box 465, Weija, Accra, Ghana",
  digitalAddress: "GS-0257-3290",
} as const;

/** "Abonten Hub Ltd" — for copyright lines and legal footers. */
export const LEGAL_ENTITY_NAME = LEGAL_ENTITY.name;
