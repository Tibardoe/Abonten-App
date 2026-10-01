import { Platform } from "react-native";

// App Store rules this app follows on iOS (audit 2026-09-26, report 11).
//
// Featuring an event or place and promoting a Spotlight are digital
// services used inside the app, so Guideline 3.1.1 requires Apple's
// in-app purchase for them on iOS; paying through Paystack there gets the
// build rejected (report 09, "3.1.3(g) boosts"). Until promotions are sold
// through in-app purchase, the iPhone app neither sells them nor points
// anywhere else to buy them (3.1.1 also forbids steering outside the
// storefronts where that is allowed). People can still see and manage
// promotions they already have. Tickets are unaffected: they are for
// events attended in person (3.1.3(e)).
//
// Android and the web keep selling promotions through Paystack.
export const IN_APP_PROMOTION_PURCHASES = Platform.OS !== "ios";

/** Shown where the payment step would be on iOS. No link, no "buy it on…". */
export const PROMOTION_PURCHASE_UNAVAILABLE = "buyingPromotionsIsnTAvailableIn";
