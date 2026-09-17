import AVFoundation
import ExpoModulesCore

// Reports changes to the system output volume (KVO on the shared audio
// session). Observation only: the hardware buttons keep their normal iOS
// behaviour and no audio session is activated here, so other apps' audio
// is never interrupted. The value updates while our audio session is
// active, i.e. while a video is playing.
public class VolumeObserverModule: Module {
  private var observation: NSKeyValueObservation?

  public func definition() -> ModuleDefinition {
    Name("VolumeObserver")
    Events("onVolumeChange")

    Function("getVolume") { () -> Double in
      Double(AVAudioSession.sharedInstance().outputVolume)
    }

    OnStartObserving {
      guard self.observation == nil else { return }
      self.observation = AVAudioSession.sharedInstance().observe(
        \.outputVolume,
        options: [.old, .new]
      ) { [weak self] _, change in
        guard let new = change.newValue, let old = change.oldValue, new != old else { return }
        self?.sendEvent("onVolumeChange", [
          "volume": Double(new),
          "direction": new > old ? "up" : "down",
        ])
      }
    }

    OnStopObserving {
      self.observation?.invalidate()
      self.observation = nil
    }
  }
}
