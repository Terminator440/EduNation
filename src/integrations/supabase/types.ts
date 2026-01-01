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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          target_role: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          target_role?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          target_role?: string | null
          title?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string | null
          date: string
          id: string
          status: string
          student_id: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          status: string
          student_id: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          status?: string
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          active_role: Database["public"]["Enums"]["app_role"]
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          active_role: Database["public"]["Enums"]["app_role"]
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          active_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string | null
          id: string
          name: string
          section: string
          teacher_id: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          section: string
          teacher_id?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          section?: string
          teacher_id?: string | null
          year?: number
        }
        Relationships: []
      }
      grades: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          grade: number
          id: string
          student_id: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string
          description?: string | null
          grade: number
          id?: string
          student_id: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          description?: string | null
          grade?: number
          id?: string
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student_relations: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          parent_user_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          parent_user_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          parent_user_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_relations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          active_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          updated_at?: string | null
        }
        Update: {
          active_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      student_activations: {
        Row: {
          activation_code: string
          created_at: string | null
          created_by: string
          expires_at: string
          id: string
          is_used: boolean | null
          student_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          activation_code: string
          created_at?: string | null
          created_by: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          student_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          activation_code?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          student_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_activations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          class_id: string
          created_at: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          student_number: number | null
          user_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          student_number?: number | null
          user_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          student_number?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          class_id: string | null
          created_at: string | null
          id: string
          name: string
          teacher_id: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          teacher_id?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      generate_activation_code: { Args: never; Returns: string }
      get_teacher_class_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          _action: string
          _active_role: Database["public"]["Enums"]["app_role"]
          _details?: Json
          _entity_id?: string
          _entity_type?: string
          _user_id: string
          _user_name: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "student"
        | "parent"
        | "teacher"
        | "homeroom_teacher"
        | "secretariat"
        | "director"
        | "uat_admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "student",
        "parent",
        "teacher",
        "homeroom_teacher",
        "secretariat",
        "director",
        "uat_admin",
      ],
    },
  },
} as const
