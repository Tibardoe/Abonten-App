// Moved to @abonten/core/eventDateValidation so the native event-creation
// wizard shares the exact same notice-period + range rules as the web
// create/edit forms. This file is kept as a re-export so existing web
// import sites (useEventUploadForm, useEventEditForm) don't change.
export {
  type DateEntry,
  type DateValidationResult,
  getBufferedNow,
  validateSingleDateRange,
  validateSpecificDates,
} from "@abonten/core/eventDateValidation";
