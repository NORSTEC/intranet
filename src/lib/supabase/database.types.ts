export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          decision_note: string | null
          field_of_study: string | null
          id: number
          message: string | null
          organization_id: number
          person_id: number
          reviewed_at: string | null
          reviewed_by_person_id: number | null
          status: string
          study_year: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_note?: string | null
          field_of_study?: string | null
          id?: never
          message?: string | null
          organization_id: number
          person_id: number
          reviewed_at?: string | null
          reviewed_by_person_id?: number | null
          status?: string
          study_year?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_note?: string | null
          field_of_study?: string | null
          id?: never
          message?: string | null
          organization_id?: number
          person_id?: number
          reviewed_at?: string | null
          reviewed_by_person_id?: number | null
          status?: string
          study_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_reviewed_by_person_id_fkey"
            columns: ["reviewed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_person_id: number | null
          created_at: string
          details: Json
          id: number
          organization_id: number | null
          target_person_id: number | null
        }
        Insert: {
          action: string
          actor_person_id?: number | null
          created_at?: string
          details?: Json
          id?: never
          organization_id?: number | null
          target_person_id?: number | null
        }
        Update: {
          action?: string
          actor_person_id?: number | null
          created_at?: string
          details?: Json
          id?: never
          organization_id?: number | null
          target_person_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_target_person_id_fkey"
            columns: ["target_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      external_accounts: {
        Row: {
          account_email: string | null
          created_at: string
          deprovisioned_at: string | null
          external_id: string | null
          id: number
          last_error: string | null
          organization_id: number
          person_id: number
          provider: string
          provisioned_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          deprovisioned_at?: string | null
          external_id?: string | null
          id?: never
          last_error?: string | null
          organization_id: number
          person_id: number
          provider: string
          provisioned_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          created_at?: string
          deprovisioned_at?: string | null
          external_id?: string | null
          id?: never
          last_error?: string | null
          organization_id?: number
          person_id?: number
          provider?: string
          provisioned_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          ended_at: string | null
          ends_on: string | null
          id: number
          joined_at: string
          organization_id: number
          person_id: number
          provisioning_method: string
          role: string
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ends_on?: string | null
          id?: never
          joined_at?: string
          organization_id: number
          person_id: number
          provisioning_method?: string
          role?: string
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ends_on?: string | null
          id?: never
          joined_at?: string
          organization_id?: number
          person_id?: number
          provisioning_method?: string
          role?: string
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: number
          location: string | null
          logo_path: string | null
          name: string
          short_description: string | null
          slug: string
          specialization: string | null
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          location?: string | null
          logo_path?: string | null
          name: string
          short_description?: string | null
          slug: string
          specialization?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          location?: string | null
          logo_path?: string | null
          name?: string
          short_description?: string | null
          slug?: string
          specialization?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      people: {
        Row: {
          avatar_alt: string | null
          avatar_path: string | null
          created_at: string
          field_of_study: string | null
          first_name: string | null
          full_name: string | null
          id: number
          last_name: string | null
          linkedin_url: string | null
          phone_number: string | null
          portal_access_status: string
          source: string
          study_year: number | null
          updated_at: string
        }
        Insert: {
          avatar_alt?: string | null
          avatar_path?: string | null
          created_at?: string
          field_of_study?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: never
          last_name?: string | null
          linkedin_url?: string | null
          phone_number?: string | null
          portal_access_status?: string
          source?: string
          study_year?: number | null
          updated_at?: string
        }
        Update: {
          avatar_alt?: string | null
          avatar_path?: string | null
          created_at?: string
          field_of_study?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: never
          last_name?: string | null
          linkedin_url?: string | null
          phone_number?: string | null
          portal_access_status?: string
          source?: string
          study_year?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      person_emails: {
        Row: {
          created_at: string
          email: string
          email_type: string
          id: number
          is_primary: boolean
          person_id: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_type?: string
          id?: never
          is_primary?: boolean
          person_id: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_type?: string
          id?: never
          is_primary?: boolean
          person_id?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_emails_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_accounts: {
        Row: {
          account_email: string
          auth_user_id: string
          last_seen_at: string
          linked_at: string
          person_id: number
          provider: string
        }
        Insert: {
          account_email: string
          auth_user_id: string
          last_seen_at?: string
          linked_at?: string
          person_id: number
          provider?: string
        }
        Update: {
          account_email?: string
          auth_user_id?: string
          last_seen_at?: string
          linked_at?: string
          person_id?: number
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          ends_on: string | null
          id: number
          person_id: number
          role_title: string | null
          sort_order: number
          starts_on: string | null
          team_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: never
          person_id: number
          role_title?: string | null
          sort_order?: number
          starts_on?: string | null
          team_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: never
          person_id?: number
          role_title?: string | null
          sort_order?: number
          starts_on?: string | null
          team_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: number
          name: string
          organization_id: number
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: never
          name: string
          organization_id: number
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: never
          name?: string
          organization_id?: number
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      submit_access_request: {
        Args: {
          requested_field_of_study: string
          requested_first_name: string
          requested_last_name: string
          requested_message: string
          requested_study_year: number
          target_organization_id: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
