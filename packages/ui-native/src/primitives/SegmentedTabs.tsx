import { useState } from "react";
import { ScrollView, View } from "react-native";
import { shadow } from "../theme/tokens";
import { PressableScale } from "./PressableScale";
import { AppText } from "./Typography";

// Native echo of the web shadcn <Tabs>/<TabsList>/<TabsTrigger> segmented
// control (apps/web/src/components/ui/tabs.tsx): a rounded `bg-muted`
// track with equal-width triggers; the active trigger lifts onto a
// `bg-accent` surface with a card shadow, inactive labels stay
// `text-muted-foreground`. Used for the Explore Events/Places switch, the
// profile tab bar, the Tickets tab strip, and the Favorites sub-tabs so
// every tab control in the app reads the same as the web one.
//
// A label is never cut. While every label fits an equal share of the track
// the triggers are equal columns, as they always were. When one does not
// ("Organisateurs", "Veranstaltungen": English fits four columns, French
// and German do not) each trigger takes the width of its own label and
// they share what is left; if even that is wider than the screen the track
// scrolls sideways. The labels are measured in a hidden row, so the choice
// does not depend on how they happen to be laid out.
//
// Switching a tab fires a selection haptic: it changes what the whole screen
// below is showing, which is exactly the class of change a tap should be
// felt for.

export type SegmentedTabOption<T extends string> = {
  key: T;
  label: string;
};

export type SegmentedTabsProps<T extends string> = {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (key: T) => void;
  /** Extra classes on the track (e.g. margins). */
  className?: string;
};

/** The track's inner padding on each side (`p-1`). */
const TRACK_PADDING = 4;
/** A trigger's horizontal padding in equal columns (`px-3`). */
const COLUMN_PADDING = 12;

const LABEL_CLASS = "text-[14px] font-semibold";
const MEASURE_ROW = { width: 4000 } as const;

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedTabsProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});

  const share =
    trackWidth > 0 && options.length > 0
      ? (trackWidth - TRACK_PADDING * 2) / options.length
      : 0;
  const measured =
    share > 0 && options.every((o) => labelWidths[o.label] !== undefined);
  // Equal columns until it is known that a label does not fit one.
  const equalColumns =
    !measured ||
    options.every(
      (o) => (labelWidths[o.label] ?? 0) + COLUMN_PADDING * 2 <= share,
    );

  return (
    <View className={className}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEnabled={!equalColumns}
        accessibilityRole="tablist"
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        className="h-11 grow-0 rounded-lg bg-muted"
        contentContainerClassName="grow flex-row items-center p-1"
      >
        {options.map((option) => {
          const active = option.key === value;
          return (
            <PressableScale
              key={option.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.key)}
              haptic={!active}
              activeScale={0.96}
              className={`h-full ${
                equalColumns ? "flex-1 px-3" : "grow px-2"
              } items-center justify-center rounded-md ${
                active ? "bg-accent" : ""
              } active:opacity-80`}
              style={active ? shadow.card : undefined}
            >
              <AppText
                numberOfLines={1}
                className={`${LABEL_CLASS} ${
                  active ? "text-accent-foreground" : "text-muted-foreground"
                }`}
              >
                {option.label}
              </AppText>
            </PressableScale>
          );
        })}
      </ScrollView>
      {/*
        The labels at their natural width, never shown and never read out:
        a row far wider than any screen, so no label is squeezed while it is
        measured, inside a box of no size that clips it.
      */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute left-0 top-0 h-0 w-0 overflow-hidden opacity-0"
      >
        <View className="flex-row" style={MEASURE_ROW}>
          {options.map((option) => (
            <AppText
              key={option.key}
              numberOfLines={1}
              className={LABEL_CLASS}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                setLabelWidths((known) =>
                  known[option.label] === width
                    ? known
                    : { ...known, [option.label]: width },
                );
              }}
            >
              {option.label}
            </AppText>
          ))}
        </View>
      </View>
    </View>
  );
}
