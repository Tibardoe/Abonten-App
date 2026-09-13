// One sentence describing a chart, for the people who cannot see it.
//
// A chart is an image to a screen reader and to anyone reading a printed
// report, so every chart in the console carries this summary as its
// accessible label (and the same wording under the chart when it helps).

export type SeriesPoint = { bucketStart: string; value: number };

export type DescribeSeriesOptions = {
  /** What the series counts, e.g. "New users" or "Gross ticket sales". */
  label: string;
  /** How to render one value — money, a count, a duration. */
  format?: (value: number) => string;
  /** How to render a bucket's date, e.g. "12 Sep". */
  formatBucket?: (iso: string) => string;
  /** Total over the previous equivalent window, when there is one. */
  previousTotal?: number | null;
  /** The window in words, e.g. "Last 30 days". */
  rangeLabel?: string;
};

const defaultFormat = (v: number) => v.toLocaleString("en-GH");
const defaultBucket = (iso: string) => iso.slice(0, 10);

export function describeSeries(
  points: SeriesPoint[],
  options: DescribeSeriesOptions,
): string {
  const fmt = options.format ?? defaultFormat;
  const fmtBucket = options.formatBucket ?? defaultBucket;
  const range = options.rangeLabel
    ? `, ${options.rangeLabel.toLowerCase()}`
    : "";

  if (points.length === 0) {
    return `${options.label}${range}: no data.`;
  }

  const total = points.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) {
    return `${options.label}${range}: nothing recorded on any of the ${points.length} days shown.`;
  }

  const peak = points.reduce((best, p) => (p.value > best.value ? p : best));
  const parts = [
    `${options.label}${range}: ${fmt(total)} in total across ${points.length} points`,
    `highest ${fmt(peak.value)} on ${fmtBucket(peak.bucketStart)}`,
  ];

  const previous = options.previousTotal;
  if (previous !== null && previous !== undefined) {
    parts.push(`previous period ${fmt(previous)}`);
  }
  return `${parts.join(", ")}.`;
}
