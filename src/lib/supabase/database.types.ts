export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          created_at: string
          decision_note: string | null
          field_of_study: string | null
          id: number
          message: string | null
          organization_id: number | null
          person_id: number
          request_type: string
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
          organization_id?: number | null
          person_id: number
          request_type?: string
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
          organization_id?: number | null
          person_id?: number
          request_type?: string
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
      historical_membership_requests: {
        Row: {
          created_at: string
          decision_note: string | null
          ends_on: string
          id: number
          message: string | null
          organization_id: number
          person_id: number
          reviewed_at: string | null
          reviewed_by_person_id: number | null
          role_title: string | null
          starts_on: string | null
          status: string
          team_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_note?: string | null
          ends_on: string
          id?: never
          message?: string | null
          organization_id: number
          person_id: number
          reviewed_at?: string | null
          reviewed_by_person_id?: number | null
          role_title?: string | null
          starts_on?: string | null
          status?: string
          team_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_note?: string | null
          ends_on?: string
          id?: never
          message?: string | null
          organization_id?: number
          person_id?: number
          reviewed_at?: string | null
          reviewed_by_person_id?: number | null
          role_title?: string | null
          starts_on?: string | null
          status?: string
          team_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_membership_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_membership_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_membership_requests_reviewed_by_person_id_fkey"
            columns: ["reviewed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_membership_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_periods: {
        Row: {
          created_at: string
          ended_at: string | null
          ends_on: string | null
          id: number
          membership_id: number
          started_at: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ends_on?: string | null
          id?: never
          membership_id: number
          started_at?: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ends_on?: string | null
          id?: never
          membership_id?: number
          started_at?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_periods_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
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
          access_status_before_deletion: string | null
          alumni_access_granted_at: string | null
          avatar_alt: string | null
          avatar_path: string | null
          created_at: string
          deleted_at: string | null
          deleted_by_person_id: number | null
          deletion_reason: string | null
          field_of_study: string | null
          first_name: string | null
          full_name: string | null
          id: number
          last_name: string | null
          linkedin_url: string | null
          phone_number: string | null
          portal_access_status: string
          profile_updated_at: string
          source: string
          study_year: number | null
          updated_at: string
        }
        Insert: {
          access_status_before_deletion?: string | null
          alumni_access_granted_at?: string | null
          avatar_alt?: string | null
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_person_id?: number | null
          deletion_reason?: string | null
          field_of_study?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: never
          last_name?: string | null
          linkedin_url?: string | null
          phone_number?: string | null
          portal_access_status?: string
          profile_updated_at?: string
          source?: string
          study_year?: number | null
          updated_at?: string
        }
        Update: {
          access_status_before_deletion?: string | null
          alumni_access_granted_at?: string | null
          avatar_alt?: string | null
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_person_id?: number | null
          deletion_reason?: string | null
          field_of_study?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: never
          last_name?: string | null
          linkedin_url?: string | null
          phone_number?: string | null
          portal_access_status?: string
          profile_updated_at?: string
          source?: string
          study_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_deleted_by_person_id_fkey"
            columns: ["deleted_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
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
          onboarding_status: string
          person_id: number
          provider: string
        }
        Insert: {
          account_email: string
          auth_user_id: string
          last_seen_at?: string
          linked_at?: string
          onboarding_status?: string
          person_id: number
          provider?: string
        }
        Update: {
          account_email?: string
          auth_user_id?: string
          last_seen_at?: string
          linked_at?: string
          onboarding_status?: string
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
      portal_administrators: {
        Row: {
          granted_at: string
          granted_by_person_id: number | null
          person_id: number
        }
        Insert: {
          granted_at?: string
          granted_by_person_id?: number | null
          person_id: number
        }
        Update: {
          granted_at?: string
          granted_by_person_id?: number | null
          person_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_administrators_granted_by_person_id_fkey"
            columns: ["granted_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_administrators_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_experience_roles: {
        Row: {
          created_at: string
          ends_on: string | null
          experience_id: number
          id: number
          role_title: string | null
          sort_order: number
          starts_on: string | null
          team_id: number | null
          team_membership_id: number | null
          team_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          experience_id: number
          id?: never
          role_title?: string | null
          sort_order?: number
          starts_on?: string | null
          team_id?: number | null
          team_membership_id?: number | null
          team_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          experience_id?: number
          id?: never
          role_title?: string | null
          sort_order?: number
          starts_on?: string | null
          team_id?: number | null
          team_membership_id?: number | null
          team_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_experience_roles_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "profile_experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_experience_roles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_experience_roles_team_membership_id_fkey"
            columns: ["team_membership_id"]
            isOneToOne: true
            referencedRelation: "team_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_experiences: {
        Row: {
          created_at: string
          description: string | null
          ends_on: string | null
          id: number
          membership_id: number | null
          organization_id: number | null
          organization_name: string
          person_id: number
          source: string
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: never
          membership_id?: number | null
          organization_id?: number | null
          organization_name: string
          person_id: number
          source?: string
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_on?: string | null
          id?: never
          membership_id?: number | null
          organization_id?: number | null
          organization_name?: string
          person_id?: number
          source?: string
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_experiences_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_experiences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_experiences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          archived_at: string | null
          archived_by_person_id: number | null
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
          archived_at?: string | null
          archived_by_person_id?: number | null
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
          archived_at?: string | null
          archived_by_person_id?: number | null
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
            foreignKeyName: "team_memberships_archived_by_person_id_fkey"
            columns: ["archived_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
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
      cancel_own_access_request: {
        Args: { p_request_id: number }
        Returns: undefined
      }
      complete_own_organization_onboarding: { Args: never; Returns: Json }
      complete_portal_account_link: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      create_own_profile_experience: {
        Args: {
          p_description: string
          p_ends_on: string
          p_organization_id: number
          p_organization_name: string
          p_role_title: string
          p_starts_on: string
          p_team_name: string
        }
        Returns: number
      }
      create_own_profile_experience_v2: {
        Args: {
          p_description: string
          p_ends_on: string
          p_organization_id: number
          p_organization_name: string
          p_roles: Json
          p_starts_on: string
        }
        Returns: number
      }
      create_team: {
        Args: {
          p_description: string | null
          p_name: string
          p_organization_id: number
        }
        Returns: Json
      }
      delete_own_account: { Args: never; Returns: undefined }
      delete_team: {
        Args: { p_team_id: number }
        Returns: undefined
      }
      merge_people: {
        Args: {
          p_primary_email?: string | null
          p_source_person_id: number
          p_target_person_id: number
        }
        Returns: undefined
      }
      purge_person: {
        Args: { p_expected_deleted_at: string; p_person_id: number }
        Returns: string | null
      }
      restore_own_team_experience: {
        Args: { p_expected_updated_at: string; p_team_membership_id: number }
        Returns: string
      }
      restore_person: { Args: { p_person_id: number }; Returns: undefined }
      review_access_request: {
        Args: {
          p_decision: string
          p_decision_note: string | null
          p_request_id: number
        }
        Returns: undefined
      }
      review_historical_membership_request: {
        Args: {
          p_decision: string
          p_decision_note: string
          p_request_id: number
        }
        Returns: undefined
      }
      save_organization_settings: {
        Args: {
          p_expected_updated_at: string
          p_location: string | null
          p_name: string
          p_organization_id: number
          p_short_description: string | null
          p_specialization: string | null
          p_website_url: string | null
        }
        Returns: string
      }
      save_own_profile: {
        Args: {
          p_avatar_alt: string
          p_avatar_path: string
          p_expected_people_updated_at: string
          p_field_of_study: string
          p_full_name: string
          p_linkedin_url: string
          p_memberships: Json
          p_new_team_memberships: Json
          p_phone_number: string
          p_study_year: number
          p_team_memberships: Json
        }
        Returns: string
      }
      save_own_profile_v4: {
        Args: {
          p_avatar_alt: string
          p_avatar_path: string
          p_deleted_experiences: Json
          p_deleted_roles: Json
          p_expected_people_updated_at: string
          p_experiences: Json
          p_field_of_study: string
          p_linkedin_url: string
          p_new_roles: Json
          p_phone_number: string
          p_roles: Json
          p_study_year: number
        }
        Returns: string
      }
      save_own_profile_v5: {
        Args: {
          p_avatar_alt: string
          p_avatar_path: string
          p_deleted_experiences: Json
          p_deleted_roles: Json
          p_expected_profile_updated_at: string
          p_experiences: Json
          p_field_of_study: string
          p_linkedin_url: string
          p_new_roles: Json
          p_phone_number: string
          p_roles: Json
          p_study_year: number
        }
        Returns: string
      }
      save_own_profile_v6: {
        Args: {
          p_avatar_alt: string | null
          p_avatar_path: string | null
          p_deleted_experiences: Json
          p_deleted_roles: Json
          p_expected_profile_updated_at: string
          p_experiences: Json
          p_field_of_study: string | null
          p_linkedin_url: string | null
          p_new_experiences: Json
          p_new_roles: Json
          p_phone_number: string | null
          p_roles: Json
          p_study_year: number | null
        }
        Returns: string
      }
      save_team_settings: {
        Args: {
          p_description: string | null
          p_expected_updated_at: string
          p_name: string
          p_person_ids: number[] | null
          p_team_id: number
        }
        Returns: string
      }
      set_membership_role: {
        Args: { p_membership_id: number; p_role: string }
        Returns: undefined
      }
      set_organization_membership_status: {
        Args: { p_membership_id: number; p_status: string }
        Returns: undefined
      }
      set_person_portal_access: {
        Args: { p_person_id: number; p_status: string }
        Returns: undefined
      }
      set_portal_administrator: {
        Args: { p_is_administrator: boolean; p_person_id: number }
        Returns: undefined
      }
      sign_in_block_reason: { Args: never; Returns: string | null }
      soft_delete_person: {
        Args: { p_person_id: number; p_reason?: string | null }
        Returns: undefined
      }
      start_portal_account_link: {
        Args: { p_mode: string; p_token_hash: string }
        Returns: undefined
      }
      submit_access_request: {
        Args: {
          requested_field_of_study: string
          requested_first_name: string
          requested_last_name: string
          requested_message: string
          requested_request_type: string
          requested_study_year: number | null
          target_organization_id: number | null
        }
        Returns: number
      }
      submit_historical_membership_request: {
        Args: {
          p_ends_on: string
          p_message: string
          p_organization_id: number
          p_role_title: string
          p_starts_on: string
          p_team_id: number
        }
        Returns: number
      }
      unlink_own_portal_account: {
        Args: { p_auth_user_id: string }
        Returns: Json
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
