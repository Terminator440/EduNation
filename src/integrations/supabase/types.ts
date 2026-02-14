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
          absence_type: string | null
          created_at: string | null
          date: string
          id: string
          is_final: boolean
          justification_doc: string | null
          motivated_at: string | null
          motivated_by: string | null
          motivation_deadline: string | null
          school_year_id: string | null
          status: string
          student_id: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          absence_type?: string | null
          created_at?: string | null
          date?: string
          id?: string
          is_final?: boolean
          justification_doc?: string | null
          motivated_at?: string | null
          motivated_by?: string | null
          motivation_deadline?: string | null
          school_year_id?: string | null
          status: string
          student_id: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          absence_type?: string | null
          created_at?: string | null
          date?: string
          id?: string
          is_final?: boolean
          justification_doc?: string | null
          motivated_at?: string | null
          motivated_by?: string | null
          motivation_deadline?: string | null
          school_year_id?: string | null
          status?: string
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
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
          new_data: Json | null
          old_data: Json | null
          school_id: string | null
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
          new_data?: Json | null
          old_data?: Json | null
          school_id?: string | null
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
          new_data?: Json | null
          old_data?: Json | null
          school_id?: string | null
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
          school_id: string | null
          section: string
          teacher_id: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          school_id?: string | null
          section: string
          teacher_id?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          school_id?: string | null
          section?: string
          teacher_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_grade_history: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string
          conduct_grade_id: string
          id: string
          new_grade: number
          old_grade: number | null
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by: string
          conduct_grade_id: string
          id?: string
          new_grade: number
          old_grade?: number | null
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string
          conduct_grade_id?: string
          id?: string
          new_grade?: number
          old_grade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conduct_grade_history_conduct_grade_id_fkey"
            columns: ["conduct_grade_id"]
            isOneToOne: false
            referencedRelation: "conduct_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      conduct_grades: {
        Row: {
          created_at: string
          grade: number
          id: string
          modified_by: string
          modified_reason: string | null
          school_year_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade?: number
          id?: string
          modified_by: string
          modified_reason?: string | null
          school_year_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade?: number
          id?: string
          modified_by?: string
          modified_reason?: string | null
          school_year_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conduct_grades_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conduct_grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplinary_actions: {
        Row: {
          action_type: string
          affects_conduct: boolean | null
          conduct_points_deducted: number | null
          council_date: string | null
          council_decision: boolean | null
          created_at: string
          description: string | null
          id: string
          issued_by: string
          issued_date: string
          school_year_id: string
          student_id: string
        }
        Insert: {
          action_type: string
          affects_conduct?: boolean | null
          conduct_points_deducted?: number | null
          council_date?: string | null
          council_decision?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          issued_by: string
          issued_date?: string
          school_year_id: string
          student_id: string
        }
        Update: {
          action_type?: string
          affects_conduct?: boolean | null
          conduct_points_deducted?: number | null
          council_date?: string | null
          council_decision?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          issued_by?: string
          issued_date?: string
          school_year_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplinary_actions_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disciplinary_actions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          grade: number
          id: string
          school_year_id: string | null
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
          school_year_id?: string | null
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
          school_year_id?: string | null
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
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
      invitations: {
        Row: {
          class_id: string | null
          code_hash: string
          created_at: string
          created_by_user_id: string
          current_uses: number
          expires_at: string
          id: string
          intended_for: string | null
          max_uses: number
          revoked_at: string | null
          role: Database["public"]["Enums"]["invitation_role"]
          school_id: string
          student_id: string | null
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          class_id?: string | null
          code_hash: string
          created_at?: string
          created_by_user_id: string
          current_uses?: number
          expires_at?: string
          id?: string
          intended_for?: string | null
          max_uses?: number
          revoked_at?: string | null
          role: Database["public"]["Enums"]["invitation_role"]
          school_id: string
          student_id?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          class_id?: string | null
          code_hash?: string
          created_at?: string
          created_by_user_id?: string
          current_uses?: number
          expires_at?: string
          id?: string
          intended_for?: string | null
          max_uses?: number
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["invitation_role"]
          school_id?: string
          student_id?: string | null
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          school_id: string | null
          updated_at: string | null
        }
        Insert: {
          active_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          school_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          school_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_events: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_time: string | null
          id: string
          subject: string | null
          title: string
          type: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          subject?: string | null
          title: string
          type: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          subject?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      school_years: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          id: string
          is_closed: boolean
          label: string
          start_date: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          is_closed?: boolean
          label: string
          start_date: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          is_closed?: boolean
          label?: string
          start_date?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
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
      teacher_register: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          signed_at: string
          subject_id: string | null
          teacher_id: string
          timetable_entry_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          signed_at?: string
          subject_id?: string | null
          teacher_id: string
          timetable_entry_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          signed_at?: string
          subject_id?: string | null
          teacher_id?: string
          timetable_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_register_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_register_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_register_timetable_entry_id_fkey"
            columns: ["timetable_entry_id"]
            isOneToOne: false
            referencedRelation: "timetable_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_entries: {
        Row: {
          class_id: string | null
          created_at: string
          end_time: string | null
          id: string
          period: number
          room: string | null
          start_time: string | null
          subject_id: string | null
          teacher_id: string | null
          weekday: number
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          period: number
          room?: string | null
          start_time?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          weekday: number
        }
        Update: {
          class_id?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          period?: number
          room?: string | null
          start_time?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
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
      year_end_snapshots: {
        Row: {
          conduct_grade: number | null
          created_by: string | null
          general_average: number | null
          id: string
          motivated_absences: number | null
          school_year_id: string
          snapshot_at: string
          student_id: string
          subject_average: number | null
          subject_id: string
          total_absences: number | null
          unmotivated_absences: number | null
        }
        Insert: {
          conduct_grade?: number | null
          created_by?: string | null
          general_average?: number | null
          id?: string
          motivated_absences?: number | null
          school_year_id: string
          snapshot_at?: string
          student_id: string
          subject_average?: number | null
          subject_id: string
          total_absences?: number | null
          unmotivated_absences?: number | null
        }
        Update: {
          conduct_grade?: number | null
          created_by?: string | null
          general_average?: number | null
          id?: string
          motivated_absences?: number | null
          school_year_id?: string
          snapshot_at?: string
          student_id?: string
          subject_average?: number | null
          subject_id?: string
          total_absences?: number | null
          unmotivated_absences?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "year_end_snapshots_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "year_end_snapshots_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "year_end_snapshots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_student_absence_summary: {
        Row: {
          motivated: number | null
          pending: number | null
          school_year_id: string | null
          student_id: string | null
          total_absences: number | null
          unmotivated: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      v_student_general_averages: {
        Row: {
          general_average: number | null
          school_year_id: string | null
          student_id: string | null
          subject_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      v_student_subject_averages: {
        Row: {
          average: number | null
          grade_count: number | null
          school_year_id: string | null
          student_id: string | null
          subject_id: string | null
          subject_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
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
    }
    Functions: {
      calc_general_average: {
        Args: { p_school_year_id?: string; p_student_id: string }
        Returns: number
      }
      calc_subject_average: {
        Args: {
          p_school_year_id?: string
          p_student_id: string
          p_subject_id: string
        }
        Returns: number
      }
      claim_invitation: {
        Args: { p_code_hash: string; p_user_id: string }
        Returns: {
          class_id: string
          error_message: string
          invitation_id: string
          role: Database["public"]["Enums"]["invitation_role"]
          school_id: string
          student_id: string
          success: boolean
        }[]
      }
      close_year: { Args: { p_school_year_id: string }; Returns: boolean }
      create_invitation: {
        Args: {
          p_class_id?: string | null
          p_created_by?: string | null
          p_expires_hours?: number
          p_first_name?: string | null
          p_intended_for?: string | null
          p_invited_email?: string | null
          p_invited_phone?: string | null
          p_last_name?: string | null
          p_max_uses?: number
          p_role: Database["public"]["Enums"]["invitation_role"]
          p_school_id: string
          p_student_id?: string | null
          p_student_number?: number | null
        }
        Returns: {
          error_message: string
          invitation_id: string
          plain_code: string
        }[]
      }
      finalize_expired_absences: { Args: never; Returns: number }
      generate_activation_code: { Args: never; Returns: string }
      generate_invitation_code: { Args: never; Returns: string }
      get_class_stats_for_display: {
        Args: { p_class_id: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          absences_count: number
          general_average: number
          student_id: string
          student_name: string
        }[]
      }
      get_class_totals_for_display: {
        Args: { p_class_id: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          class_average: number
          total_absences: number
          total_motivated: number
        }[]
      }
      get_teacher_class_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_invitation_code: { Args: { code: string }; Returns: string }
      is_invitation_valid: { Args: { inv_id: string }; Returns: boolean }
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
      log_audit_extended: {
        Args: {
          _action: string
          _active_role: Database["public"]["Enums"]["app_role"]
          _details?: Json
          _entity_id?: string
          _entity_type?: string
          _new_data?: Json
          _old_data?: Json
          _school_id?: string
          _user_id: string
          _user_name: string
        }
        Returns: string
      }
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: boolean }
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
        | "developer"
      invitation_role:
        | "director"
        | "teacher"
        | "homeroom_teacher"
        | "student"
        | "parent"
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
        "developer",
      ],
      invitation_role: [
        "director",
        "teacher",
        "homeroom_teacher",
        "student",
        "parent",
      ],
    },
  },
} as const
