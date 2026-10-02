#!/usr/bin/env bash
# Walks the native app screen by screen on a connected Android device or
# emulator and saves what each screen says, so wording can be checked in any
# language without tapping through sixty screens by hand.
#
# It opens each route by deep link (abonten://<route>), waits, reads the
# texts and accessibility labels on screen (uiautomator), and flags:
#
#   KEYS     a line that is a catalog key path ("account.ofStepsDone"):
#            a message that is missing or failed to format;
#   REDBOX   the developer error screen: the screen crashed.
#
# Neither shows up in a type check, a lint run or a unit test. On
# 2026-10-02 this found a crash on every cold start, every plural printing
# its key (the app's engine has no Intl.PluralRules), a screen that crashed
# in every language but English, and menu rows that read
# "navigation.termsConditions".
#
# Before running: the app is open on the device, signed in, and showing the
# language to check (Settings › Language). Then:
#
#   EVENT_ID=<uuid> PLACE_ID=<uuid> USERNAME=<handle> \
#     bash scripts/qa/mobile-walk.sh out/french [seconds-per-screen]
#
# EVENT_ID / PLACE_ID / USERNAME name an event, a place and a profile the
# signed-in account can open (its own, for the organizer screens). Screens
# that need them are skipped when they are not given. Afterwards read the
# saved .txt files for anything left in the wrong language:
#
#   grep -nE "\b(the|and|your|with|not)\b" out/french/*.txt
#
# Needs adb on the PATH (or ADB=/path/to/adb) and python. In Git Bash on
# Windows device paths are kept as they are (MSYS_NO_PATHCONV).

set -u
OUT="${1:?usage: mobile-walk.sh <output-dir> [seconds-per-screen]}"
WAIT="${2:-5}"
ADB="${ADB:-adb}"
SCHEME="${APP_SCHEME:-abonten}"
PACKAGE="${APP_PACKAGE:-com.abonten.app}"
export MSYS_NO_PATHCONV=1
mkdir -p "$OUT"

texts() {
  "$ADB" shell rm -f /sdcard/ui.xml > /dev/null 2>&1
  for _ in 1 2 3; do
    "$ADB" shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
    if "$ADB" shell ls /sdcard/ui.xml > /dev/null 2>&1; then break; fi
    sleep 1
  done
  "$ADB" exec-out cat /sdcard/ui.xml 2> /dev/null | python -c '
import html, re, sys
data = sys.stdin.buffer.read().decode("utf-8", "replace")
seen = []
for node in re.finditer(r"<node[^>]*?>", data):
    for attribute in ("text", "content-desc"):
        found = re.search(attribute + "=\"([^\"]*)\"", node.group(0))
        if found and found.group(1).strip():
            value = html.unescape(found.group(1)).strip()
            if value not in seen:
                seen.append(value)
sys.stdout.buffer.write(("\n".join(seen) + "\n").encode("utf-8"))
'
}

ROUTES=(
  "" "search" "messages" "account" "notifications" "tickets" "bookings"
  "wallet" "transactions" "places" "for-you" "weekly" "rewards"
  "rewards/invite" "settings" "settings/overview" "settings/edit-profile"
  "settings/account-setup" "settings/security" "settings/blocked"
  "settings/notifications" "settings/switch-appearance" "settings/region"
  "settings/language" "organizer" "organizer/events" "organizer/finance"
  "organizer/payouts" "organizer/payout-accounts" "organizer/withdraw"
  "organizer/places" "organizer/verification" "organizer/event-drafts"
  "organizer/place-drafts" "event/new" "place/new" "spotlight"
  "spotlight/manage" "messages/archived"
)
if [ -n "${EVENT_ID:-}" ]; then
  ROUTES+=(
    "event/$EVENT_ID" "buy/$EVENT_ID" "reviews/event/$EVENT_ID"
    "organizer/events/$EVENT_ID" "organizer/events/$EVENT_ID/attendees"
    "organizer/events/$EVENT_ID/promo-codes"
    "organizer/events/$EVENT_ID/promote" "organizer/events/$EVENT_ID/reviews"
    "organizer/events/$EVENT_ID/edit"
  )
fi
if [ -n "${PLACE_ID:-}" ]; then
  ROUTES+=(
    "place/$PLACE_ID" "reviews/place/$PLACE_ID" "organizer/places/$PLACE_ID"
    "organizer/places/$PLACE_ID/bookings" "organizer/places/$PLACE_ID/edit"
    "organizer/places/$PLACE_ID/photos" "organizer/places/$PLACE_ID/promote"
    "organizer/places/$PLACE_ID/reviews"
    "organizer/places/$PLACE_ID/verification"
    "organizer/places/$PLACE_ID/check-in"
  )
fi
if [ -n "${USERNAME:-}" ]; then
  ROUTES+=("user/$USERNAME")
fi

KEY_PATH='^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$'
problems=0
for route in "${ROUTES[@]}"; do
  name="${route//\//__}"
  [ -z "$name" ] && name="home"
  "$ADB" shell am start -a android.intent.action.VIEW \
    -d "$SCHEME://$route" "$PACKAGE" > /dev/null 2>&1
  sleep "$WAIT"
  texts > "$OUT/$name.txt"
  flags=""
  if grep -qE "$KEY_PATH" "$OUT/$name.txt"; then flags="$flags KEYS"; fi
  if grep -qiE "Render Error|Uncaught Error|Log 1 of" "$OUT/$name.txt"; then
    flags="$flags REDBOX"
  fi
  if [ -n "$flags" ]; then
    problems=$((problems + 1))
    echo "$name:$flags"
    grep -E "$KEY_PATH" "$OUT/$name.txt" | sed 's/^/    /'
  fi
done

echo "${#ROUTES[@]} screens walked, $problems with a key path or an error screen. Texts in $OUT/"
[ "$problems" -eq 0 ]
