package expo.modules.systemgestureexclusion

import android.content.Context
import android.graphics.Rect
import android.os.Build
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView

// A plain container whose own bounds are excluded from Android's system
// gestures (API 29+). With gesture navigation, a touch that starts near the
// left or right screen edge is the system Back gesture, not the app's — so a
// horizontal control reaching the edges (the Spotlight video scrubber) could
// never be dragged from there: Back fired instead. This is the platform's
// answer for exactly that case (View.setSystemGestureExclusionRects); the
// system caps exclusions at 200 dp of height per edge, far more than a thin
// strip needs. It changes nothing on older Android or with 3-button nav.
class SystemGestureExclusionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SystemGestureExclusion")
    View(SystemGestureExclusionView::class) {}
  }
}

class SystemGestureExclusionView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  private val bounds = Rect()

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    bounds.set(0, 0, width, height)
    systemGestureExclusionRects = listOf(bounds)
  }
}
