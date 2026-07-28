export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type NotificationSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Bundled / special notification sound identifiers stored on api_keys.sound_name. */
export type NotificationSound =
  | 'default'
  | 'silent'
  | 'ios-alarm.wav'
  | 'ios-apex.wav'
  | 'ios-ascending.wav'
  | 'ios-aurora.wav'
  | 'ios-bamboo.wav'
  | 'ios-bark.wav'
  | 'ios-beacon.wav'
  | 'ios-bell-tower.wav'
  | 'ios-blues.wav'
  | 'ios-boing.wav'
  | 'ios-bulletin.wav'
  | 'ios-by-the-seaside.wav'
  | 'ios-chimes.wav'
  | 'ios-chord.wav'
  | 'ios-circles.wav'
  | 'ios-circuit.wav'
  | 'ios-complete.wav'
  | 'ios-constellation.wav'
  | 'ios-cosmic.wav'
  | 'ios-crickets.wav'
  | 'ios-crystals.wav'
  | 'ios-digital.wav'
  | 'ios-doorbell.wav'
  | 'ios-duck.wav'
  | 'ios-glass.wav'
  | 'ios-harp.wav'
  | 'ios-hello.wav'
  | 'ios-hillside.wav'
  | 'ios-illuminate.wav'
  | 'ios-input.wav'
  | 'ios-keys.wav'
  | 'ios-marimba.wav'
  | 'ios-motorcycle.wav'
  | 'ios-night-owl.wav'
  | 'ios-note.wav'
  | 'ios-old-car-horn.wav'
  | 'ios-old-phone.wav'
  | 'ios-opening.wav'
  | 'ios-piano-riff.wav'
  | 'ios-pinball.wav'
  | 'ios-playtime.wav'
  | 'ios-popcorn.wav'
  | 'ios-presto.wav'
  | 'ios-pulse.wav'
  | 'ios-radar.wav'
  | 'ios-radiate.wav'
  | 'ios-reflection.wav'
  | 'ios-ripples.wav'
  | 'ios-robot.wav'
  | 'ios-sci-fi.wav'
  | 'ios-sencha.wav'
  | 'ios-signal.wav'
  | 'ios-silk.wav'
  | 'ios-slow-rise.wav'
  | 'ios-sonar.wav'
  | 'ios-stargaze.wav'
  | 'ios-strum.wav'
  | 'ios-summit.wav'
  | 'ios-synth.wav'
  | 'ios-timba.wav'
  | 'ios-time-passing.wav'
  | 'ios-trill.wav'
  | 'ios-twinkle.wav'
  | 'ios-uplift.wav'
  | 'ios-waves.wav'
  | 'ios-xylophone.wav';

export type Database = {
  public: {
    Tables: {
      app_changelog: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          items: Json;
          released_at: string;
          summary_en: string;
          summary_zh_hant: string;
          title_en: string;
          title_zh_hant: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          items: Json;
          released_at: string;
          summary_en: string;
          summary_zh_hant: string;
          title_en: string;
          title_zh_hant: string;
          updated_at?: string;
          version: string;
        };
        Update: {
          is_active?: boolean;
          items?: Json;
          released_at?: string;
          summary_en?: string;
          summary_zh_hant?: string;
          title_en?: string;
          title_zh_hant?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      app_options: {
        Row: {
          created_at: string;
          is_premium: boolean;
          live_activity_enabled: boolean;
          play_sound: boolean;
          premium_customer_id: string | null;
          premium_expires_at: string | null;
          premium_plan: string | null;
          premium_product_id: string | null;
          premium_status: string | null;
          premium_store: string | null;
          push_enabled: boolean;
          show_preview: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          live_activity_enabled?: boolean;
          play_sound?: boolean;
          push_enabled?: boolean;
          show_preview?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          live_activity_enabled?: boolean;
          play_sound?: boolean;
          push_enabled?: boolean;
          show_preview?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          key_prefix: string | null;
          last_used_at: string | null;
          name: string;
          revoked_at: string | null;
          sound_name: NotificationSound;
          source_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          key_prefix?: string | null;
          last_used_at?: string | null;
          name: string;
          revoked_at?: string | null;
          sound_name?: NotificationSound;
          source_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          expires_at?: string | null;
          is_active?: boolean;
          key_prefix?: string | null;
          last_used_at?: string | null;
          name?: string;
          revoked_at?: string | null;
          sound_name?: NotificationSound;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          attachment_bytes: number | null;
          attachment_mime: string | null;
          attachment_path: string | null;
          body: string;
          category: string | null;
          created_at: string;
          data: Json;
          expires_at: string;
          id: string;
          read_at: string | null;
          severity: NotificationSeverity | null;
          source_id: string;
          source_name_snapshot: string;
          title: string;
          user_id: string;
        };
        Insert: {
          attachment_bytes?: number | null;
          attachment_mime?: string | null;
          attachment_path?: string | null;
          body: string;
          category?: string | null;
          created_at?: string;
          data?: Json;
          expires_at?: string;
          id?: string;
          read_at?: string | null;
          severity?: NotificationSeverity | null;
          source_id: string;
          source_name_snapshot: string;
          title: string;
          user_id: string;
        };
        Update: {
          attachment_bytes?: number | null;
          attachment_mime?: string | null;
          attachment_path?: string | null;
          body?: string;
          category?: string | null;
          created_at?: string;
          data?: Json;
          expires_at?: string;
          id?: string;
          read_at?: string | null;
          severity?: NotificationSeverity | null;
          source_id?: string;
          source_name_snapshot?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      push_devices: {
        Row: {
          created_at: string;
          disabled_at: string | null;
          device_id: string;
          expo_push_token: string;
          id: string;
          platform: 'android' | 'ios';
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          disabled_at?: string | null;
          device_id: string;
          expo_push_token: string;
          id?: string;
          platform?: 'android' | 'ios';
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          disabled_at?: string | null;
          device_id?: string;
          expo_push_token?: string;
          id?: string;
          platform?: 'android' | 'ios';
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          created_at: string;
          display_name: string;
          hostname: string | null;
          id: string;
          last_seen_at: string | null;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          hostname?: string | null;
          id?: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          hostname?: string | null;
          id?: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      universal_app_options: {
        Row: {
          created_at: string;
          expires_at: string | null;
          is_active: boolean;
          option_name: string;
          starts_at: string | null;
          updated_at: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          is_active?: boolean;
          option_name: string;
          starts_at?: string | null;
          updated_at?: string;
          value: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          is_active?: boolean;
          option_name?: string;
          starts_at?: string | null;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      source_api_keys: {
        Row: {
          api_key_id: string;
          api_key_name: string;
          created_at: string;
          display_name: string;
          hostname: string | null;
          id: string;
          is_active: boolean;
          key_created_at: string;
          key_expires_at: string | null;
          key_last_used_at: string | null;
          key_prefix: string | null;
          key_revoked_at: string | null;
          key_updated_at: string;
          last_seen_at: string | null;
          revoked_at: string | null;
          sound_name: NotificationSound;
          user_id: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_source: {
        Args: {
          p_display_name: string;
          p_hostname: string | null;
          p_key_prefix: string;
          p_token_hash: string;
        };
        Returns: string;
      };
      manage_source: {
        Args: {
          p_action: string;
          p_display_name: string | null;
          p_is_active: boolean | null;
          p_source_id: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
