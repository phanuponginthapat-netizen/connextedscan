export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_logs: {
        Row: {
          confidence: number | null
          device_name: string | null
          direction: string
          geometry_score: number | null
          id: string
          scanned_at: string
          snapshot_path: string | null
          status: string
          student_id: string | null
        }
        Insert: {
          confidence?: number | null
          device_name?: string | null
          direction: string
          geometry_score?: number | null
          id?: string
          scanned_at?: string
          snapshot_path?: string | null
          status?: string
          student_id?: string | null
        }
        Update: {
          confidence?: number | null
          device_name?: string | null
          direction?: string
          geometry_score?: number | null
          id?: string
          scanned_at?: string
          snapshot_path?: string | null
          status?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      device_commands: {
        Row: {
          command: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          device_id: string | null
          id: string
          result: string | null
        }
        Insert: {
          command: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          id?: string
          result?: string | null
        }
        Update: {
          command?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          id?: string
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          agent_version: string | null
          api_key: string
          created_at: string
          default_direction: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          location: string | null
          name: string
          platform: string | null
        }
        Insert: {
          agent_version?: string | null
          api_key: string
          created_at?: string
          default_direction?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          location?: string | null
          name: string
          platform?: string | null
        }
        Update: {
          agent_version?: string | null
          api_key?: string
          created_at?: string
          default_direction?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          location?: string | null
          name?: string
          platform?: string | null
        }
        Relationships: []
      }
      door_commands: {
        Row: {
          command: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          seconds: number
        }
        Insert: {
          command: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          seconds?: number
        }
        Update: {
          command?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          seconds?: number
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          event: string
          id: string
          message: string
          status: string
          subject: string | null
          target: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          event: string
          id?: string
          message: string
          status?: string
          subject?: string | null
          target?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          message?: string
          status?: string
          subject?: string | null
          target?: string | null
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          created_at: string
          email: string | null
          events: string
          id: string
          is_active: boolean
          line_user_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          events?: string
          id?: string
          is_active?: boolean
          line_user_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          email?: string | null
          events?: string
          id?: string
          is_active?: boolean
          line_user_id?: string | null
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          acknowledged_at: string | null
          attempts: number
          created_at: string
          device_name: string | null
          id: string
          kind: string
          message: string
          snapshot_path: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          attempts?: number
          created_at?: string
          device_name?: string | null
          id?: string
          kind?: string
          message: string
          snapshot_path?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          attempts?: number
          created_at?: string
          device_name?: string | null
          id?: string
          kind?: string
          message?: string
          snapshot_path?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          absent_check_time: string
          allow_signup: boolean
          allow_web_scan: boolean
          auto_enroll: boolean
          auto_enroll_max_faces: number
          auto_enroll_min_confidence: number
          auto_power_off_action: string
          auto_power_off_enabled: boolean
          auto_power_off_time: string
          auto_update_enabled: boolean
          backup_enabled: boolean
          backup_last_at: string | null
          backup_weekday: number
          block_non_work_days: boolean
          checkin_end: string
          checkin_start: string
          checkout_end: string
          checkout_start: string
          cleanup_enabled: boolean
          cleanup_last_at: string | null
          default_report_days: number
          detector_min_score: number
          device_offline_minutes: number
          door_angle_down: number
          door_angle_up: number
          door_buzzer_enabled: boolean
          door_deny_alarm: boolean
          door_enabled: boolean
          door_free_enabled: boolean
          door_free_end: string
          door_free_start: string
          door_hold_power: boolean
          door_invert_servo: boolean
          door_move_delay_ms: number
          door_move_step: number
          door_open_seconds: number
          door_use_relay: boolean
          duplicate_cooldown_minutes: number
          early_leave_before: string
          failed_alert_threshold: number
          geometry_min_score: number
          geometry_weight: number
          id: boolean
          kiosk_mirror: boolean
          kiosk_news_enabled: boolean
          kiosk_news_text: string
          kiosk_recent_limit: number
          kiosk_show_clock: boolean
          kiosk_show_confidence: boolean
          kiosk_show_recent: boolean
          late_after: string
          late_grace_minutes: number
          log_retention_days: number
          log_unknown_attempts: boolean
          match_threshold: number
          min_face_coverage: number
          next_person_delay_seconds: number
          notify_absent: boolean
          notify_device_offline: boolean
          notify_early_leave: boolean
          notify_email_enabled: boolean
          notify_failed_streak: boolean
          notify_last_at: string | null
          notify_late: boolean
          notify_line_enabled: boolean
          power_off_workdays_only: boolean
          power_saving_enabled: boolean
          require_liveness: boolean
          save_snapshots: boolean
          school_name: string
          screen_idle_minutes: number
          screen_off_end: string
          screen_off_start: string
          second_camera_direction: string
          second_camera_index: number
          snapshot_retention_days: number
          updated_at: string
          visitor_mode: boolean
          voice_denied_text: string
          voice_duplicate_template: string
          voice_enabled: boolean
          voice_late_suffix: string
          voice_out_of_window_text: string
          voice_rate: number
          voice_template: string
          voice_volume: number
          web_match_threshold: number
          work_days: string
        }
        Insert: {
          absent_check_time?: string
          allow_signup?: boolean
          allow_web_scan?: boolean
          auto_enroll?: boolean
          auto_enroll_max_faces?: number
          auto_enroll_min_confidence?: number
          auto_power_off_action?: string
          auto_power_off_enabled?: boolean
          auto_power_off_time?: string
          auto_update_enabled?: boolean
          backup_enabled?: boolean
          backup_last_at?: string | null
          backup_weekday?: number
          block_non_work_days?: boolean
          checkin_end?: string
          checkin_start?: string
          checkout_end?: string
          checkout_start?: string
          cleanup_enabled?: boolean
          cleanup_last_at?: string | null
          default_report_days?: number
          detector_min_score?: number
          device_offline_minutes?: number
          door_angle_down?: number
          door_angle_up?: number
          door_buzzer_enabled?: boolean
          door_deny_alarm?: boolean
          door_enabled?: boolean
          door_free_enabled?: boolean
          door_free_end?: string
          door_free_start?: string
          door_hold_power?: boolean
          door_invert_servo?: boolean
          door_move_delay_ms?: number
          door_move_step?: number
          door_open_seconds?: number
          door_use_relay?: boolean
          duplicate_cooldown_minutes?: number
          early_leave_before?: string
          failed_alert_threshold?: number
          geometry_min_score?: number
          geometry_weight?: number
          id?: boolean
          kiosk_mirror?: boolean
          kiosk_news_enabled?: boolean
          kiosk_news_text?: string
          kiosk_recent_limit?: number
          kiosk_show_clock?: boolean
          kiosk_show_confidence?: boolean
          kiosk_show_recent?: boolean
          late_after?: string
          late_grace_minutes?: number
          log_retention_days?: number
          log_unknown_attempts?: boolean
          match_threshold?: number
          min_face_coverage?: number
          next_person_delay_seconds?: number
          notify_absent?: boolean
          notify_device_offline?: boolean
          notify_early_leave?: boolean
          notify_email_enabled?: boolean
          notify_failed_streak?: boolean
          notify_last_at?: string | null
          notify_late?: boolean
          notify_line_enabled?: boolean
          power_off_workdays_only?: boolean
          power_saving_enabled?: boolean
          require_liveness?: boolean
          save_snapshots?: boolean
          school_name?: string
          screen_idle_minutes?: number
          screen_off_end?: string
          screen_off_start?: string
          second_camera_direction?: string
          second_camera_index?: number
          snapshot_retention_days?: number
          updated_at?: string
          visitor_mode?: boolean
          voice_denied_text?: string
          voice_duplicate_template?: string
          voice_enabled?: boolean
          voice_late_suffix?: string
          voice_out_of_window_text?: string
          voice_rate?: number
          voice_template?: string
          voice_volume?: number
          web_match_threshold?: number
          work_days?: string
        }
        Update: {
          absent_check_time?: string
          allow_signup?: boolean
          allow_web_scan?: boolean
          auto_enroll?: boolean
          auto_enroll_max_faces?: number
          auto_enroll_min_confidence?: number
          auto_power_off_action?: string
          auto_power_off_enabled?: boolean
          auto_power_off_time?: string
          auto_update_enabled?: boolean
          backup_enabled?: boolean
          backup_last_at?: string | null
          backup_weekday?: number
          block_non_work_days?: boolean
          checkin_end?: string
          checkin_start?: string
          checkout_end?: string
          checkout_start?: string
          cleanup_enabled?: boolean
          cleanup_last_at?: string | null
          default_report_days?: number
          detector_min_score?: number
          device_offline_minutes?: number
          door_angle_down?: number
          door_angle_up?: number
          door_buzzer_enabled?: boolean
          door_deny_alarm?: boolean
          door_enabled?: boolean
          door_free_enabled?: boolean
          door_free_end?: string
          door_free_start?: string
          door_hold_power?: boolean
          door_invert_servo?: boolean
          door_move_delay_ms?: number
          door_move_step?: number
          door_open_seconds?: number
          door_use_relay?: boolean
          duplicate_cooldown_minutes?: number
          early_leave_before?: string
          failed_alert_threshold?: number
          geometry_min_score?: number
          geometry_weight?: number
          id?: boolean
          kiosk_mirror?: boolean
          kiosk_news_enabled?: boolean
          kiosk_news_text?: string
          kiosk_recent_limit?: number
          kiosk_show_clock?: boolean
          kiosk_show_confidence?: boolean
          kiosk_show_recent?: boolean
          late_after?: string
          late_grace_minutes?: number
          log_retention_days?: number
          log_unknown_attempts?: boolean
          match_threshold?: number
          min_face_coverage?: number
          next_person_delay_seconds?: number
          notify_absent?: boolean
          notify_device_offline?: boolean
          notify_early_leave?: boolean
          notify_email_enabled?: boolean
          notify_failed_streak?: boolean
          notify_last_at?: string | null
          notify_late?: boolean
          notify_line_enabled?: boolean
          power_off_workdays_only?: boolean
          power_saving_enabled?: boolean
          require_liveness?: boolean
          save_snapshots?: boolean
          school_name?: string
          screen_idle_minutes?: number
          screen_off_end?: string
          screen_off_start?: string
          second_camera_direction?: string
          second_camera_index?: number
          snapshot_retention_days?: number
          updated_at?: string
          visitor_mode?: boolean
          voice_denied_text?: string
          voice_duplicate_template?: string
          voice_enabled?: boolean
          voice_late_suffix?: string
          voice_out_of_window_text?: string
          voice_rate?: number
          voice_template?: string
          voice_volume?: number
          web_match_threshold?: number
          work_days?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      student_faces: {
        Row: {
          created_at: string
          embedding: number[] | null
          error_message: string | null
          geometry: Json | null
          id: string
          image_path: string
          processed_at: string | null
          quality: number | null
          source: string
          status: string
          student_id: string
          web_embedding: number[] | null
          web_geometry: Json | null
        }
        Insert: {
          created_at?: string
          embedding?: number[] | null
          error_message?: string | null
          geometry?: Json | null
          id?: string
          image_path: string
          processed_at?: string | null
          quality?: number | null
          source?: string
          status?: string
          student_id: string
          web_embedding?: number[] | null
          web_geometry?: Json | null
        }
        Update: {
          created_at?: string
          embedding?: number[] | null
          error_message?: string | null
          geometry?: Json | null
          id?: string
          image_path?: string
          processed_at?: string | null
          quality?: number | null
          source?: string
          status?: string
          student_id?: string
          web_embedding?: number[] | null
          web_geometry?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "student_faces_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          avatar_path: string | null
          class_room: string | null
          created_at: string
          department: string | null
          full_name: string
          guardian_phone: string | null
          id: string
          is_active: boolean
          nickname: string | null
          person_type: string
          position: string | null
          student_code: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          class_room?: string | null
          created_at?: string
          department?: string | null
          full_name: string
          guardian_phone?: string | null
          id?: string
          is_active?: boolean
          nickname?: string | null
          person_type?: string
          position?: string | null
          student_code: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          class_room?: string | null
          created_at?: string
          department?: string | null
          full_name?: string
          guardian_phone?: string | null
          id?: string
          is_active?: boolean
          nickname?: string | null
          person_type?: string
          position?: string | null
          student_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitor_logs: {
        Row: {
          device_name: string | null
          direction: string
          full_name: string | null
          id: string
          note: string | null
          scanned_at: string
          snapshot_path: string | null
        }
        Insert: {
          device_name?: string | null
          direction?: string
          full_name?: string | null
          id?: string
          note?: string | null
          scanned_at?: string
          snapshot_path?: string | null
        }
        Update: {
          device_name?: string | null
          direction?: string
          full_name?: string | null
          id?: string
          note?: string | null
          scanned_at?: string
          snapshot_path?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_signup_open: { Args: never; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
