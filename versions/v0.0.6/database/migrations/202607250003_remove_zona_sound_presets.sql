-- Remove the retired Zona custom sound presets: rewrite any stored preset
-- selections to the default sound first, then tighten the allowed set to the
-- special choices and the bundled iPhone ringtone collection.

update public.api_keys
  set sound_name = 'default'
  where sound_name like 'zona-%.wav';

alter table public.api_keys
  drop constraint if exists api_keys_sound_name_check;

alter table public.api_keys
  add constraint api_keys_sound_name_check check (
    sound_name in (
      'default',
      'silent',
      'ios-alarm.wav',
      'ios-apex.wav',
      'ios-ascending.wav',
      'ios-aurora.wav',
      'ios-bamboo.wav',
      'ios-bark.wav',
      'ios-beacon.wav',
      'ios-bell-tower.wav',
      'ios-blues.wav',
      'ios-boing.wav',
      'ios-bulletin.wav',
      'ios-by-the-seaside.wav',
      'ios-chimes.wav',
      'ios-chord.wav',
      'ios-circles.wav',
      'ios-circuit.wav',
      'ios-complete.wav',
      'ios-constellation.wav',
      'ios-cosmic.wav',
      'ios-crickets.wav',
      'ios-crystals.wav',
      'ios-digital.wav',
      'ios-doorbell.wav',
      'ios-duck.wav',
      'ios-glass.wav',
      'ios-harp.wav',
      'ios-hello.wav',
      'ios-hillside.wav',
      'ios-illuminate.wav',
      'ios-input.wav',
      'ios-keys.wav',
      'ios-marimba.wav',
      'ios-motorcycle.wav',
      'ios-night-owl.wav',
      'ios-note.wav',
      'ios-old-car-horn.wav',
      'ios-old-phone.wav',
      'ios-opening.wav',
      'ios-piano-riff.wav',
      'ios-pinball.wav',
      'ios-playtime.wav',
      'ios-popcorn.wav',
      'ios-presto.wav',
      'ios-pulse.wav',
      'ios-radar.wav',
      'ios-radiate.wav',
      'ios-reflection.wav',
      'ios-ripples.wav',
      'ios-robot.wav',
      'ios-sci-fi.wav',
      'ios-sencha.wav',
      'ios-signal.wav',
      'ios-silk.wav',
      'ios-slow-rise.wav',
      'ios-sonar.wav',
      'ios-stargaze.wav',
      'ios-strum.wav',
      'ios-summit.wav',
      'ios-synth.wav',
      'ios-timba.wav',
      'ios-time-passing.wav',
      'ios-trill.wav',
      'ios-twinkle.wav',
      'ios-uplift.wav',
      'ios-waves.wav',
      'ios-xylophone.wav'
    )
  );
