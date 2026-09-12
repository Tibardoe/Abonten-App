---
title: Runbook — malicious content or upload
purpose: Remove illegal or dangerous media and files quickly and completely, including from the CDN and buckets.
audience: Moderators, engineering, founder
scope: Cloudinary media (avatars, flyers, photos, highlights, message attachments), Supabase Storage buckets (report attachments, claim documents, message attachments, field evidence)
status: Approved
version: 1.0
lastReviewed: 2026-09-12
technicalOwner: Engineering (repository owner)
businessOwner: Abonten Hub founder
legalReviewRequired: yes
complianceReviewRequired: no
---

# Runbook — malicious content or upload

Severity S1 for illegal imagery or malware; S2 otherwise.

1. **Detect:** report (`inappropriate`, `safety`), Content sweep, provider abuse notice (Cloudinary), antivirus flag on a downloaded attachment.
2. **Confirm:** view the minimum necessary; for suspected illegal imagery involving minors **do not** download or forward — record the asset id and stop; escalate immediately.
3. **Contain:** **Hide/Remove** the owning item (highlight, review, listing, message) so it disappears from every public read. Moderation does **not** delete the underlying media: an engineer runs a Cloudinary `destroy` on the public id (or deletes the storage object) so the URL stops serving. Suspend the uploader.
4. **Preserve:** for illegal content, preserve what law enforcement needs per counsel's instruction (asset id, uploader, timestamps) — not copies of the content itself.
5. **Assess:** other uploads by the same account (Content filtered by owner; Cloudinary folder per user); recipients (message attachments).
6. **Escalate:** founder; counsel; police where required; Cloudinary/Supabase abuse teams if their notice.
7. **Remediate:** Ban the account; destroy all their offending media; if malware was distributed via attachments, Broadcast a warning to recipients.
8. **Communicate:** per counsel.
9. **Verify:** URLs return 404; item states removed; account banned.
10. **Document / 11. Review:** consider server-side malware scanning for attachments and a moderation "purge media" action (product/engineering items).
