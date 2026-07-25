-- Allow per-source notification sounds to reference the phone's native tones
-- (system notification sound, alarm sound, and ringtone) chosen in the app.

alter table public.api_keys
  drop constraint if exists api_keys_sound_name_check;

alter table public.api_keys
  add constraint api_keys_sound_name_check check (
    sound_name in (
      'default',
      'silent',
      'native-notification',
      'native-alarm',
      'native-ringtone',
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
