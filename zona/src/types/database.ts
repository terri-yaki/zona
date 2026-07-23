export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
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
          device_id: string;
          expo_push_token: string;
          id: string;
          platform: 'ios';
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          expo_push_token: string;
          id?: string;
          platform?: 'ios';
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
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
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
