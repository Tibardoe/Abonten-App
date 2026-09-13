// Emits one schema.org JSON-LD block for search engines (rich results for
// events and local businesses). Content comes from our own database rows,
// but "<" is still escaped so a listing title can never close the script
// tag. Renders nothing visible.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inline script content; the payload is JSON we serialise ourselves with "<" escaped.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
