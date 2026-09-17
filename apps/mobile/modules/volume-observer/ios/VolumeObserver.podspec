Pod::Spec.new do |s|
  s.name           = 'VolumeObserver'
  s.version        = '1.0.0'
  s.summary        = 'Observes the system media volume.'
  s.description    = 'Observes the system media volume so muted video can unmute on a volume-up press.'
  s.license        = 'UNLICENSED'
  s.author         = 'Abonten Hub Ltd'
  s.homepage       = 'https://abontenhub.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
