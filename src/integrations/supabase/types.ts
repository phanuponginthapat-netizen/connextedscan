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
      devices: {
        Row: {
          api_key: string
          created_at: string
          default_direction: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          location: string | null
          name: string
        }
        Insert: {
          api_key: string
          created_at?: string
          default_direction?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          location?: string | null
          name: string
        }
        Update: {
          api_key?: string
          created_at?: string
          default_direction?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          location?: string | null
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
      settings: {
        Row: {
          auto_enroll: boolean
          auto_enroll_max_faces: number
          auto_enroll_min_confidence: number
          checkin_end: string
          checkin_start: string
          checkout_end: string
          checkout_start: string
          duplicate_cooldown_minutes: number
          geometry_min_score: number
          geometry_weight: number
          id: boolean
          late_after: string
          match_threshold: number
          next_person_delay_seconds: number
          require_liveness: boolean
          save_snapshots: boolean
          school_name: string
          updated_at: string
          voice_template: string
        }
        Insert: {
          auto_enroll?: boolean
          auto_enroll_max_faces?: number
          auto_enroll_min_confidence?: number
          checkin_end?: string
          checkin_start?: string
          checkout_end?: string
          checkout_start?: string
          duplicate_cooldown_minutes?: number
          geometry_min_score?: number
          geometry_weight?: number
          id?: boolean
          late_after?: string
          match_threshold?: number
          next_person_delay_seconds?: number
          require_liveness?: boolean
          save_snapshots?: boolean
          school_name?: string
          updated_at?: string
          voice_template?: string
        }
        Update: {
          auto_enroll?: boolean
          auto_enroll_max_faces?: number
          auto_enroll_min_confidence?: number
          checkin_end?: string
          checkin_start?: string
          checkout_end?: string
          checkout_start?: string
          duplicate_cooldown_minutes?: number
          geometry_min_score?: number
          geometry_weight?: number
          id?: boolean
          late_after?: string
          match_threshold?: number
          next_person_delay_seconds?: number
          require_liveness?: boolean
          save_snapshots?: boolean
          school_name?: string
          updated_at?: string
          voice_template?: string
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
