/* eslint-disable @next/next/no-img-element -- next/og (Satori) draws plain <img>; next/image cannot run inside it. */
import { SHARE_IMAGE_SIZES } from "@abonten/core/shareKit/shareKit";
import { SHARE_FONT } from "./shareAssets";

// The share images, drawn by next/og (Satori): flexbox only, and every
// element with more than one child says `display: flex`. Stories keep their
// words between y≈190 and y≈1720, clear of Instagram's and WhatsApp's own
// header and reply bar.

const NIGHT = "#0F120F";
const CARD = "#1A201C";
const WHITE = "#FFFFFF";
const MINT = "#4FD9C4";
const MUTED = "#A9B5B0";

/** Cut a line to `max` characters on a word boundary, with an ellipsis. */
export function clampText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export type ListingCard = {
  title: string;
  /** Mint line under the title: the date and time, or a place's category. */
  highlight: string | null;
  /** Grey line: the venue or the area. */
  detail: string | null;
  /** "Tickets from GH₵50", "Free entry", or nothing. */
  price: string | null;
  cta: string;
  /** The address shown under the button, e.g. abontenhub.com/events/abc. */
  displayUrl: string;
  picture: string | null;
  /** Flyers are shown whole (their words matter); photos fill the frame. */
  pictureFit: "contain" | "cover";
  qr: string;
  mark: string;
  wordmark: string;
};

/** Long titles get a smaller size so they never run into the button. */
function titleSize(title: string, large: number, small: number): number {
  return title.length > 34 ? small : large;
}

function Brand({
  mark,
  wordmark,
  size,
}: { mark: string; wordmark: string; size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(size * 0.3),
      }}
    >
      <img src={mark} width={size} height={size} alt="" />
      <img
        src={wordmark}
        width={Math.round(size * 0.6 * (1184 / 210))}
        height={Math.round(size * 0.6)}
        alt=""
      />
    </div>
  );
}

function Picture({
  src,
  width,
  height,
  fallbackTitle,
  fit = "contain",
}: {
  src: string | null;
  width: number;
  height: number;
  fallbackTitle: string;
  fit?: "contain" | "cover";
}) {
  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        borderRadius: 36,
        backgroundColor: CARD,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {src ? (
        <img
          src={src}
          width={width}
          height={height}
          style={{ objectFit: fit }}
          alt=""
        />
      ) : (
        <div
          style={{
            display: "flex",
            padding: 64,
            fontSize: 72,
            fontWeight: 700,
            color: MINT,
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          {clampText(fallbackTitle, 48)}
        </div>
      )}
    </div>
  );
}

function CallToAction({
  card,
  qrSize,
  scale,
}: { card: ListingCard; qrSize: number; scale: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: Math.round(16 * scale),
          maxWidth: "70%",
        }}
      >
        {card.price ? (
          <div
            style={{
              display: "flex",
              fontSize: Math.round(40 * scale),
              fontWeight: 700,
              color: WHITE,
            }}
          >
            {card.price}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            backgroundColor: MINT,
            color: NIGHT,
            fontSize: Math.round(34 * scale),
            fontWeight: 700,
            padding: `${Math.round(18 * scale)}px ${Math.round(30 * scale)}px`,
            borderRadius: 999,
          }}
        >
          {card.cta}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: Math.round(28 * scale),
            color: MUTED,
          }}
        >
          {card.displayUrl}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          backgroundColor: WHITE,
          padding: 12,
          borderRadius: 20,
        }}
      >
        <img src={card.qr} width={qrSize} height={qrSize} alt="" />
      </div>
    </div>
  );
}

const base = {
  display: "flex",
  flexDirection: "column" as const,
  backgroundColor: NIGHT,
  color: WHITE,
  fontFamily: SHARE_FONT,
};

