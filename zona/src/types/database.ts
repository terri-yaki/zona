export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Bundled / special notification sound identifiers stored on api_keys.sound_name. */
export type NotificationSound =
  | 'default'
  | 'silent'
  | 'zona-soft.wav'
  | 'zona-bright.wav'
  | 'zona-urgent.wav'
  | 'zona-chime.wav'
  | 'zona-crystal.wav'
  | 'zona-warm.wav'
  | 'zona-pulse.wav'
  | 'zona-signal.wav'
  | 'zona-bloom.wav';

export type Database = {
  public: {
    Tables: {
      app_options: {
        Row: {
          created_at: string;
          live_activity_enabled: boolean;
          play_sound: boolean;
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
          platform: 'ios';
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          disabled_at?: string | null;
          device_id: string;
          expo_push_token: string;
          id?: string;
          platform?: 'ios';
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          disabled_at?: string | null;
          device_id?: string;
          expo_push_token?: string;
          id?: string;
          platform?: 'ios';
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
