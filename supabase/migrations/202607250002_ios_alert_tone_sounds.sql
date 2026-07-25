-- Allow per-source notification sounds to reference the bundled iPhone alert
-- tones (assets/sounds/ios-*.wav) chosen from the app's iOS-style picker.

alter table public.api_keys
  drop constraint if exists api_keys_sound_name_check;

alter table public.api_keys
  add constraint api_keys_sound_name_check check (
    sound_name in (
      'default',
      'silent',
      'ios-note.wav',
      'ios-aurora.wav',
      'ios-bamboo.wav',
      'ios-chord.wav',
      'ios-circles.wav',
      'ios-complete.wav',
      'ios-hello.wav',
      'ios-input.wav',
      'ios-keys.wav',
      'ios-popcorn.wav',
      'ios-pulse.wav',
      'ios-synth.wav',
      'ios-bell-tower.wav',
      'ios-boing.wav',
      'ios-glass.wav',
      'ios-harp.wav',
      'zona-soft.wav',
      'zona-bright.wav',
      'zona-urgent.wav',
      'zona-chime.wav',
      'zona-crystal.wav',
      'zona-warm.wav',
      'zona-pulse.wav',
      'zona-signal.wav',
      'zona-bloom.wav'
    )
  );