/** 1080×1920: Instagram and TikTok stories, WhatsApp Status. */
export function StoryImage({ card }: { card: ListingCard }) {
  const { width, height } = SHARE_IMAGE_SIZES.story;
  return (
    <div style={{ ...base, width, height, padding: "190px 64px 190px" }}>
      <Brand mark={card.mark} wordmark={card.wordmark} size={56} />
      <div style={{ display: "flex", marginTop: 36 }}>
        <Picture
          src={card.picture}
          width={952}
          height={860}
          fallbackTitle={card.title}
          fit={card.pictureFit}
        />
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 40,
          fontSize: titleSize(card.title, 72, 54),
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        {clampText(card.title, 64)}
      </div>
      {card.highlight ? (
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 40,
            fontWeight: 700,
            color: MINT,
          }}
        >
          {clampText(card.highlight, 48)}
        </div>
      ) : null}
      {card.detail ? (
        <div
          style={{ display: "flex", marginTop: 8, fontSize: 36, color: MUTED }}
        >
          {clampText(card.detail, 52)}
        </div>
      ) : null}
      <div style={{ display: "flex", flexGrow: 1 }} />
      <CallToAction card={card} qrSize={200} scale={1} />
    </div>
  );
}

/** 1080×1350: a feed post (4:5). */
export function PostImage({ card }: { card: ListingCard }) {
  const { width, height } = SHARE_IMAGE_SIZES.post;
  return (
    <div style={{ ...base, width, height, padding: 56 }}>
      <Brand mark={card.mark} wordmark={card.wordmark} size={48} />
      <div style={{ display: "flex", marginTop: 28 }}>
        <Picture
          src={card.picture}
          width={968}
          height={600}
          fallbackTitle={card.title}
          fit={card.pictureFit}
        />
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 32,
          fontSize: titleSize(card.title, 58, 46),
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        {clampText(card.title, 70)}
      </div>
      {card.highlight ? (
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 36,
            fontWeight: 700,
            color: MINT,
          }}
        >
          {clampText(card.highlight, 52)}
        </div>
      ) : null}
      {card.detail ? (
        <div
          style={{ display: "flex", marginTop: 6, fontSize: 32, color: MUTED }}
        >
          {clampText(card.detail, 60)}
        </div>
      ) : null}
      <div style={{ display: "flex", flexGrow: 1 }} />
      <CallToAction card={card} qrSize={170} scale={0.88} />
    </div>
  );
}

export type WelcomeCard = {
  heading: string;
  name: string;
  line: string;
  displayUrl: string;
  picture: string | null;
  /** Round for a person or team, wide for a place. */
  pictureShape: "round" | "wide";
  qr: string;
  mark: string;
  wordmark: string;
};

/** 1080×1350: "Now on Abonten", for a new organizer or place. */
export function WelcomeImage({ card }: { card: WelcomeCard }) {
  const { width, height } = SHARE_IMAGE_SIZES.welcome;
  return (
    <div style={{ ...base, width, height, padding: 72, alignItems: "center" }}>
      <Brand mark={card.mark} wordmark={card.wordmark} size={52} />
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div
        style={{
          display: "flex",
          fontSize: 40,
          fontWeight: 700,
          color: MINT,
          letterSpacing: 2,
        }}
      >
        {card.heading.toUpperCase()}
      </div>
      <div style={{ display: "flex", marginTop: 36 }}>
        {card.pictureShape === "round" ? (
          <div
            style={{
              display: "flex",
              width: 320,
              height: 320,
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: CARD,
              border: `6px solid ${MINT}`,
            }}
          >
            {card.picture ? (
              <img
                src={card.picture}
                width={320}
                height={320}
                style={{ objectFit: "cover" }}
                alt=""
              />
            ) : null}
          </div>
        ) : (
          <Picture
            src={card.picture}
            width={936}
            height={470}
            fallbackTitle={card.name}
            fit="cover"
          />
        )}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 40,
          fontSize: 72,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {clampText(card.name, 40)}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 18,
          fontSize: 34,
          color: MUTED,
          textAlign: "center",
          maxWidth: 860,
        }}
      >
        {card.line}
      </div>
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div
          style={{
            display: "flex",
            backgroundColor: WHITE,
            padding: 12,
            borderRadius: 20,
          }}
        >
          <img src={card.qr} width={170} height={170} alt="" />
        </div>
        <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
          {card.displayUrl}
        </div>
      </div>
    </div>
  );
}
