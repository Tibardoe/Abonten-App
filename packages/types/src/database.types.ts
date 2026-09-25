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
      account_setup_prompt_state: {
        Row: {
          dismiss_count: number
          dismissed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          dismiss_count?: number
          dismissed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          dismiss_count?: number
          dismissed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_setup_prompt_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_setup_prompt_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_roles: string[]
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          reason: string | null
          request_meta: Json | null
          summary: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_roles?: string[]
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          request_meta?: Json | null
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_roles?: string[]
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          request_meta?: Json | null
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_note: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          supersedes_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          supersedes_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          supersedes_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_note_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "admin_note"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permission: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
        }
        Relationships: []
      }
      admin_role: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
        }
        Relationships: []
      }
      admin_role_permission: {
        Row: {
          created_at: string
          permission_key: string
          role_key: string
        }
        Insert: {
          created_at?: string
          permission_key: string
          role_key: string
        }
        Update: {
          created_at?: string
          permission_key?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_role_permission_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "admin_permission"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "admin_role_permission_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "admin_role"
            referencedColumns: ["key"]
          },
        ]
      }
      admin_user: {
        Row: {
          created_at: string
          created_by: string | null
          disabled_at: string | null
          disabled_by: string | null
          notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_user_role: {
        Row: {
          granted_at: string
          granted_by: string | null
          role_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_role_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "admin_role"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "admin_user_role_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      app_error_event: {
        Row: {
          app_version: string | null
          context: Json | null
          created_at: string
          error_type: string | null
          fingerprint: string
          id: string
          message: string | null
          occurred_at: string
          platform: string
          release: string | null
          route: string | null
          severity: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          context?: Json | null
          created_at?: string
          error_type?: string | null
          fingerprint: string
          id?: string
          message?: string | null
          occurred_at?: string
          platform: string
          release?: string | null
          route?: string | null
          severity?: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          context?: Json | null
          created_at?: string
          error_type?: string | null
          fingerprint?: string
          id?: string
          message?: string | null
          occurred_at?: string
          platform?: string
          release?: string | null
          route?: string | null
          severity?: string
          stack?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_error_group: {
        Row: {
          assigned_to: string | null
          error_type: string | null
          event_count: number
          fingerprint: string
          first_seen: string
          last_app_version: string | null
          last_route: string | null
          last_seen: string
          platforms: string[]
          sample_message: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          error_type?: string | null
          event_count?: number
          fingerprint: string
          first_seen?: string
          last_app_version?: string | null
          last_route?: string | null
          last_seen?: string
          platforms?: string[]
          sample_message?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          error_type?: string | null
          event_count?: number
          fingerprint?: string
          first_seen?: string
          last_app_version?: string | null
          last_route?: string | null
          last_seen?: string
          platforms?: string[]
          sample_message?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_request_metric: {
        Row: {
          duration_ms: number | null
          id: string
          method: string | null
          occurred_at: string
          ok: boolean
          platform: string
          route: string | null
          status_code: number | null
        }
        Insert: {
          duration_ms?: number | null
          id?: string
          method?: string | null
          occurred_at?: string
          ok?: boolean
          platform: string
          route?: string | null
          status_code?: number | null
        }
        Update: {
          duration_ms?: number | null
          id?: string
          method?: string | null
          occurred_at?: string
          ok?: boolean
          platform?: string
          route?: string | null
          status_code?: number | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string | null
          email: string | null
          event_id: string
          for_someone_else: boolean | null
          id: string
          name: string | null
          number_of_tickets: number
          phone: string | null
          status: string | null
          ticket_id: string | null
          ticket_type_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          event_id: string
          for_someone_else?: boolean | null
          id?: string
          name?: string | null
          number_of_tickets: number
          phone?: string | null
          status?: string | null
          ticket_id?: string | null
          ticket_type_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          event_id?: string
          for_someone_else?: boolean | null
          id?: string
          name?: string | null
          number_of_tickets?: number
          phone?: string | null
          status?: string | null
          ticket_id?: string | null
          ticket_type_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticket"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_audience_snapshot: {
        Row: {
          computed_at: string | null
          daily_viewers: number
          days_observed: number
          id: number
          reach_28d: number
        }
        Insert: {
          computed_at?: string | null
          daily_viewers?: number
          days_observed?: number
          id?: number
          reach_28d?: number
        }
        Update: {
          computed_at?: string | null
          daily_viewers?: number
          days_observed?: number
          id?: number
          reach_28d?: number
        }
        Relationships: []
      }
      content_campaign: {
        Row: {
          activated_at: string | null
          active_seconds: number
          advertiser_id: string
          budget_minor: number
          cancelled_at: string | null
          checkout_id: string | null
          click_count: number
          completed_at: string | null
          completion_count: number
          conversion_count: number
          cpm_minor: number
          created_at: string
          currency: string
          duration_days: number
          end_reason: string | null
          ends_at: string
          estimate_basis: string
          estimated_impressions: number
          estimated_reach_high: number
          estimated_reach_low: number
          id: string
          impression_count: number
          impression_goal: number
          last_accrued_at: string | null
          objective: string
          paid_minor: number
          pause_reason: string | null
          pause_source: string | null
          post_id: string
          pricing_version: number
          reach_count: number
          refund_requested_at: string | null
          refunded_minor: number
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spent_minor: number
          starts_at: string
          status: string
          targeting_categories: string[]
          targeting_location: unknown
          targeting_radius_km: number | null
          transaction_id: string | null
          updated_at: string
          version: number
          view_count: number
        }
        Insert: {
          activated_at?: string | null
          active_seconds?: number
          advertiser_id: string
          budget_minor: number
          cancelled_at?: string | null
          checkout_id?: string | null
          click_count?: number
          completed_at?: string | null
          completion_count?: number
          conversion_count?: number
          cpm_minor: number
          created_at?: string
          currency?: string
          duration_days: number
          end_reason?: string | null
          ends_at: string
          estimate_basis?: string
          estimated_impressions?: number
          estimated_reach_high?: number
          estimated_reach_low?: number
          id?: string
          impression_count?: number
          impression_goal: number
          last_accrued_at?: string | null
          objective?: string
          paid_minor?: number
          pause_reason?: string | null
          pause_source?: string | null
          post_id: string
          pricing_version: number
          reach_count?: number
          refund_requested_at?: string | null
          refunded_minor?: number
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_minor?: number
          starts_at: string
          status?: string
          targeting_categories?: string[]
          targeting_location?: unknown
          targeting_radius_km?: number | null
          transaction_id?: string | null
          updated_at?: string
          version?: number
          view_count?: number
        }
        Update: {
          activated_at?: string | null
          active_seconds?: number
          advertiser_id?: string
          budget_minor?: number
          cancelled_at?: string | null
          checkout_id?: string | null
          click_count?: number
          completed_at?: string | null
          completion_count?: number
          conversion_count?: number
          cpm_minor?: number
          created_at?: string
          currency?: string
          duration_days?: number
          end_reason?: string | null
          ends_at?: string
          estimate_basis?: string
          estimated_impressions?: number
          estimated_reach_high?: number
          estimated_reach_low?: number
          id?: string
          impression_count?: number
          impression_goal?: number
          last_accrued_at?: string | null
          objective?: string
          paid_minor?: number
          pause_reason?: string | null
          pause_source?: string | null
          post_id?: string
          pricing_version?: number
          reach_count?: number
          refund_requested_at?: string | null
          refunded_minor?: number
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_minor?: number
          starts_at?: string
          status?: string
          targeting_categories?: string[]
          targeting_location?: unknown
          targeting_radius_km?: number | null
          transaction_id?: string | null
          updated_at?: string
          version?: number
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_campaign_checkout_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "content_campaign_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
        ]
      }
      content_campaign_checkout: {
        Row: {
          campaign_id: string
          completed_at: string | null
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          owner_id: string
          status: string
          total_price: number
          unit_price: number
        }
        Insert: {
          campaign_id: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          owner_id: string
          status?: string
          total_price: number
          unit_price: number
        }
        Update: {
          campaign_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          owner_id?: string
          status?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_checkout_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "content_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_checkout_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_checkout_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_campaign_conversion: {
        Row: {
          campaign_id: string | null
          click_id: number | null
          created_at: string
          id: number
          kind: string
          post_id: string
          source_id: string
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          click_id?: number | null
          created_at?: string
          id?: never
          kind: string
          post_id: string
          source_id: string
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          click_id?: number | null
          created_at?: string
          id?: never
          kind?: string
          post_id?: string
          source_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_conversion_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "content_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_conversion_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
        ]
      }
      content_campaign_event: {
        Row: {
          actor_id: string | null
          actor_kind: string
          campaign_id: string
          created_at: string
          from_status: string | null
          id: number
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          campaign_id: string
          created_at?: string
          from_status?: string | null
          id?: never
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          campaign_id?: string
          created_at?: string
          from_status?: string | null
          id?: never
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_event_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "content_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      content_campaign_ledger: {
        Row: {
          actor_id: string | null
          amount_minor: number
          campaign_id: string
          created_at: string
          currency: string
          entry_type: string
          id: number
          idempotency_key: string
          note: string | null
          transaction_id: string | null
        }
        Insert: {
          actor_id?: string | null
          amount_minor: number
          campaign_id: string
          created_at?: string
          currency?: string
          entry_type: string
          id?: never
          idempotency_key: string
          note?: string | null
          transaction_id?: string | null
        }
        Update: {
          actor_id?: string | null
          amount_minor?: number
          campaign_id?: string
          created_at?: string
          currency?: string
          entry_type?: string
          id?: never
          idempotency_key?: string
          note?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_ledger_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "content_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      content_click: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: number
          invalid_reason: string | null
          kind: string
          post_id: string
          valid: boolean
          viewer_id: string | null
          viewer_key: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          invalid_reason?: string | null
          kind: string
          post_id: string
          valid?: boolean
          viewer_id?: string | null
          viewer_key: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          invalid_reason?: string | null
          kind?: string
          post_id?: string
          valid?: boolean
          viewer_id?: string | null
          viewer_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_click_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
        ]
      }
      content_comment: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          like_count: number
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string
          parent_id: string | null
          post_id: string
          reply_count: number
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          like_count?: number
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          parent_id?: string | null
          post_id: string
          reply_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          like_count?: number
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          parent_id?: string | null
          post_id?: string
          reply_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_comment_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comment_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_comment_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comment_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_comment_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "content_comment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comment_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
        ]
      }
      content_comment_like: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_comment_like_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "content_comment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comment_like_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comment_like_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_like: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_like_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_like_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_like_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_media: {
        Row: {
          bytes: number
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          failure_reason: string | null
          format: string | null
          height: number | null
          id: string
          media_type: string
          media_url: string
          owner_id: string
          playback_status: string
          playback_url: string | null
          position: number
          post_id: string | null
          poster_url: string | null
          public_id: string
          purged_at: string | null
          status: string
          thumbnail_url: string | null
          trim_end_seconds: number | null
          trim_start_seconds: number | null
          updated_at: string
          version: number
          width: number | null
        }
        Insert: {
          bytes: number
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          failure_reason?: string | null
          format?: string | null
          height?: number | null
          id?: string
          media_type: string
          media_url: string
          owner_id: string
          playback_status?: string
          playback_url?: string | null
          position?: number
          post_id?: string | null
          poster_url?: string | null
          public_id: string
          purged_at?: string | null
          status?: string
          thumbnail_url?: string | null
          trim_end_seconds?: number | null
          trim_start_seconds?: number | null
          updated_at?: string
          version: number
          width?: number | null
        }
        Update: {
          bytes?: number
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          failure_reason?: string | null
          format?: string | null
          height?: number | null
          id?: string
          media_type?: string
          media_url?: string
          owner_id?: string
          playback_status?: string
          playback_url?: string | null
          position?: number
          post_id?: string | null
          poster_url?: string | null
          public_id?: string
          purged_at?: string | null
          status?: string
          thumbnail_url?: string | null
          trim_end_seconds?: number | null
          trim_start_seconds?: number | null
          updated_at?: string
          version?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
        ]
      }
      content_mute: {
        Row: {
          created_at: string
          publisher_id: string
          publisher_kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          publisher_id: string
          publisher_kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          publisher_id?: string
          publisher_kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_mute_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_mute_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_not_interested: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_not_interested_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_not_interested_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_not_interested_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_post: {
        Row: {
          allow_comments: boolean
          allow_download: boolean
          author_id: string
          caption: string | null
          category: string | null
          comment_count: number
          cover_media_id: string | null
          created_at: string
          deleted_at: string | null
          event_id: string | null
          expires_at: string | null
          hashtags: string[]
          id: string
          impression_count: number
          kind: string
          like_count: number
          location: unknown
          location_source: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string
          place_id: string | null
          published_at: string | null
          publisher_kind: string
          publisher_place_id: string | null
          reaction_count: number
          rights_acknowledged_at: string | null
          save_count: number
          search_tsv: unknown
          share_count: number
          status: string
          trending_computed_at: string | null
          trending_score: number
          updated_at: string
          version: number
          view_count: number
        }
        Insert: {
          allow_comments?: boolean
          allow_download?: boolean
          author_id: string
          caption?: string | null
          category?: string | null
          comment_count?: number
          cover_media_id?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          hashtags?: string[]
          id?: string
          impression_count?: number
          kind: string
          like_count?: number
          location?: unknown
          location_source?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          place_id?: string | null
          published_at?: string | null
          publisher_kind?: string
          publisher_place_id?: string | null
          reaction_count?: number
          rights_acknowledged_at?: string | null
          save_count?: number
          search_tsv?: unknown
          share_count?: number
          status?: string
          trending_computed_at?: string | null
          trending_score?: number
          updated_at?: string
          version?: number
          view_count?: number
        }
        Update: {
          allow_comments?: boolean
          allow_download?: boolean
          author_id?: string
          caption?: string | null
          category?: string | null
          comment_count?: number
          cover_media_id?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          hashtags?: string[]
          id?: string
          impression_count?: number
          kind?: string
          like_count?: number
          location?: unknown
          location_source?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          place_id?: string | null
          published_at?: string | null
          publisher_kind?: string
          publisher_place_id?: string | null
          reaction_count?: number
          rights_acknowledged_at?: string | null
          save_count?: number
          search_tsv?: unknown
          share_count?: number
          status?: string
          trending_computed_at?: string | null
          trending_score?: number
          updated_at?: string
          version?: number
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_post_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_post_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_post_cover_media_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "content_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_post_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_post_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_post_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "content_post_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_post_publisher_place_id_fkey"
            columns: ["publisher_place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      content_post_daily_stat: {
        Row: {
          comments: number
          completions: number
          cta_clicks: number
          day: string
          event_clicks: number
          impressions: number
          likes: number
          meaningful_views: number
          place_clicks: number
          post_id: string
          profile_clicks: number
          replays: number
          saves: number
          shares: number
          ticket_clicks: number
          unique_viewers: number
          updated_at: string
          view_starts: number
          watched_ms_total: number
        }
        Insert: {
          comments?: number
          completions?: number
          cta_clicks?: number
          day: string
          event_clicks?: number
          impressions?: number
          likes?: number
          meaningful_views?: number
          place_clicks?: number
          post_id: string
          profile_clicks?: number
          replays?: number
          saves?: number
          shares?: number
          ticket_clicks?: number
          unique_viewers?: number
          updated_at?: string
          view_starts?: number
          watched_ms_total?: number
        }
        Update: {
          comments?: number
          completions?: number
          cta_clicks?: number
          day?: string
          event_clicks?: number
          impressions?: number
          likes?: number
          meaningful_views?: number
          place_clicks?: number
          post_id?: string
          profile_clicks?: number
          replays?: number
          saves?: number
          shares?: number
          ticket_clicks?: number
          unique_viewers?: number
          updated_at?: string
          view_starts?: number
          watched_ms_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_post_daily_stat_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
        ]
      }
      content_program_setting: {
        Row: {
          beta_user_ids: string[]
          comments_per_hour: number
          creator_posting_enabled: boolean
          deleted_post_retention_days: number
          expired_story_retention_days: number
          feed_page_size: number
          follows_per_hour: number
          happening_soon_days: number
          happening_soon_enabled: boolean
          id: number
          max_story_items: number
          meaningful_view_ms: number
          nearby_default_radius_km: number
          nearby_enabled: boolean
          orphan_media_hours: number
          rank_seen_penalty: number
          rank_weight_engagement: number
          rank_weight_following: number
          rank_weight_proximity: number
          rank_weight_recency: number
          rank_weight_urgency: number
          raw_view_retention_days: number
          sponsored_daily_cap_per_viewer: number
          sponsored_delivery_enabled: boolean
          sponsored_max_share_bps: number
          sponsored_min_gap: number
          spotlight_audience: string
          spotlight_comments_enabled: boolean
          spotlight_downloads_enabled: boolean
          spotlight_enabled: boolean
          spotlight_posting_enabled: boolean
          spotlight_posts_per_day: number
          spotlight_promotions_enabled: boolean
          spotlight_video_max_seconds: number
          stories_audience: string
          stories_comments_enabled: boolean
          stories_enabled: boolean
          stories_per_day: number
          stories_posting_enabled: boolean
          stories_reactions_enabled: boolean
          stories_sharing_enabled: boolean
          story_ttl_hours: number
          story_video_max_seconds: number
          trending_enabled: boolean
          trending_window_hours: number
          updated_at: string
          updated_by: string | null
          views_per_viewer_per_minute: number
        }
        Insert: {
          beta_user_ids?: string[]
          comments_per_hour?: number
          creator_posting_enabled?: boolean
          deleted_post_retention_days?: number
          expired_story_retention_days?: number
          feed_page_size?: number
          follows_per_hour?: number
          happening_soon_days?: number
          happening_soon_enabled?: boolean
          id?: number
          max_story_items?: number
          meaningful_view_ms?: number
          nearby_default_radius_km?: number
          nearby_enabled?: boolean
          orphan_media_hours?: number
          rank_seen_penalty?: number
          rank_weight_engagement?: number
          rank_weight_following?: number
          rank_weight_proximity?: number
          rank_weight_recency?: number
          rank_weight_urgency?: number
          raw_view_retention_days?: number
          sponsored_daily_cap_per_viewer?: number
          sponsored_delivery_enabled?: boolean
          sponsored_max_share_bps?: number
          sponsored_min_gap?: number
          spotlight_audience?: string
          spotlight_comments_enabled?: boolean
          spotlight_downloads_enabled?: boolean
          spotlight_enabled?: boolean
          spotlight_posting_enabled?: boolean
          spotlight_posts_per_day?: number
          spotlight_promotions_enabled?: boolean
          spotlight_video_max_seconds?: number
          stories_audience?: string
          stories_comments_enabled?: boolean
          stories_enabled?: boolean
          stories_per_day?: number
          stories_posting_enabled?: boolean
          stories_reactions_enabled?: boolean
          stories_sharing_enabled?: boolean
          story_ttl_hours?: number
          story_video_max_seconds?: number
          trending_enabled?: boolean
          trending_window_hours?: number
          updated_at?: string
          updated_by?: string | null
          views_per_viewer_per_minute?: number
        }
        Update: {
          beta_user_ids?: string[]
          comments_per_hour?: number
          creator_posting_enabled?: boolean
          deleted_post_retention_days?: number
          expired_story_retention_days?: number
          feed_page_size?: number
          follows_per_hour?: number
          happening_soon_days?: number
          happening_soon_enabled?: boolean
          id?: number
          max_story_items?: number
          meaningful_view_ms?: number
          nearby_default_radius_km?: number
          nearby_enabled?: boolean
          orphan_media_hours?: number
          rank_seen_penalty?: number
          rank_weight_engagement?: number
          rank_weight_following?: number
          rank_weight_proximity?: number
          rank_weight_recency?: number
          rank_weight_urgency?: number
          raw_view_retention_days?: number
          sponsored_daily_cap_per_viewer?: number
          sponsored_delivery_enabled?: boolean
          sponsored_max_share_bps?: number
          sponsored_min_gap?: number
          spotlight_audience?: string
          spotlight_comments_enabled?: boolean
          spotlight_downloads_enabled?: boolean
          spotlight_enabled?: boolean
          spotlight_posting_enabled?: boolean
          spotlight_posts_per_day?: number
          spotlight_promotions_enabled?: boolean
          spotlight_video_max_seconds?: number
          stories_audience?: string
          stories_comments_enabled?: boolean
          stories_enabled?: boolean
          stories_per_day?: number
          stories_posting_enabled?: boolean
          stories_reactions_enabled?: boolean
          stories_sharing_enabled?: boolean
          story_ttl_hours?: number
          story_video_max_seconds?: number
          trending_enabled?: boolean
          trending_window_hours?: number
          updated_at?: string
          updated_by?: string | null
          views_per_viewer_per_minute?: number
        }
        Relationships: []
      }
      content_promotion_pricing: {
        Row: {
          audience_floor_daily_viewers: number
          audience_floor_reach: number
          avg_frequency: number
          budget_step_minor: number
          category_audience_share_bps: number
          country_code: string
          cpm_minor: number
          currency: string
          daily_fill_bps: number
          default_duration_days: number
          duration_options_days: number[]
          estimate_spread_bps: number
          id: number
          location_audience_share_by_radius: Json
          max_budget_minor: number
          max_reach_share_bps: number
          min_budget_minor: number
          min_deliverable_bps: number
          pacing_multiplier: number
          suggested_budgets_minor: number[]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          audience_floor_daily_viewers?: number
          audience_floor_reach?: number
          avg_frequency?: number
          budget_step_minor?: number
          category_audience_share_bps?: number
          country_code: string
          cpm_minor?: number
          currency: string
          daily_fill_bps?: number
          default_duration_days?: number
          duration_options_days?: number[]
          estimate_spread_bps?: number
          id?: number
          location_audience_share_by_radius?: Json
          max_budget_minor?: number
          max_reach_share_bps?: number
          min_budget_minor?: number
          min_deliverable_bps?: number
          pacing_multiplier?: number
          suggested_budgets_minor?: number[]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          audience_floor_daily_viewers?: number
          audience_floor_reach?: number
          avg_frequency?: number
          budget_step_minor?: number
          category_audience_share_bps?: number
          country_code?: string
          cpm_minor?: number
          currency?: string
          daily_fill_bps?: number
          default_duration_days?: number
          duration_options_days?: number[]
          estimate_spread_bps?: number
          id?: number
          location_audience_share_by_radius?: Json
          max_budget_minor?: number
          max_reach_share_bps?: number
          min_budget_minor?: number
          min_deliverable_bps?: number
          pacing_multiplier?: number
          suggested_budgets_minor?: number[]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_reaction: {
        Row: {
          created_at: string
          emoji: string
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reaction_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reaction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reaction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_rollup_state: {
        Row: {
          click_id: number
          id: boolean
          last_run_at: string | null
          view_id: number
        }
        Insert: {
          click_id?: number
          id?: boolean
          last_run_at?: string | null
          view_id?: number
        }
        Update: {
          click_id?: number
          id?: boolean
          last_run_at?: string | null
          view_id?: number
        }
        Relationships: []
      }
      content_save: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_save_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_save_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_save_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_share: {
        Row: {
          channel: string
          created_at: string
          id: number
          post_id: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: never
          post_id: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: never
          post_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_share_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_share_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_share_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_story_seen: {
        Row: {
          completed: boolean
          first_seen_at: string
          last_seen_at: string
          post_id: string
          viewer_id: string
        }
        Insert: {
          completed?: boolean
          first_seen_at?: string
          last_seen_at?: string
          post_id: string
          viewer_id: string
        }
        Update: {
          completed?: boolean
          first_seen_at?: string
          last_seen_at?: string
          post_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_story_seen_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_story_seen_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_story_seen_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_view: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: number
          invalid_reason: string | null
          kind: string
          post_id: string
          surface: string
          valid: boolean
          viewer_id: string | null
          viewer_key: string
          watched_ms: number
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          invalid_reason?: string | null
          kind: string
          post_id: string
          surface?: string
          valid?: boolean
          viewer_id?: string | null
          viewer_key: string
          watched_ms?: number
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          invalid_reason?: string | null
          kind?: string
          post_id?: string
          surface?: string
          valid?: boolean
          viewer_id?: string | null
          viewer_key?: string
          watched_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_view_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_post"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_message_sender_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string
          place_id: string | null
          status: string
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          place_id?: string | null
          status?: string
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          place_id?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_block: {
        Row: {
          blocked_id: string
          blocker_id: string
          conversation_id: string | null
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_block_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_block_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_block_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_block_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_block_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participant: {
        Row: {
          archived: boolean
          conversation_id: string
          created_at: string
          id: string
          joined_at: string
          last_read_at: string
          left_at: string | null
          muted: boolean
          role: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          conversation_id: string
          created_at?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          left_at?: string | null
          muted?: boolean
          role: string
          user_id: string
        }
        Update: {
          archived?: boolean
          conversation_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          left_at?: string | null
          muted?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participant_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participant_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participant_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      credit_account: {
        Row: {
          available_minor: number
          created_at: string
          currency: string
          frozen_minor: number
          lifetime_earned_minor: number
          lifetime_expired_minor: number
          lifetime_reversed_minor: number
          lifetime_spent_minor: number
          lifetime_withdrawn_minor: number
          pending_minor: number
          reserved_minor: number
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          updated_at: string
          user_id: string
          version: number
          withdrawing_minor: number
        }
        Insert: {
          available_minor?: number
          created_at?: string
          currency: string
          frozen_minor?: number
          lifetime_earned_minor?: number
          lifetime_expired_minor?: number
          lifetime_reversed_minor?: number
          lifetime_spent_minor?: number
          lifetime_withdrawn_minor?: number
          pending_minor?: number
          reserved_minor?: number
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
          user_id: string
          version?: number
          withdrawing_minor?: number
        }
        Update: {
          available_minor?: number
          created_at?: string
          currency?: string
          frozen_minor?: number
          lifetime_earned_minor?: number
          lifetime_expired_minor?: number
          lifetime_reversed_minor?: number
          lifetime_spent_minor?: number
          lifetime_withdrawn_minor?: number
          pending_minor?: number
          reserved_minor?: number
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          withdrawing_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_account_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
        ]
      }
      credit_adjustment_request: {
        Row: {
          allow_negative: boolean
          amount_minor: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          direction: string
          expires_at: string | null
          id: string
          journal_id: string | null
          reason: string
          requested_at: string
          requested_by: string
          requires_second_approver: boolean
          spend_scope: string
          status: string
          updated_at: string
          user_id: string
          user_label: string | null
        }
        Insert: {
          allow_negative?: boolean
          amount_minor: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          direction: string
          expires_at?: string | null
          id?: string
          journal_id?: string | null
          reason: string
          requested_at?: string
          requested_by: string
          requires_second_approver?: boolean
          spend_scope?: string
          status?: string
          updated_at?: string
          user_id: string
          user_label?: string | null
        }
        Update: {
          allow_negative?: boolean
          amount_minor?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          direction?: string
          expires_at?: string | null
          id?: string
          journal_id?: string | null
          reason?: string
          requested_at?: string
          requested_by?: string
          requires_second_approver?: boolean
          spend_scope?: string
          status?: string
          updated_at?: string
          user_id?: string
          user_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_adjustment_request_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "credit_journal"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_entry: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: number
          journal_id: string
          ledger_account_id: string
          lot_id: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          id?: never
          journal_id: string
          ledger_account_id: string
          lot_id?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: never
          journal_id?: string
          ledger_account_id?: string
          lot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_entry_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "credit_journal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_entry_ledger_account_id_fkey"
            columns: ["ledger_account_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_entry_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "credit_lot"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_journal: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          journal_type: string
          lot_id: string | null
          memo: string | null
          reverses_journal_id: string | null
          reward_event_id: string | null
          source_id: string | null
          source_type: string | null
          user_delta_minor: number
          user_id: string | null
          user_label: string | null
          visible_to_user: boolean
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          journal_type: string
          lot_id?: string | null
          memo?: string | null
          reverses_journal_id?: string | null
          reward_event_id?: string | null
          source_id?: string | null
          source_type?: string | null
          user_delta_minor?: number
          user_id?: string | null
          user_label?: string | null
          visible_to_user?: boolean
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          journal_type?: string
          lot_id?: string | null
          memo?: string | null
          reverses_journal_id?: string | null
          reward_event_id?: string | null
          source_id?: string | null
          source_type?: string | null
          user_delta_minor?: number
          user_id?: string | null
          user_label?: string | null
          visible_to_user?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "credit_journal_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "credit_lot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_journal_reverses_journal_id_fkey"
            columns: ["reverses_journal_id"]
            isOneToOne: false
            referencedRelation: "credit_journal"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger_account: {
        Row: {
          code: string
          created_at: string
          currency: string
          id: string
          owner_user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency: string
          id?: string
          owner_user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          id?: string
          owner_user_id?: string | null
        }
        Relationships: []
      }
      credit_lot: {
        Row: {
          closed_at: string | null
          created_at: string
          currency: string
          expires_at: string | null
          funding_code: string
          held_minor: number
          id: string
          kind: string
          label: string | null
          original_minor: number
          release_at: string | null
          released_at: string | null
          released_minor: number | null
          remaining_minor: number
          reward_event_id: string | null
          source_id: string | null
          source_type: string | null
          spend_scope: string
          status: string
          updated_at: string
          user_id: string
          withdrawable: boolean
          withdrawable_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          currency: string
          expires_at?: string | null
          funding_code: string
          held_minor?: number
          id?: string
          kind: string
          label?: string | null
          original_minor: number
          release_at?: string | null
          released_at?: string | null
          released_minor?: number | null
          remaining_minor: number
          reward_event_id?: string | null
          source_id?: string | null
          source_type?: string | null
          spend_scope: string
          status: string
          updated_at?: string
          user_id: string
          withdrawable?: boolean
          withdrawable_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          funding_code?: string
          held_minor?: number
          id?: string
          kind?: string
          label?: string | null
          original_minor?: number
          release_at?: string | null
          released_at?: string | null
          released_minor?: number | null
          remaining_minor?: number
          reward_event_id?: string | null
          source_id?: string | null
          source_type?: string | null
          spend_scope?: string
          status?: string
          updated_at?: string
          user_id?: string
          withdrawable?: boolean
          withdrawable_at?: string | null
        }
        Relationships: []
      }
      credit_reservation: {
        Row: {
          amount_minor: number
          capture_journal_id: string | null
          captured_at: string | null
          cash_minor: number | null
          created_at: string
          currency: string
          expires_at: string
          id: string
          label: string | null
          lots: Json
          order_total_minor: number
          payment_attempt_id: string | null
          release_journal_id: string | null
          release_reason: string | null
          released_at: string | null
          reserve_journal_id: string | null
          scope: string
          status: string
          target_id: string
          target_type: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_minor: number
          capture_journal_id?: string | null
          captured_at?: string | null
          cash_minor?: number | null
          created_at?: string
          currency: string
          expires_at: string
          id?: string
          label?: string | null
          lots?: Json
          order_total_minor: number
          payment_attempt_id?: string | null
          release_journal_id?: string | null
          release_reason?: string | null
          released_at?: string | null
          reserve_journal_id?: string | null
          scope: string
          status?: string
          target_id: string
          target_type: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_minor?: number
          capture_journal_id?: string | null
          captured_at?: string | null
          cash_minor?: number | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          label?: string | null
          lots?: Json
          order_total_minor?: number
          payment_attempt_id?: string | null
          release_journal_id?: string | null
          release_reason?: string | null
          released_at?: string | null
          reserve_journal_id?: string | null
          scope?: string
          status?: string
          target_id?: string
          target_type?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_reservation_capture_journal_id_fkey"
            columns: ["capture_journal_id"]
            isOneToOne: false
            referencedRelation: "credit_journal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reservation_release_journal_id_fkey"
            columns: ["release_journal_id"]
            isOneToOne: false
            referencedRelation: "credit_journal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_reservation_reserve_journal_id_fkey"
            columns: ["reserve_journal_id"]
            isOneToOne: false
            referencedRelation: "credit_journal"
            referencedColumns: ["id"]
          },
        ]
      }
      currency: {
        Row: {
          code: string
          created_at: string
          enabled: boolean
          minor_units: number
          name: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          enabled?: boolean
          minor_units: number
          name: string
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          enabled?: boolean
          minor_units?: number
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      device_install: {
        Row: {
          first_seen_at: string
          install_id: string
          last_seen_at: string
          platform: string
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          install_id: string
          last_seen_at?: string
          platform: string
          user_id: string
        }
        Update: {
          first_seen_at?: string
          install_id?: string
          last_seen_at?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_install_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_install_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      device_token: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      discovery_program_setting: {
        Row: {
          beta_user_ids: string[]
          candidate_ttl_days: number
          daily_push_cap: number
          digest_hour_local: number
          generate_watermark: string
          id: number
          ignore_pause_after: number
          ignore_pause_days: number
          organizer_cooldown_hours: number
          organizer_search_enabled: boolean
          place_search_enabled: boolean
          prompt_cooldown_days: number
          prompt_dismiss_days: number
          prompt_max_shows: number
          prompts_enabled: boolean
          recommendation_retention_days: number
          recommendations_audience: string
          recommendations_email_enabled: boolean
          recommendations_enabled: boolean
          recommendations_shadow_mode: boolean
          search_audience: string
          search_log_retention_days: number
          search_logging_enabled: boolean
          search_v2_enabled: boolean
          similar_default_radius_km: number
          updated_at: string
          updated_by: string | null
          weekly_push_cap: number
        }
        Insert: {
          beta_user_ids?: string[]
          candidate_ttl_days?: number
          daily_push_cap?: number
          digest_hour_local?: number
          generate_watermark?: string
          id?: number
          ignore_pause_after?: number
          ignore_pause_days?: number
          organizer_cooldown_hours?: number
          organizer_search_enabled?: boolean
          place_search_enabled?: boolean
          prompt_cooldown_days?: number
          prompt_dismiss_days?: number
          prompt_max_shows?: number
          prompts_enabled?: boolean
          recommendation_retention_days?: number
          recommendations_audience?: string
          recommendations_email_enabled?: boolean
          recommendations_enabled?: boolean
          recommendations_shadow_mode?: boolean
          search_audience?: string
          search_log_retention_days?: number
          search_logging_enabled?: boolean
          search_v2_enabled?: boolean
          similar_default_radius_km?: number
          updated_at?: string
          updated_by?: string | null
          weekly_push_cap?: number
        }
        Update: {
          beta_user_ids?: string[]
          candidate_ttl_days?: number
          daily_push_cap?: number
          digest_hour_local?: number
          generate_watermark?: string
          id?: number
          ignore_pause_after?: number
          ignore_pause_days?: number
          organizer_cooldown_hours?: number
          organizer_search_enabled?: boolean
          place_search_enabled?: boolean
          prompt_cooldown_days?: number
          prompt_dismiss_days?: number
          prompt_max_shows?: number
          prompts_enabled?: boolean
          recommendation_retention_days?: number
          recommendations_audience?: string
          recommendations_email_enabled?: boolean
          recommendations_enabled?: boolean
          recommendations_shadow_mode?: boolean
          search_audience?: string
          search_log_retention_days?: number
          search_logging_enabled?: boolean
          search_v2_enabled?: boolean
          similar_default_radius_km?: number
          updated_at?: string
          updated_by?: string | null
          weekly_push_cap?: number
        }
        Relationships: []
      }
      draft_asset_cleanup_queue: {
        Row: {
          attempts: number
          claimed_at: string | null
          detail: string | null
          finished_at: string | null
          id: number
          public_id: string
          queued_at: string
          resource_type: string
          status: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          detail?: string | null
          finished_at?: string | null
          id?: never
          public_id: string
          queued_at?: string
          resource_type?: string
          status?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          detail?: string | null
          finished_at?: string | null
          id?: never
          public_id?: string
          queued_at?: string
          resource_type?: string
          status?: string
        }
        Relationships: []
      }
      drafts: {
        Row: {
          created_at: string
          draft_type: string
          expires_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_type: string
          expires_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          draft_type?: string
          expires_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event: {
        Row: {
          address: Json
          archived_at: string | null
          capacity: number | null
          client_request_id: string | null
          country_code: string
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          event_category: string
          event_code: string
          event_type: string | null
          featured: boolean
          flyer_public_id: string
          flyer_version: string
          id: string
          location: unknown
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          organizer_id: string
          place_id: string | null
          published_at: string | null
          require_registration: boolean
          search_tsv: unknown
          slug: string
          starts_at: string | null
          status: string
          timezone: string
          title: string
          website_url: string | null
        }
        Insert: {
          address: Json
          archived_at?: string | null
          capacity?: number | null
          client_request_id?: string | null
          country_code: string
          created_at?: string
          currency: string
          description: string
          ends_at?: string | null
          event_category: string
          event_code: string
          event_type?: string | null
          featured?: boolean
          flyer_public_id: string
          flyer_version: string
          id?: string
          location: unknown
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          organizer_id: string
          place_id?: string | null
          published_at?: string | null
          require_registration?: boolean
          search_tsv?: unknown
          slug: string
          starts_at?: string | null
          status?: string
          timezone: string
          title: string
          website_url?: string | null
        }
        Update: {
          address?: Json
          archived_at?: string | null
          capacity?: number | null
          client_request_id?: string | null
          country_code?: string
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          event_category?: string
          event_code?: string
          event_type?: string | null
          featured?: boolean
          flyer_public_id?: string
          flyer_version?: string
          id?: string
          location?: unknown
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          organizer_id?: string
          place_id?: string | null
          published_at?: string | null
          require_registration?: boolean
          search_tsv?: unknown
          slug?: string
          starts_at?: string | null
          status?: string
          timezone?: string
          title?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "event_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      event_drafts: {
        Row: {
          draft_id: string
          flyer_public_id: string | null
          flyer_version: string | null
          payload: Json
        }
        Insert: {
          draft_id: string
          flyer_public_id?: string | null
          flyer_version?: string | null
          payload?: Json
        }
        Update: {
          draft_id?: string
          flyer_public_id?: string | null
          flyer_version?: string | null
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "event_drafts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_media: {
        Row: {
          created_at: string
          duration: number | null
          event_id: string
          format: string | null
          height: number | null
          media_type: string
          public_id: string
          version: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          event_id: string
          format?: string | null
          height?: number | null
          media_type: string
          public_id: string
          version: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          event_id?: string
          format?: string | null
          height?: number | null
          media_type?: string
          public_id?: string
          version?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
        ]
      }
      event_media_p0: {
        Row: {
          created_at: string
          duration: number | null
          event_id: string
          format: string | null
          height: number | null
          media_type: string
          public_id: string
          version: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          event_id: string
          format?: string | null
          height?: number | null
          media_type: string
          public_id: string
          version: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          event_id?: string
          format?: string | null
          height?: number | null
          media_type?: string
          public_id?: string
          version?: string
          width?: number | null
        }
        Relationships: []
      }
      event_media_p1: {
        Row: {
          created_at: string
          duration: number | null
          event_id: string
          format: string | null
          height: number | null
          media_type: string
          public_id: string
          version: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          event_id: string
          format?: string | null
          height?: number | null
          media_type: string
          public_id: string
          version: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          event_id?: string
          format?: string | null
          height?: number | null
          media_type?: string
          public_id?: string
          version?: string
          width?: number | null
        }
        Relationships: []
      }
      event_media_p2: {
        Row: {
          created_at: string
          duration: number | null
          event_id: string
          format: string | null
          height: number | null
          media_type: string
          public_id: string
          version: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          event_id: string
          format?: string | null
          height?: number | null
          media_type: string
          public_id: string
          version: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          event_id?: string
          format?: string | null
          height?: number | null
          media_type?: string
          public_id?: string
          version?: string
          width?: number | null
        }
        Relationships: []
      }
      event_media_p3: {
        Row: {
          created_at: string
          duration: number | null
          event_id: string
          format: string | null
          height: number | null
          media_type: string
          public_id: string
          version: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          event_id: string
          format?: string | null
          height?: number | null
          media_type: string
          public_id: string
          version: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          event_id?: string
          format?: string | null
          height?: number | null
          media_type?: string
          public_id?: string
          version?: string
          width?: number | null
        }
        Relationships: []
      }
      event_occurrence: {
        Row: {
          ends_at: string
          event_id: string
          id: string
          starts_at: string
        }
        Insert: {
          ends_at: string
          event_id: string
          id?: string
          starts_at: string
        }
        Update: {
          ends_at?: string
          event_id?: string
          id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrence_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
        ]
      }
      event_promoter_commission: {
        Row: {
          created_at: string
          event_id: string
          is_active: boolean
          rate_bps: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          is_active?: boolean
          rate_bps: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          is_active?: boolean
          rate_bps?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_promoter_commission_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promoter_commission_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promoter_commission_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_promotion: {
        Row: {
          created_at: string
          ends_at: string
          event_id: string
          id: string
          promotion_checkout_id: string
          starts_at: string
          tier_id: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          event_id: string
          id?: string
          promotion_checkout_id: string
          starts_at?: string
          tier_id: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          event_id?: string
          id?: string
          promotion_checkout_id?: string
          starts_at?: string
          tier_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_promotion_checkout_id_fkey"
            columns: ["promotion_checkout_id"]
            isOneToOne: true
            referencedRelation: "event_promotion_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promotion_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promotion_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_promotion_tier"
            referencedColumns: ["id"]
          },
        ]
      }
      event_promotion_checkout: {
        Row: {
          completed_at: string | null
          created_at: string
          currency: string
          event_id: string
          expires_at: string | null
          id: string
          owner_id: string
          status: string
          tier_id: number
          total_price: number
          unit_price: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          currency: string
          event_id: string
          expires_at?: string | null
          id?: string
          owner_id: string
          status?: string
          tier_id: number
          total_price: number
          unit_price: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          owner_id?: string
          status?: string
          tier_id?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_promotion_checkout_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promotion_checkout_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promotion_checkout_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_promotion_checkout_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_promotion_tier"
            referencedColumns: ["id"]
          },
        ]
      }
      event_promotion_tier: {
        Row: {
          country_code: string
          currency: string
          duration: string
          duration_label: string
          id: number
          is_active: boolean
          price: number
        }
        Insert: {
          country_code: string
          currency: string
          duration: string
          duration_label: string
          id: number
          is_active?: boolean
          price: number
        }
        Update: {
          country_code?: string
          currency?: string
          duration?: string
          duration_label?: string
          id?: number
          is_active?: boolean
          price?: number
        }
        Relationships: []
      }
      event_reminder: {
        Row: {
          created_at: string
          event_id: string
          offsets: number[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          offsets?: number[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          offsets?: number[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminder_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminder_sent: {
        Row: {
          event_id: string
          kind: string
          sent_at: string
          session_starts_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          kind: string
          sent_at?: string
          session_starts_at: string
          user_id: string
        }
        Update: {
          event_id?: string
          kind?: string
          sent_at?: string
          session_starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminder_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminder_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminder_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_review: {
        Row: {
          comment: string | null
          created_at: string
          edited_at: string | null
          event_id: string
          helpful_count: number
          id: string
          is_verified_attendee: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          organizer_response: string | null
          organizer_response_at: string | null
          rating: number
          reviewer_id: string
          status: string
          title: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          edited_at?: string | null
          event_id: string
          helpful_count?: number
          id?: string
          is_verified_attendee?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          organizer_response?: string | null
          organizer_response_at?: string | null
          rating: number
          reviewer_id: string
          status?: string
          title?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          edited_at?: string | null
          event_id?: string
          helpful_count?: number
          id?: string
          is_verified_attendee?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          organizer_response?: string | null
          organizer_response_at?: string | null
          rating?: number
          reviewer_id?: string
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_review_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_review_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_review_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_review_helpful: {
        Row: {
          created_at: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_review_helpful_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "event_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_review_helpful_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_review_helpful_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_review_photo: {
        Row: {
          created_at: string
          event_review_id: string
          id: string
          position: number
          public_id: string
          version: string
        }
        Insert: {
          created_at?: string
          event_review_id: string
          id?: string
          position?: number
          public_id: string
          version: string
        }
        Update: {
          created_at?: string
          event_review_id?: string
          id?: string
          position?: number
          public_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_review_photo_review_id_fkey"
            columns: ["event_review_id"]
            isOneToOne: false
            referencedRelation: "event_review"
            referencedColumns: ["id"]
          },
        ]
      }
      event_share: {
        Row: {
          channel: string | null
          event_id: string
          id: string
          referral_code: string | null
          shared_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          event_id: string
          id?: string
          referral_code?: string | null
          shared_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          event_id?: string
          id?: string
          referral_code?: string | null
          shared_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_share_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_share_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_share_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_share_default: {
        Row: {
          channel: string | null
          event_id: string
          id: string
          referral_code: string | null
          shared_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          event_id: string
          id?: string
          referral_code?: string | null
          shared_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          event_id?: string
          id?: string
          referral_code?: string | null
          shared_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exchange_rate: {
        Row: {
          base: string
          fetched_at: string
          published_at: string
          quote: string
          rate: number
          source: string
        }
        Insert: {
          base: string
          fetched_at?: string
          published_at: string
          quote: string
          rate: number
          source: string
        }
        Update: {
          base?: string
          fetched_at?: string
          published_at?: string
          quote?: string
          rate?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rate_base_fkey"
            columns: ["base"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exchange_rate_quote_fkey"
            columns: ["quote"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
        ]
      }
      exchange_rate_config: {
        Row: {
          app_id_env: string
          base: string
          id: boolean
          last_error: string | null
          last_refreshed_at: string | null
          provider: string
          refresh_every: string
          refresh_url: string | null
          token: string
          updated_at: string
        }
        Insert: {
          app_id_env?: string
          base?: string
          id?: boolean
          last_error?: string | null
          last_refreshed_at?: string | null
          provider?: string
          refresh_every?: string
          refresh_url?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          app_id_env?: string
          base?: string
          id?: boolean
          last_error?: string | null
          last_refreshed_at?: string | null
          provider?: string
          refresh_every?: string
          refresh_url?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rate_config_base_fkey"
            columns: ["base"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
        ]
      }
      favorite: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      favorite_p1: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_p2: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_p3: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_p4: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_place: {
        Row: {
          created_at: string
          id: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_place_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_place_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_place_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      feature_flag: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          key: string
          rules: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          key: string
          rules?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          key?: string
          rules?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fieldops_assignment: {
        Row: {
          assigned_by: string | null
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          ends_on: string
          id: string
          member_id: string
          member_user_id: string
          mode: string
          notes: string | null
          start_accuracy_m: number | null
          start_distance_m: number | null
          start_lat: number | null
          start_lng: number | null
          start_location: unknown
          started_at: string | null
          starts_on: string
          status: string
          team_id: string
          territory_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          ends_on: string
          id?: string
          member_id: string
          member_user_id: string
          mode: string
          notes?: string | null
          start_accuracy_m?: number | null
          start_distance_m?: number | null
          start_lat?: number | null
          start_lng?: number | null
          start_location?: unknown
          started_at?: string | null
          starts_on: string
          status?: string
          team_id: string
          territory_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          ends_on?: string
          id?: string
          member_id?: string
          member_user_id?: string
          mode?: string
          notes?: string | null
          start_accuracy_m?: number | null
          start_distance_m?: number | null
          start_lat?: number | null
          start_lng?: number | null
          start_location?: unknown
          started_at?: string | null
          starts_on?: string
          status?: string
          team_id?: string
          territory_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_assignment_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_assignment_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_assignment_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_assignment_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "fieldops_territory"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_campaign: {
        Row: {
          activated_at: string | null
          archived_at: string | null
          budget_cap_minor: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          ends_on: string | null
          holding_days_override: number | null
          id: string
          name: string
          region_id: string
          slug: string
          starts_on: string | null
          status: string
          status_changed_at: string
          status_changed_by: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          archived_at?: string | null
          budget_cap_minor?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          ends_on?: string | null
          holding_days_override?: number | null
          id?: string
          name: string
          region_id: string
          slug: string
          starts_on?: string | null
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          archived_at?: string | null
          budget_cap_minor?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          ends_on?: string | null
          holding_days_override?: number | null
          id?: string
          name?: string
          region_id?: string
          slug?: string
          starts_on?: string | null
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_campaign_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "fieldops_region"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_commission: {
        Row: {
          activity_key: string
          amount_minor: number
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          content_submission_id: string | null
          created_at: string
          currency: string
          earned_at: string
          id: string
          idempotency_key: string
          member_id: string
          member_user_id: string
          onboarding_id: string | null
          paid_at: string | null
          payout_item_id: string | null
          period_start: string | null
          rejected_at: string | null
          rejection_reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          reverses_commission_id: string | null
          rule_id: string | null
          rule_version: number | null
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          activity_key: string
          amount_minor: number
          approved_at?: string | null
          approved_by?: string | null
          campaign_id: string
          content_submission_id?: string | null
          created_at?: string
          currency?: string
          earned_at?: string
          id?: string
          idempotency_key: string
          member_id: string
          member_user_id: string
          onboarding_id?: string | null
          paid_at?: string | null
          payout_item_id?: string | null
          period_start?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reverses_commission_id?: string | null
          rule_id?: string | null
          rule_version?: number | null
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          activity_key?: string
          amount_minor?: number
          approved_at?: string | null
          approved_by?: string | null
          campaign_id?: string
          content_submission_id?: string | null
          created_at?: string
          currency?: string
          earned_at?: string
          id?: string
          idempotency_key?: string
          member_id?: string
          member_user_id?: string
          onboarding_id?: string | null
          paid_at?: string | null
          payout_item_id?: string | null
          period_start?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          reverses_commission_id?: string | null
          rule_id?: string | null
          rule_version?: number | null
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_commission_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_commission_content_submission_fkey"
            columns: ["content_submission_id"]
            isOneToOne: false
            referencedRelation: "fieldops_content_submission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_commission_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_commission_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "fieldops_onboarding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_commission_payout_item_fkey"
            columns: ["payout_item_id"]
            isOneToOne: false
            referencedRelation: "fieldops_payout_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_commission_reverses_commission_id_fkey"
            columns: ["reverses_commission_id"]
            isOneToOne: false
            referencedRelation: "fieldops_commission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_commission_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "fieldops_commission_rule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_commission_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_commission_event: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          commission_id: string
          created_at: string
          details: Json
          from_status: string | null
          id: number
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          commission_id: string
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: never
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          commission_id?: string
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: never
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_commission_event_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "fieldops_commission"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_commission_rule: {
        Row: {
          activity_key: string
          amount_minor: number
          campaign_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          eligibility: Json
          id: string
          is_active: boolean
          note: string | null
          version: number
        }
        Insert: {
          activity_key: string
          amount_minor: number
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          eligibility?: Json
          id?: string
          is_active?: boolean
          note?: string | null
          version: number
        }
        Update: {
          activity_key?: string
          amount_minor?: number
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          eligibility?: Json
          id?: string
          is_active?: boolean
          note?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_commission_rule_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_content_brief: {
        Row: {
          assigned_member_id: string | null
          campaign_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_on: string | null
          id: string
          platforms: string[]
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_member_id?: string | null
          campaign_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          platforms?: string[]
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_member_id?: string | null
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          platforms?: string[]
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_content_brief_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_content_brief_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_content_submission: {
        Row: {
          brief_id: string | null
          campaign_id: string
          caption: string | null
          created_at: string
          holding_until: string | null
          id: string
          member_id: string
          member_user_id: string
          platform: string
          posted_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          self_reported_metrics: Json
          status: string
          team_id: string
          updated_at: string
          url: string
        }
        Insert: {
          brief_id?: string | null
          campaign_id: string
          caption?: string | null
          created_at?: string
          holding_until?: string | null
          id?: string
          member_id: string
          member_user_id: string
          platform: string
          posted_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          self_reported_metrics?: Json
          status?: string
          team_id: string
          updated_at?: string
          url: string
        }
        Update: {
          brief_id?: string | null
          campaign_id?: string
          caption?: string | null
          created_at?: string
          holding_until?: string | null
          id?: string
          member_id?: string
          member_user_id?: string
          platform?: string
          posted_at?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          self_reported_metrics?: Json
          status?: string
          team_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_content_submission_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "fieldops_content_brief"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_content_submission_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_content_submission_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_content_submission_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "fieldops_commission_rule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_content_submission_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_job_run: {
        Row: {
          details: Json
          failed: number
          finished_at: string | null
          flagged: number
          id: number
          job: string
          last_error: string | null
          processed: number
          rejected: number
          started_at: string
          succeeded: number
        }
        Insert: {
          details?: Json
          failed?: number
          finished_at?: string | null
          flagged?: number
          id?: never
          job: string
          last_error?: string | null
          processed?: number
          rejected?: number
          started_at?: string
          succeeded?: number
        }
        Update: {
          details?: Json
          failed?: number
          finished_at?: string | null
          flagged?: number
          id?: never
          job?: string
          last_error?: string | null
          processed?: number
          rejected?: number
          started_at?: string
          succeeded?: number
        }
        Relationships: []
      }
      fieldops_onboarding: {
        Row: {
          activity_key: string | null
          assignment_id: string | null
          business_name: string | null
          business_phone_e164: string | null
          business_whatsapp_e164: string | null
          campaign_id: string
          claim_request_id: string | null
          client_request_id: string
          created_at: string
          duplicate_acknowledged: boolean
          entity_created_at: string | null
          event_id: string | null
          flag_details: Json
          flags: string[]
          holding_until: string | null
          id: string
          inside_territory: boolean | null
          kind: string
          member_id: string
          member_user_id: string
          mode: string
          overridden_at: string | null
          overridden_by: string | null
          override_note: string | null
          owner_duplicate_waived_at: string | null
          owner_duplicate_waived_by: string | null
          owner_full_name: string | null
          owner_is_new_account: boolean | null
          owner_phone_e164: string | null
          owner_phone_verified_at: string | null
          owner_prior_events: number
          owner_prior_places: number
          owner_user_id: string | null
          place_id: string | null
          prospect_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          resubmission_count: number
          review_decision: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          similar_matches: Json
          status: string
          submission_accuracy_m: number | null
          submission_distance_m: number | null
          submission_lat: number | null
          submission_lng: number | null
          submission_location: unknown
          submitted_at: string | null
          succeeded_at: string | null
          team_id: string
          territory_id: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          activity_key?: string | null
          assignment_id?: string | null
          business_name?: string | null
          business_phone_e164?: string | null
          business_whatsapp_e164?: string | null
          campaign_id: string
          claim_request_id?: string | null
          client_request_id?: string
          created_at?: string
          duplicate_acknowledged?: boolean
          entity_created_at?: string | null
          event_id?: string | null
          flag_details?: Json
          flags?: string[]
          holding_until?: string | null
          id?: string
          inside_territory?: boolean | null
          kind?: string
          member_id: string
          member_user_id: string
          mode: string
          overridden_at?: string | null
          overridden_by?: string | null
          override_note?: string | null
          owner_duplicate_waived_at?: string | null
          owner_duplicate_waived_by?: string | null
          owner_full_name?: string | null
          owner_is_new_account?: boolean | null
          owner_phone_e164?: string | null
          owner_phone_verified_at?: string | null
          owner_prior_events?: number
          owner_prior_places?: number
          owner_user_id?: string | null
          place_id?: string | null
          prospect_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          resubmission_count?: number
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          similar_matches?: Json
          status?: string
          submission_accuracy_m?: number | null
          submission_distance_m?: number | null
          submission_lat?: number | null
          submission_lng?: number | null
          submission_location?: unknown
          submitted_at?: string | null
          succeeded_at?: string | null
          team_id: string
          territory_id?: string | null
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          activity_key?: string | null
          assignment_id?: string | null
          business_name?: string | null
          business_phone_e164?: string | null
          business_whatsapp_e164?: string | null
          campaign_id?: string
          claim_request_id?: string | null
          client_request_id?: string
          created_at?: string
          duplicate_acknowledged?: boolean
          entity_created_at?: string | null
          event_id?: string | null
          flag_details?: Json
          flags?: string[]
          holding_until?: string | null
          id?: string
          inside_territory?: boolean | null
          kind?: string
          member_id?: string
          member_user_id?: string
          mode?: string
          overridden_at?: string | null
          overridden_by?: string | null
          override_note?: string | null
          owner_duplicate_waived_at?: string | null
          owner_duplicate_waived_by?: string | null
          owner_full_name?: string | null
          owner_is_new_account?: boolean | null
          owner_phone_e164?: string | null
          owner_phone_verified_at?: string | null
          owner_prior_events?: number
          owner_prior_places?: number
          owner_user_id?: string | null
          place_id?: string | null
          prospect_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          resubmission_count?: number
          review_decision?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          similar_matches?: Json
          status?: string
          submission_accuracy_m?: number | null
          submission_distance_m?: number | null
          submission_lat?: number | null
          submission_lng?: number | null
          submission_location?: unknown
          submitted_at?: string | null
          succeeded_at?: string | null
          team_id?: string
          territory_id?: string | null
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_onboarding_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "fieldops_assignment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_claim_request_id_fkey"
            columns: ["claim_request_id"]
            isOneToOne: false
            referencedRelation: "place_claim_request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "fieldops_prospect"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "fieldops_commission_rule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_onboarding_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "fieldops_territory"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_onboarding_event: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          details: Json
          from_status: string | null
          id: number
          note: string | null
          onboarding_id: string
          to_status: string
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: never
          note?: string | null
          onboarding_id: string
          to_status: string
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: never
          note?: string | null
          onboarding_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_onboarding_event_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "fieldops_onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_onboarding_evidence: {
        Row: {
          accuracy_m: number | null
          captured_at: string | null
          captured_lat: number | null
          captured_lng: number | null
          captured_location: unknown
          created_at: string
          id: string
          kind: string
          mime_type: string | null
          onboarding_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_at: string | null
          uploaded_by: string
        }
        Insert: {
          accuracy_m?: number | null
          captured_at?: string | null
          captured_lat?: number | null
          captured_lng?: number | null
          captured_location?: unknown
          created_at?: string
          id?: string
          kind: string
          mime_type?: string | null
          onboarding_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string | null
          uploaded_by: string
        }
        Update: {
          accuracy_m?: number | null
          captured_at?: string | null
          captured_lat?: number | null
          captured_lng?: number | null
          captured_location?: unknown
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string | null
          onboarding_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_onboarding_evidence_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "fieldops_onboarding"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_payout_batch: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          item_count: number
          label: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string
          status: string
          total_minor: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          item_count?: number
          label: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string
          status?: string
          total_minor?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          item_count?: number
          label?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string
          status?: string
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_payout_batch_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_payout_item: {
        Row: {
          amount_minor: number
          batch_id: string
          campaign_id: string
          commission_count: number
          created_at: string
          currency: string
          destination_snapshot: Json
          failure_reason: string | null
          id: string
          member_id: string
          member_user_id: string
          paid_at: string | null
          paid_by: string | null
          payment_reference: string | null
          status: string
          transfer_code: string | null
          updated_at: string
        }
        Insert: {
          amount_minor: number
          batch_id: string
          campaign_id: string
          commission_count?: number
          created_at?: string
          currency?: string
          destination_snapshot?: Json
          failure_reason?: string | null
          id?: string
          member_id: string
          member_user_id: string
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          status?: string
          transfer_code?: string | null
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          batch_id?: string
          campaign_id?: string
          commission_count?: number
          created_at?: string
          currency?: string
          destination_snapshot?: Json
          failure_reason?: string | null
          id?: string
          member_id?: string
          member_user_id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          status?: string
          transfer_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_payout_item_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "fieldops_payout_batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_payout_item_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_payout_item_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team_member"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_program_setting: {
        Row: {
          commission_generation_enabled: boolean
          daily_submission_cap: number
          default_holding_days: number
          duplicate_name_similarity: number
          duplicate_radius_m: number
          evidence_retention_days: number
          id: number
          notify_push_enabled: boolean
          offline_max_distance_m: number
          payouts_enabled: boolean
          program_enabled: boolean
          require_member_phone_verified: boolean
          review_grace_days: number
          spot_check_bps: number
          updated_at: string
          updated_by: string | null
          worker_ui_enabled: boolean
        }
        Insert: {
          commission_generation_enabled?: boolean
          daily_submission_cap?: number
          default_holding_days?: number
          duplicate_name_similarity?: number
          duplicate_radius_m?: number
          evidence_retention_days?: number
          id?: number
          notify_push_enabled?: boolean
          offline_max_distance_m?: number
          payouts_enabled?: boolean
          program_enabled?: boolean
          require_member_phone_verified?: boolean
          review_grace_days?: number
          spot_check_bps?: number
          updated_at?: string
          updated_by?: string | null
          worker_ui_enabled?: boolean
        }
        Update: {
          commission_generation_enabled?: boolean
          daily_submission_cap?: number
          default_holding_days?: number
          duplicate_name_similarity?: number
          duplicate_radius_m?: number
          evidence_retention_days?: number
          id?: number
          notify_push_enabled?: boolean
          offline_max_distance_m?: number
          payouts_enabled?: boolean
          program_enabled?: boolean
          require_member_phone_verified?: boolean
          review_grace_days?: number
          spot_check_bps?: number
          updated_at?: string
          updated_by?: string | null
          worker_ui_enabled?: boolean
        }
        Relationships: []
      }
      fieldops_prospect: {
        Row: {
          campaign_id: string
          contact_attempts: Json
          contact_channel: string | null
          contact_name: string | null
          contact_phone_e164: string | null
          created_at: string
          id: string
          kind: string
          matched_place_id: string | null
          member_id: string
          member_user_id: string
          name: string
          notes: string | null
          onboarding_id: string | null
          status: string
          team_id: string
          territory_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          contact_attempts?: Json
          contact_channel?: string | null
          contact_name?: string | null
          contact_phone_e164?: string | null
          created_at?: string
          id?: string
          kind: string
          matched_place_id?: string | null
          member_id: string
          member_user_id: string
          name: string
          notes?: string | null
          onboarding_id?: string | null
          status?: string
          team_id: string
          territory_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          contact_attempts?: Json
          contact_channel?: string | null
          contact_name?: string | null
          contact_phone_e164?: string | null
          created_at?: string
          id?: string
          kind?: string
          matched_place_id?: string | null
          member_id?: string
          member_user_id?: string
          name?: string
          notes?: string | null
          onboarding_id?: string | null
          status?: string
          team_id?: string
          territory_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_prospect_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_prospect_matched_place_id_fkey"
            columns: ["matched_place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_prospect_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team_member"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_prospect_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "fieldops_onboarding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_prospect_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_prospect_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "fieldops_territory"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_region: {
        Row: {
          admin_code: string | null
          centre: unknown
          centre_lat: number | null
          centre_lng: number | null
          country_code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_code?: string | null
          centre?: unknown
          centre_lat?: number | null
          centre_lng?: number | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_code?: string | null
          centre?: unknown
          centre_lat?: number | null
          centre_lng?: number | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fieldops_team: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_team_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_team_member: {
        Row: {
          added_by: string | null
          campaign_id: string
          created_at: string
          full_name_snapshot: string | null
          id: string
          invited_phone_e164: string | null
          joined_at: string | null
          left_at: string | null
          payout_holder_name: string | null
          payout_momo_network: string | null
          payout_momo_number: string | null
          payout_updated_at: string | null
          role: string
          status: string
          suspended_reason: string | null
          team_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          added_by?: string | null
          campaign_id: string
          created_at?: string
          full_name_snapshot?: string | null
          id?: string
          invited_phone_e164?: string | null
          joined_at?: string | null
          left_at?: string | null
          payout_holder_name?: string | null
          payout_momo_network?: string | null
          payout_momo_number?: string | null
          payout_updated_at?: string | null
          role: string
          status?: string
          suspended_reason?: string | null
          team_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          added_by?: string | null
          campaign_id?: string
          created_at?: string
          full_name_snapshot?: string | null
          id?: string
          invited_phone_e164?: string | null
          joined_at?: string | null
          left_at?: string | null
          payout_holder_name?: string | null
          payout_momo_network?: string | null
          payout_momo_number?: string | null
          payout_updated_at?: string | null
          role?: string
          status?: string
          suspended_reason?: string | null
          team_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_team_member_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fieldops_campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_team_member_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "fieldops_team"
            referencedColumns: ["id"]
          },
        ]
      }
      fieldops_territory: {
        Row: {
          boundary: unknown
          boundary_geojson: Json | null
          centre: unknown
          centre_lat: number | null
          centre_lng: number | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          parent_territory_id: string | null
          priority: number
          radius_m: number
          region_id: string
          status: string
          updated_at: string
        }
        Insert: {
          boundary?: unknown
          boundary_geojson?: Json | null
          centre: unknown
          centre_lat?: number | null
          centre_lng?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
          notes?: string | null
          parent_territory_id?: string | null
          priority?: number
          radius_m?: number
          region_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          boundary?: unknown
          boundary_geojson?: Json | null
          centre?: unknown
          centre_lat?: number | null
          centre_lng?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          parent_territory_id?: string | null
          priority?: number
          radius_m?: number
          region_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fieldops_territory_parent_territory_id_fkey"
            columns: ["parent_territory_id"]
            isOneToOne: false
            referencedRelation: "fieldops_territory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fieldops_territory_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "fieldops_region"
            referencedColumns: ["id"]
          },
        ]
      }
      follow: {
        Row: {
          created_at: string
          follower_id: string
          id: string
          target_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          id?: string
          target_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          id?: string
          target_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      follow_count: {
        Row: {
          follower_count: number
          target_id: string
          target_kind: string
          updated_at: string
        }
        Insert: {
          follower_count?: number
          target_id: string
          target_kind: string
          updated_at?: string
        }
        Update: {
          follower_count?: number
          target_id?: string
          target_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      geocode_cache: {
        Row: {
          created_at: string
          found: boolean
          lat: number | null
          lng: number | null
          query_key: string
        }
        Insert: {
          created_at?: string
          found: boolean
          lat?: number | null
          lng?: number | null
          query_key: string
        }
        Update: {
          created_at?: string
          found?: boolean
          lat?: number | null
          lng?: number | null
          query_key?: string
        }
        Relationships: []
      }
      health_check_result: {
        Row: {
          check_key: string
          checked_at: string
          detail: Json | null
          id: string
          latency_ms: number | null
          ok: boolean
        }
        Insert: {
          check_key: string
          checked_at?: string
          detail?: Json | null
          id?: string
          latency_ms?: number | null
          ok: boolean
        }
        Update: {
          check_key?: string
          checked_at?: string
          detail?: Json | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
        }
        Relationships: []
      }
      highlight: {
        Row: {
          content: string | null
          created_at: string
          group_id: string
          id: string
          media_duration: number | null
          media_type: string
          media_url: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          playback_url: string | null
          public_id: string | null
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          group_id: string
          id?: string
          media_duration?: number | null
          media_type: string
          media_url?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          playback_url?: string | null
          public_id?: string | null
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          group_id?: string
          id?: string
          media_duration?: number | null
          media_type?: string
          media_url?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          playback_url?: string | null
          public_id?: string | null
          thumbnail_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlight_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlight_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      incident: {
        Row: {
          component: string | null
          created_by: string | null
          id: string
          resolved_at: string | null
          severity: string
          started_at: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          component?: string | null
          created_by?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          component?: string | null
          created_by?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      market: {
        Row: {
          address_schema: Json | null
          centre_lat: number | null
          centre_lng: number | null
          country_code: string
          created_at: string
          default_currency: string
          default_locale: string
          default_timezone: string
          dial_code: string
          display_config: Json
          distance_unit: string
          fee_config: Json
          is_default: boolean
          launched_at: string | null
          legal_config: Json
          name: string
          otp_provider: string | null
          status: string
          supported_currencies: string[]
          supported_locales: string[]
          tax_config: Json
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          address_schema?: Json | null
          centre_lat?: number | null
          centre_lng?: number | null
          country_code: string
          created_at?: string
          default_currency: string
          default_locale: string
          default_timezone: string
          dial_code: string
          display_config?: Json
          distance_unit?: string
          fee_config?: Json
          is_default?: boolean
          launched_at?: string | null
          legal_config?: Json
          name: string
          otp_provider?: string | null
          status?: string
          supported_currencies?: string[]
          supported_locales?: string[]
          tax_config?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          address_schema?: Json | null
          centre_lat?: number | null
          centre_lng?: number | null
          country_code?: string
          created_at?: string
          default_currency?: string
          default_locale?: string
          default_timezone?: string
          dial_code?: string
          display_config?: Json
          distance_unit?: string
          fee_config?: Json
          is_default?: boolean
          launched_at?: string | null
          legal_config?: Json
          name?: string
          otp_provider?: string | null
          status?: string
          supported_currencies?: string[]
          supported_locales?: string[]
          tax_config?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
        ]
      }
      market_event: {
        Row: {
          action: string
          actor_id: string | null
          country_code: string
          created_at: string
          details: Json
          from_status: string | null
          id: string
          reason: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          country_code: string
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          country_code?: string
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_event_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "market"
            referencedColumns: ["country_code"]
          },
        ]
      }
      market_payment_method: {
        Row: {
          country_code: string
          created_at: string
          currencies: string[]
          enabled: boolean
          id: string
          label: string | null
          method: string
          platforms: string[]
          provider: string
          provider_channels: string[]
          recommended: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          currencies?: string[]
          enabled?: boolean
          id?: string
          label?: string | null
          method: string
          platforms?: string[]
          provider: string
          provider_channels?: string[]
          recommended?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          currencies?: string[]
          enabled?: boolean
          id?: string
          label?: string | null
          method?: string
          platforms?: string[]
          provider?: string
          provider_channels?: string[]
          recommended?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_payment_method_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "market"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "market_payment_method_country_code_provider_fkey"
            columns: ["country_code", "provider"]
            isOneToOne: false
            referencedRelation: "market_payment_provider"
            referencedColumns: ["country_code", "provider"]
          },
        ]
      }
      market_payment_provider: {
        Row: {
          country_code: string
          created_at: string
          currencies: string[]
          enabled: boolean
          options: Json
          payouts_enabled: boolean
          priority: number
          provider: string
          provider_account_ref: string | null
          public_key_env: string | null
          secret_key_env: string
          settlement_currency: string
          updated_at: string
          webhook_secret_env: string
        }
        Insert: {
          country_code: string
          created_at?: string
          currencies?: string[]
          enabled?: boolean
          options?: Json
          payouts_enabled?: boolean
          priority?: number
          provider: string
          provider_account_ref?: string | null
          public_key_env?: string | null
          secret_key_env: string
          settlement_currency: string
          updated_at?: string
          webhook_secret_env: string
        }
        Update: {
          country_code?: string
          created_at?: string
          currencies?: string[]
          enabled?: boolean
          options?: Json
          payouts_enabled?: boolean
          priority?: number
          provider?: string
          provider_account_ref?: string | null
          public_key_env?: string | null
          secret_key_env?: string
          settlement_currency?: string
          updated_at?: string
          webhook_secret_env?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_payment_provider_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "market"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "market_payment_provider_settlement_currency_fkey"
            columns: ["settlement_currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
        ]
      }
      market_payout_method: {
        Row: {
          automated: boolean
          country_code: string
          created_at: string
          currency: string
          enabled: boolean
          fields: Json
          id: string
          label: string | null
          method: string
          provider: string | null
          updated_at: string
        }
        Insert: {
          automated?: boolean
          country_code: string
          created_at?: string
          currency: string
          enabled?: boolean
          fields?: Json
          id?: string
          label?: string | null
          method: string
          provider?: string | null
          updated_at?: string
        }
        Update: {
          automated?: boolean
          country_code?: string
          created_at?: string
          currency?: string
          enabled?: boolean
          fields?: Json
          id?: string
          label?: string | null
          method?: string
          provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_payout_method_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "market"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "market_payout_method_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
        ]
      }
      market_readiness_run: {
        Row: {
          can_activate: boolean
          country_code: string
          id: string
          ran_at: string
          ran_by: string | null
          report: Json
        }
        Insert: {
          can_activate: boolean
          country_code: string
          id?: string
          ran_at?: string
          ran_by?: string | null
          report: Json
        }
        Update: {
          can_activate?: boolean
          country_code?: string
          id?: string
          ran_at?: string
          ran_by?: string | null
          report?: Json
        }
        Relationships: [
          {
            foreignKeyName: "market_readiness_run_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "market"
            referencedColumns: ["country_code"]
          },
        ]
      }
      market_region: {
        Row: {
          centre_lat: number
          centre_lng: number
          country_code: string
          created_at: string
          id: string
          kind: string
          name: string
          position: number
          radius_km: number
          slug: string
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          centre_lat: number
          centre_lng: number
          country_code: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          position?: number
          radius_km?: number
          slug: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          centre_lat?: number
          centre_lng?: number
          country_code?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          radius_km?: number
          slug?: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_region_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "market"
            referencedColumns: ["country_code"]
          },
        ]
      }
      media_audit: {
        Row: {
          action: string
          performed_at: string
          public_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          performed_at?: string
          public_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          performed_at?: string
          public_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_audit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_audit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      media_audit_default: {
        Row: {
          action: string
          performed_at: string
          public_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          performed_at?: string
          public_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          performed_at?: string
          public_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      message: {
        Row: {
          client_generated_id: string | null
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          message_type: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string
          reply_to_message_id: string | null
          sender_id: string | null
          system_data: Json
          system_event: string | null
        }
        Insert: {
          client_generated_id?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          reply_to_message_id?: string | null
          sender_id?: string | null
          system_data?: Json
          system_event?: string | null
        }
        Update: {
          client_generated_id?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          reply_to_message_id?: string | null
          sender_id?: string | null
          system_data?: Json
          system_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "message_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      message_attachment: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_name: string | null
          file_size: number | null
          height: number | null
          id: string
          message_id: string
          mime_type: string | null
          storage_bucket: string
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachment_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reaction: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reaction_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reaction_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reaction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reaction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      moderation_action: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          reason: string | null
          report_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          reason?: string | null
          report_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          reason?: string | null
          report_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_action_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report"
            referencedColumns: ["id"]
          },
        ]
      }
      notification: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          image_public_id: string | null
          image_version: string | null
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          image_public_id?: string | null
          image_version?: string | null
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          image_public_id?: string | null
          image_version?: string | null
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_consent_event: {
        Row: {
          action: string
          channel: string
          created_at: string
          id: number
          source: string
          topic: string
          user_id: string
        }
        Insert: {
          action: string
          channel: string
          created_at?: string
          id?: never
          source: string
          topic: string
          user_id: string
        }
        Update: {
          action?: string
          channel?: string
          created_at?: string
          id?: never
          source?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_delivery: {
        Row: {
          attempts: number
          channel: string
          claimed_at: string | null
          created_at: string
          detail: string | null
          finished_at: string | null
          id: number
          notification_id: string
          source: string
          status: string
          urgent: boolean
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          claimed_at?: string | null
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: never
          notification_id: string
          source?: string
          status?: string
          urgent?: boolean
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          claimed_at?: string | null
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: never
          notification_id?: string
          source?: string
          status?: string
          urgent?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_delivery_config: {
        Row: {
          dispatch_url: string | null
          id: boolean
          last_dispatched_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          dispatch_url?: string | null
          id?: boolean
          last_dispatched_at?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          dispatch_url?: string | null
          id?: boolean
          last_dispatched_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preference: {
        Row: {
          organizer_alerts_email: boolean
          organizer_alerts_push: boolean
          paused_until: string | null
          place_updates_email: boolean
          place_updates_push: boolean
          recommendations_email: boolean
          recommendations_push: boolean
          reward_emails: boolean
          social_push: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          organizer_alerts_email?: boolean
          organizer_alerts_push?: boolean
          paused_until?: string | null
          place_updates_email?: boolean
          place_updates_push?: boolean
          recommendations_email?: boolean
          recommendations_push?: boolean
          reward_emails?: boolean
          social_push?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          organizer_alerts_email?: boolean
          organizer_alerts_push?: boolean
          paused_until?: string | null
          place_updates_email?: boolean
          place_updates_push?: boolean
          recommendations_email?: boolean
          recommendations_push?: boolean
          reward_emails?: boolean
          social_push?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preference_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preference_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_prompt_state: {
        Row: {
          accepted_at: string | null
          created_at: string
          dismissed_at: string | null
          kind: string
          last_shown_at: string | null
          shown_count: number
          target_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          kind: string
          last_shown_at?: string | null
          shown_count?: number
          target_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          kind?: string
          last_shown_at?: string | null
          shown_count?: number
          target_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prompt_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_prompt_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_subscription: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_notified_at: string | null
          source: string
          source_event_id: string | null
          source_place_id: string | null
          status: string
          target_id: string | null
          topic_category: string | null
          topic_key: string | null
          topic_location: unknown
          topic_radius_km: number | null
          unsubscribed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          last_notified_at?: string | null
          source: string
          source_event_id?: string | null
          source_place_id?: string | null
          status?: string
          target_id?: string | null
          topic_category?: string | null
          topic_key?: string | null
          topic_location?: unknown
          topic_radius_km?: number | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_notified_at?: string | null
          source?: string
          source_event_id?: string | null
          source_place_id?: string | null
          status?: string
          target_id?: string | null
          topic_category?: string | null
          topic_key?: string | null
          topic_location?: unknown
          topic_radius_km?: number | null
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_subscription_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscription_source_place_id_fkey"
            columns: ["source_place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscription_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscription_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      observability_config: {
        Row: {
          health_url: string | null
          id: boolean
          ingest_secret: string | null
          last_dispatched_at: string | null
          last_request_id: number | null
          updated_at: string
        }
        Insert: {
          health_url?: string | null
          id?: boolean
          ingest_secret?: string | null
          last_dispatched_at?: string | null
          last_request_id?: number | null
          updated_at?: string
        }
        Update: {
          health_url?: string | null
          id?: boolean
          ingest_secret?: string | null
          last_dispatched_at?: string | null
          last_request_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      organizer_ledger_entry: {
        Row: {
          amount: number
          created_at: string
          currency: string
          entry_type: string
          event_id: string | null
          fee_amount: number | null
          gross_amount: number | null
          id: string
          organizer_id: string
          payout_id: string | null
          ticket_checkout_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          entry_type: string
          event_id?: string | null
          fee_amount?: number | null
          gross_amount?: number | null
          id?: string
          organizer_id: string
          payout_id?: string | null
          ticket_checkout_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          entry_type?: string
          event_id?: string | null
          fee_amount?: number | null
          gross_amount?: number | null
          id?: string
          organizer_id?: string
          payout_id?: string | null
          ticket_checkout_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizer_ledger_entry_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organizer_ledger_entry_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_ledger_entry_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_ledger_entry_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organizer_ledger_entry_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_ledger_entry_ticket_checkout_id_fkey"
            columns: ["ticket_checkout_id"]
            isOneToOne: false
            referencedRelation: "ticket_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizer_ledger_entry_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempt: {
        Row: {
          amount: number
          checkout_session_id: string | null
          content_campaign_checkout_id: string | null
          country_code: string | null
          created_at: string
          credit_amount: number
          credit_reservation_id: string | null
          currency: string
          event_promotion_checkout_id: string | null
          failure_reason: string | null
          id: string
          metadata: Json | null
          paid_at: string | null
          payment_group_id: string | null
          payment_method_id: string | null
          place_promotion_checkout_id: string | null
          provider: string
          provider_reference: string | null
          status: string
          subscription_checkout_id: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          checkout_session_id?: string | null
          content_campaign_checkout_id?: string | null
          country_code?: string | null
          created_at?: string
          credit_amount?: number
          credit_reservation_id?: string | null
          currency: string
          event_promotion_checkout_id?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          payment_group_id?: string | null
          payment_method_id?: string | null
          place_promotion_checkout_id?: string | null
          provider: string
          provider_reference?: string | null
          status?: string
          subscription_checkout_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          checkout_session_id?: string | null
          content_campaign_checkout_id?: string | null
          country_code?: string | null
          created_at?: string
          credit_amount?: number
          credit_reservation_id?: string | null
          currency?: string
          event_promotion_checkout_id?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          payment_group_id?: string | null
          payment_method_id?: string | null
          place_promotion_checkout_id?: string | null
          provider?: string
          provider_reference?: string | null
          status?: string
          subscription_checkout_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempt_content_campaign_checkout_id_fkey"
            columns: ["content_campaign_checkout_id"]
            isOneToOne: false
            referencedRelation: "content_campaign_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempt_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_attempt_event_promotion_checkout_id_fkey"
            columns: ["event_promotion_checkout_id"]
            isOneToOne: false
            referencedRelation: "event_promotion_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempt_payment_method_fkey"
            columns: ["payment_method_id", "user_id"]
            isOneToOne: false
            referencedRelation: "payment_method"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "payment_attempt_place_promotion_checkout_id_fkey"
            columns: ["place_promotion_checkout_id"]
            isOneToOne: false
            referencedRelation: "place_promotion_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempt_subscription_checkout_id_fkey"
            columns: ["subscription_checkout_id"]
            isOneToOne: false
            referencedRelation: "subscription_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempt_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempt_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempt_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payment_dispute: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          id: string
          last_event: string
          opened_at: string
          provider: string
          provider_dispute_id: string
          provider_reference: string | null
          raw: Json
          resolution: string | null
          resolved_at: string | null
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          last_event: string
          opened_at?: string
          provider?: string
          provider_dispute_id: string
          provider_reference?: string | null
          raw?: Json
          resolution?: string | null
          resolved_at?: string | null
          status: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          last_event?: string
          opened_at?: string
          provider?: string
          provider_dispute_id?: string
          provider_reference?: string | null
          raw?: Json
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_dispute_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          is_default: boolean | null
          method_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payment_method_p0: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          is_default: boolean | null
          method_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_method_p1: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          is_default: boolean | null
          method_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_method_p2: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          is_default: boolean | null
          method_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_method_p3: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          is_default: boolean | null
          method_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          is_default?: boolean | null
          method_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_orphan_capture: {
        Row: {
          amount: number
          attempt_status: string | null
          attempts: number
          country_code: string
          currency: string
          detected_at: string
          id: string
          last_error: string | null
          note: string | null
          payment_attempt_id: string | null
          provider: string
          provider_reference: string
          provider_transaction_id: string | null
          refund_requested_at: string | null
          refunded_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          attempt_status?: string | null
          attempts?: number
          country_code: string
          currency: string
          detected_at?: string
          id?: string
          last_error?: string | null
          note?: string | null
          payment_attempt_id?: string | null
          provider: string
          provider_reference: string
          provider_transaction_id?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          attempt_status?: string | null
          attempts?: number
          country_code?: string
          currency?: string
          detected_at?: string
          id?: string
          last_error?: string | null
          note?: string | null
          payment_attempt_id?: string | null
          provider?: string
          provider_reference?: string
          provider_transaction_id?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_orphan_capture_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_orphan_capture_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempt"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_event: {
        Row: {
          attempts: number
          country_code: string
          event_id: string
          event_name: string
          first_received_at: string
          http_status: number
          last_received_at: string
          outcome: string
          provider: string
        }
        Insert: {
          attempts?: number
          country_code: string
          event_id: string
          event_name: string
          first_received_at?: string
          http_status: number
          last_received_at?: string
          outcome: string
          provider: string
        }
        Update: {
          attempts?: number
          country_code?: string
          event_id?: string
          event_name?: string
          first_received_at?: string
          http_status?: number
          last_received_at?: string
          outcome?: string
          provider?: string
        }
        Relationships: []
      }
      payout: {
        Row: {
          amount: number
          country_code: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          organizer_id: string
          payout_account_id: string
          processed_at: string | null
          provider: string | null
          reference: string
          requested_at: string
          review_details: Json | null
          review_note: string | null
          review_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transfer_code: string | null
          transfer_failure_reason: string | null
          transfer_initiated_at: string | null
          transfer_recipient_code: string | null
          transfer_status: string
          updated_at: string
        }
        Insert: {
          amount: number
          country_code?: string | null
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          organizer_id: string
          payout_account_id: string
          processed_at?: string | null
          provider?: string | null
          reference: string
          requested_at?: string
          review_details?: Json | null
          review_note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transfer_code?: string | null
          transfer_failure_reason?: string | null
          transfer_initiated_at?: string | null
          transfer_recipient_code?: string | null
          transfer_status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          country_code?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          organizer_id?: string
          payout_account_id?: string
          processed_at?: string | null
          provider?: string | null
          reference?: string
          requested_at?: string
          review_details?: Json | null
          review_note?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transfer_code?: string | null
          transfer_failure_reason?: string | null
          transfer_initiated_at?: string | null
          transfer_recipient_code?: string | null
          transfer_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "payout_account"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_account: {
        Row: {
          account_holder_name: string
          account_number: string
          account_type: string
          country_code: string
          created_at: string
          currency: string
          details: Json
          id: string
          is_default: boolean
          organizer_id: string
          provider: string | null
          provider_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_holder_name: string
          account_number: string
          account_type: string
          country_code: string
          created_at?: string
          currency: string
          details?: Json
          id?: string
          is_default?: boolean
          organizer_id: string
          provider?: string | null
          provider_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          account_type?: string
          country_code?: string
          created_at?: string
          currency?: string
          details?: Json
          id?: string
          is_default?: boolean
          organizer_id?: string
          provider?: string | null
          provider_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_account_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payout_account_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_account_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      phone_otp_send_log: {
        Row: {
          created_at: string
          id: number
          ip_address: string | null
          phone_e164: string
        }
        Insert: {
          created_at?: string
          id?: never
          ip_address?: string | null
          phone_e164: string
        }
        Update: {
          created_at?: string
          id?: never
          ip_address?: string | null
          phone_e164?: string
        }
        Relationships: []
      }
      phone_otp_state: {
        Row: {
          attempts: number
          created_at: string
          last_sent_at: string
          phone_e164: string
          prefix: string
          provider: string
          purpose: string
          request_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          last_sent_at?: string
          phone_e164: string
          prefix: string
          provider: string
          purpose: string
          request_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          last_sent_at?: string
          phone_e164?: string
          prefix?: string
          provider?: string
          purpose?: string
          request_id?: string
        }
        Relationships: []
      }
      place: {
        Row: {
          address: Json
          category_id: number
          claimed: boolean
          client_request_id: string | null
          country_code: string
          cover_public_id: string
          cover_version: string
          created_at: string
          description: string
          id: string
          location: unknown
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          name: string
          owner_id: string
          phone: string | null
          published_at: string | null
          search_tsv: unknown
          slug: string
          social_links: Json | null
          status: string
          temporary_status: string | null
          temporary_status_note: string | null
          timezone: string
          updated_at: string
          verification_case_id: string | null
          verified: boolean
          verified_at: string | null
          website_url: string | null
          whatsapp: string | null
        }
        Insert: {
          address: Json
          category_id: number
          claimed?: boolean
          client_request_id?: string | null
          country_code: string
          cover_public_id: string
          cover_version: string
          created_at?: string
          description: string
          id?: string
          location: unknown
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          name: string
          owner_id: string
          phone?: string | null
          published_at?: string | null
          search_tsv?: unknown
          slug: string
          social_links?: Json | null
          status?: string
          temporary_status?: string | null
          temporary_status_note?: string | null
          timezone: string
          updated_at?: string
          verification_case_id?: string | null
          verified?: boolean
          verified_at?: string | null
          website_url?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: Json
          category_id?: number
          claimed?: boolean
          client_request_id?: string | null
          country_code?: string
          cover_public_id?: string
          cover_version?: string
          created_at?: string
          description?: string
          id?: string
          location?: unknown
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          published_at?: string | null
          search_tsv?: unknown
          slug?: string
          social_links?: Json | null
          status?: string
          temporary_status?: string | null
          temporary_status_note?: string | null
          timezone?: string
          updated_at?: string
          verification_case_id?: string | null
          verified?: boolean
          verified_at?: string | null
          website_url?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "place_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "place_verification_case_id_fkey"
            columns: ["verification_case_id"]
            isOneToOne: false
            referencedRelation: "verification_case"
            referencedColumns: ["id"]
          },
        ]
      }
      place_analytics_event: {
        Row: {
          created_at: string
          event_type: string
          id: string
          place_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          place_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_analytics_event_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      place_booking: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          note: string | null
          party_size: number | null
          place_id: string
          requested_time: string
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          note?: string | null
          party_size?: number | null
          place_id: string
          requested_time: string
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          note?: string | null
          party_size?: number | null
          place_id?: string
          requested_time?: string
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_booking_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_booking_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "place_booking_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_booking_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "place_service"
            referencedColumns: ["id"]
          },
        ]
      }
      place_category: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id: number
          name: string
          slug: string
        }
        Update: {
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      place_claim_document: {
        Row: {
          claim_request_id: string
          created_at: string
          file_name: string | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          claim_request_id: string
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          claim_request_id?: string
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_claim_document_claim_request_id_fkey"
            columns: ["claim_request_id"]
            isOneToOne: false
            referencedRelation: "place_claim_request"
            referencedColumns: ["id"]
          },
        ]
      }
      place_claim_request: {
        Row: {
          claimant_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          note: string | null
          place_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          claimant_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          note?: string | null
          place_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          claimant_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          note?: string | null
          place_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_claim_request_claimant_id_fkey"
            columns: ["claimant_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_claim_request_claimant_id_fkey"
            columns: ["claimant_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "place_claim_request_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_claim_request_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_claim_request_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      place_drafts: {
        Row: {
          cover_public_id: string | null
          cover_version: string | null
          draft_id: string
          payload: Json
        }
        Insert: {
          cover_public_id?: string | null
          cover_version?: string | null
          draft_id: string
          payload?: Json
        }
        Update: {
          cover_public_id?: string | null
          cover_version?: string | null
          draft_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "place_drafts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      place_opening_hours: {
        Row: {
          close_time: string | null
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string | null
          place_id: string
        }
        Insert: {
          close_time?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          place_id: string
        }
        Update: {
          close_time?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_opening_hours_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      place_photo: {
        Row: {
          created_at: string
          id: string
          place_id: string
          position: number
          public_id: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          place_id: string
          position?: number
          public_id: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          place_id?: string
          position?: number
          public_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_photo_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      place_promotion: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          place_id: string
          promotion_checkout_id: string
          starts_at: string
          tier_id: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          place_id: string
          promotion_checkout_id: string
          starts_at?: string
          tier_id: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          place_id?: string
          promotion_checkout_id?: string
          starts_at?: string
          tier_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "place_promotion_checkout_id_fkey"
            columns: ["promotion_checkout_id"]
            isOneToOne: true
            referencedRelation: "place_promotion_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_promotion_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_promotion_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "place_promotion_tier"
            referencedColumns: ["id"]
          },
        ]
      }
      place_promotion_checkout: {
        Row: {
          completed_at: string | null
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          owner_id: string
          place_id: string
          status: string
          tier_id: number
          total_price: number
          unit_price: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          currency: string
          expires_at?: string | null
          id?: string
          owner_id: string
          place_id: string
          status?: string
          tier_id: number
          total_price: number
          unit_price: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          owner_id?: string
          place_id?: string
          status?: string
          tier_id?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "place_promotion_checkout_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_promotion_checkout_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "place_promotion_checkout_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_promotion_checkout_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "place_promotion_tier"
            referencedColumns: ["id"]
          },
        ]
      }
      place_promotion_tier: {
        Row: {
          country_code: string
          currency: string
          duration: string
          duration_label: string
          id: number
          is_active: boolean
          price: number
        }
        Insert: {
          country_code: string
          currency: string
          duration: string
          duration_label: string
          id: number
          is_active?: boolean
          price: number
        }
        Update: {
          country_code?: string
          currency?: string
          duration?: string
          duration_label?: string
          id?: number
          is_active?: boolean
          price?: number
        }
        Relationships: []
      }
      place_review: {
        Row: {
          comment: string | null
          created_at: string
          edited_at: string | null
          helpful_count: number
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          owner_response: string | null
          owner_response_at: string | null
          place_id: string
          rating: number
          reviewer_id: string
          status: string
          title: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          edited_at?: string | null
          helpful_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          owner_response?: string | null
          owner_response_at?: string | null
          place_id: string
          rating: number
          reviewer_id: string
          status?: string
          title?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          edited_at?: string | null
          helpful_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          owner_response?: string | null
          owner_response_at?: string | null
          place_id?: string
          rating?: number
          reviewer_id?: string
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_review_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_review_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_review_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      place_review_helpful: {
        Row: {
          created_at: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_review_helpful_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "place_review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_review_helpful_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_review_helpful_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      place_review_photo: {
        Row: {
          created_at: string
          id: string
          place_review_id: string
          position: number
          public_id: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          place_review_id: string
          position?: number
          public_id: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          place_review_id?: string
          position?: number
          public_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_review_photo_review_id_fkey"
            columns: ["place_review_id"]
            isOneToOne: false
            referencedRelation: "place_review"
            referencedColumns: ["id"]
          },
        ]
      }
      place_service: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          place_id: string
          position: number
          price: number | null
          price_unit: string | null
          search_tsv: unknown
          show_price: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          place_id: string
          position?: number
          price?: number | null
          price_unit?: string | null
          search_tsv?: unknown
          show_price?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          place_id?: string
          position?: number
          price?: number | null
          price_unit?: string | null
          search_tsv?: unknown
          show_price?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "place_service_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      place_visit: {
        Row: {
          accuracy_m: number | null
          created_at: string
          distance_m: number
          id: string
          install_id: string | null
          place_id: string
          platform: string
          user_id: string
          visited_on: string
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          distance_m: number
          id?: string
          install_id?: string | null
          place_id: string
          platform: string
          user_id: string
          visited_on: string
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          distance_m?: number
          id?: string
          install_id?: string | null
          place_id?: string
          platform?: string
          user_id?: string
          visited_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_visit_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_visit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_visit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      place_visit_key: {
        Row: {
          created_at: string
          place_id: string
          secret: string
        }
        Insert: {
          created_at?: string
          place_id: string
          secret?: string
        }
        Update: {
          created_at?: string
          place_id?: string
          secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_visit_key_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fee_config: {
        Row: {
          country_code: string | null
          created_at: string
          currency: string | null
          effective_from: string
          fee_rate: number
          id: string
          is_active: boolean
          note: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          currency?: string | null
          effective_from?: string
          fee_rate: number
          id?: string
          is_active?: boolean
          note?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          currency?: string | null
          effective_from?: string
          fee_rate?: number
          id?: string
          is_active?: boolean
          note?: string | null
        }
        Relationships: []
      }
      platform_fee_entry: {
        Row: {
          created_at: string
          credit_applied: number
          currency: string
          entry_type: string
          event_id: string | null
          fee_rate: number
          id: string
          net_revenue: number | null
          processing_cost: number | null
          service_fee: number
          ticket_revenue: number
          total_customer_payment: number
          transaction_id: string
        }
        Insert: {
          created_at?: string
          credit_applied?: number
          currency: string
          entry_type: string
          event_id?: string | null
          fee_rate: number
          id?: string
          net_revenue?: number | null
          processing_cost?: number | null
          service_fee: number
          ticket_revenue: number
          total_customer_payment: number
          transaction_id: string
        }
        Update: {
          created_at?: string
          credit_applied?: number
          currency?: string
          entry_type?: string
          event_id?: string | null
          fee_rate?: number
          id?: string
          net_revenue?: number | null
          processing_cost?: number | null
          service_fee?: number
          ticket_revenue?: number
          total_customer_payment?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_fee_entry_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_fee_entry_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code: {
        Row: {
          created_at: string | null
          discount_percentage: number | null
          event_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          promo_code: string | null
          times_used: number | null
        }
        Insert: {
          created_at?: string | null
          discount_percentage?: number | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          promo_code?: string | null
          times_used?: number | null
        }
        Update: {
          created_at?: string | null
          discount_percentage?: number | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          promo_code?: string | null
          times_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usage: {
        Row: {
          event_id: string
          promo_code_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          promo_code_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          promo_code_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_usage_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_code"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      push_receipt: {
        Row: {
          check_after: string
          created_at: string
          ticket_id: string
          token: string
        }
        Insert: {
          check_after?: string
          created_at?: string
          ticket_id: string
          token: string
        }
        Update: {
          check_after?: string
          created_at?: string
          ticket_id?: string
          token?: string
        }
        Relationships: []
      }
      rate_limit_bucket: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      receiving_account: {
        Row: {
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          created_at: string | null
          email: string
          event_id: string | null
          full_name: string
          id: string
          network_service_provider: string | null
          payment_option: string
          phone: string | null
          user_id: string
        }
        Insert: {
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          created_at?: string | null
          email: string
          event_id?: string | null
          full_name: string
          id?: string
          network_service_provider?: string | null
          payment_option: string
          phone?: string | null
          user_id: string
        }
        Update: {
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          created_at?: string | null
          email?: string
          event_id?: string | null
          full_name?: string
          id?: string
          network_service_provider?: string | null
          payment_option?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receiving_account_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receiving_account_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receiving_account_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      recommendation: {
        Row: {
          basis: Json
          created_at: string
          digest_id: string | null
          id: string
          is_shadow: boolean
          notified_at: string | null
          reason_kind: string
          score: number
          status: string
          subject_id: string
          subject_type: string
          subscription_id: string | null
          suppress_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          basis?: Json
          created_at?: string
          digest_id?: string | null
          id?: string
          is_shadow: boolean
          notified_at?: string | null
          reason_kind: string
          score: number
          status?: string
          subject_id: string
          subject_type: string
          subscription_id?: string | null
          suppress_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          basis?: Json
          created_at?: string
          digest_id?: string | null
          id?: string
          is_shadow?: boolean
          notified_at?: string | null
          reason_kind?: string
          score?: number
          status?: string
          subject_id?: string
          subject_type?: string
          subscription_id?: string | null
          suppress_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "notification_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      recommendation_digest: {
        Row: {
          categories: string[]
          created_at: string
          delivery_status: string
          digest_date: string
          id: string
          is_shadow: boolean
          item_count: number
          notification_id: string | null
          opened_at: string | null
          organizer_ids: string[]
          top_subject_id: string
          top_subject_type: string
          user_id: string
        }
        Insert: {
          categories?: string[]
          created_at?: string
          delivery_status?: string
          digest_date: string
          id?: string
          is_shadow: boolean
          item_count: number
          notification_id?: string | null
          opened_at?: string | null
          organizer_ids?: string[]
          top_subject_id: string
          top_subject_type: string
          user_id: string
        }
        Update: {
          categories?: string[]
          created_at?: string
          delivery_status?: string
          digest_date?: string
          id?: string
          is_shadow?: boolean
          item_count?: number
          notification_id?: string | null
          opened_at?: string | null
          organizer_ids?: string[]
          top_subject_id?: string
          top_subject_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_digest_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_digest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_digest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      recommendation_digest_skip: {
        Row: {
          candidate_count: number
          created_at: string
          digest_date: string
          id: number
          is_shadow: boolean
          reason: string
          user_id: string
        }
        Insert: {
          candidate_count?: number
          created_at?: string
          digest_date: string
          id?: never
          is_shadow: boolean
          reason: string
          user_id: string
        }
        Update: {
          candidate_count?: number
          created_at?: string
          digest_date?: string
          id?: never
          is_shadow?: boolean
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_digest_skip_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_digest_skip_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      referral_attribution: {
        Row: {
          code: string
          event_id: string
          referrer_user_id: string
          source: string
          touched_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          event_id: string
          referrer_user_id: string
          source: string
          touched_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          event_id?: string
          referrer_user_id?: string
          source?: string
          touched_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_attribution_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attribution_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attribution_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referral_attribution_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_attribution_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      referral_code: {
        Row: {
          code: string
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_code_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_code_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      referral_touch: {
        Row: {
          code: string
          created_at: string
          event_id: string | null
          id: string
          install_id: string | null
          ip_hash: string | null
          place_id: string | null
          platform: string
          referrer_user_id: string
          source: string
          ua_hash: string | null
          visitor_user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          event_id?: string | null
          id?: string
          install_id?: string | null
          ip_hash?: string | null
          place_id?: string | null
          platform: string
          referrer_user_id: string
          source?: string
          ua_hash?: string | null
          visitor_user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string | null
          id?: string
          install_id?: string | null
          ip_hash?: string | null
          place_id?: string | null
          platform?: string
          referrer_user_id?: string
          source?: string
          ua_hash?: string | null
          visitor_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_touch_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_touch_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_touch_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_touch_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "referral_touch_visitor_user_id_fkey"
            columns: ["visitor_user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_touch_visitor_user_id_fkey"
            columns: ["visitor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      report: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          dedupe_key: string
          details: string | null
          id: string
          priority: string
          reporter_id: string | null
          resolution: string | null
          resolution_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          dedupe_key: string
          details?: string | null
          id?: string
          priority?: string
          reporter_id?: string | null
          resolution?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          dedupe_key?: string
          details?: string | null
          id?: string
          priority?: string
          reporter_id?: string | null
          resolution?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_user"
            referencedColumns: ["user_id"]
          },
        ]
      }
      report_attachment: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          mime_type: string | null
          report_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          report_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type?: string | null
          report_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_attachment_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report"
            referencedColumns: ["id"]
          },
        ]
      }
      report_event: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json | null
          id: string
          kind: string
          report_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind: string
          report_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          kind?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_event_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report"
            referencedColumns: ["id"]
          },
        ]
      }
      review: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reviewed_id_fkey"
            columns: ["reviewed_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reviewed_id_fkey"
            columns: ["reviewed_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      review_april_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_august_2025: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_august_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_december_2025: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_december_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_default: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_drafts: {
        Row: {
          comment: string | null
          draft_id: string
          rating: number | null
          reviewed_id: string
          title: string | null
        }
        Insert: {
          comment?: string | null
          draft_id: string
          rating?: number | null
          reviewed_id: string
          title?: string | null
        }
        Update: {
          comment?: string | null
          draft_id?: string
          rating?: number | null
          reviewed_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_drafts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: true
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_drafts_reviewed_id_fkey"
            columns: ["reviewed_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_drafts_reviewed_id_fkey"
            columns: ["reviewed_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      review_february_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_january_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_july_2025: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_july_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_june_2025: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_june_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_march_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_may_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_november_2025: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_november_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_october_2025: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_october_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_september_2025: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      review_september_2026: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_state: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status: string
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating: number
          reviewed_id: string
          reviewer_id: string
          status?: string
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_state?: string | null
          rating?: number
          reviewed_id?: string
          reviewer_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      reward_budget_period: {
        Row: {
          ceiling_minor: number
          committed_minor: number
          created_at: string
          period_start: string
          released_minor: number
          updated_at: string
        }
        Insert: {
          ceiling_minor: number
          committed_minor?: number
          created_at?: string
          period_start: string
          released_minor?: number
          updated_at?: string
        }
        Update: {
          ceiling_minor?: number
          committed_minor?: number
          created_at?: string
          period_start?: string
          released_minor?: number
          updated_at?: string
        }
        Relationships: []
      }
      reward_campaign: {
        Row: {
          bonus_minor: number | null
          budget_minor: number
          committed_minor: number
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          expiry_days: number | null
          id: string
          kind: string
          lot_kind: string
          multiplier_bps: number | null
          name: string
          rule_key: string | null
          spend_scope: string
          starts_at: string
          status: string
          target: Json
          updated_at: string
        }
        Insert: {
          bonus_minor?: number | null
          budget_minor: number
          committed_minor?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          expiry_days?: number | null
          id?: string
          kind: string
          lot_kind?: string
          multiplier_bps?: number | null
          name: string
          rule_key?: string | null
          spend_scope?: string
          starts_at: string
          status?: string
          target?: Json
          updated_at?: string
        }
        Update: {
          bonus_minor?: number | null
          budget_minor?: number
          committed_minor?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          expiry_days?: number | null
          id?: string
          kind?: string
          lot_kind?: string
          multiplier_bps?: number | null
          name?: string
          rule_key?: string | null
          spend_scope?: string
          starts_at?: string
          status?: string
          target?: Json
          updated_at?: string
        }
        Relationships: []
      }
      reward_event: {
        Row: {
          amount_minor: number
          basis: Json
          beneficiary_user_id: string
          budget_period: string | null
          buyer_user_id: string | null
          created_at: string
          currency: string
          decision: string
          event_id: string | null
          id: string
          idempotency_key: string
          is_shadow: boolean
          lot_id: string | null
          next_check_at: string | null
          notified_pending_at: string | null
          release_at: string | null
          released_minor: number | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_flags: string[]
          risk_score: number
          rule_id: string | null
          rule_key: string
          rule_version: number | null
          settled_at: string | null
          source_id: string
          source_type: string
          status: string
          status_reason: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          basis?: Json
          beneficiary_user_id: string
          budget_period?: string | null
          buyer_user_id?: string | null
          created_at?: string
          currency: string
          decision: string
          event_id?: string | null
          id?: string
          idempotency_key: string
          is_shadow: boolean
          lot_id?: string | null
          next_check_at?: string | null
          notified_pending_at?: string | null
          release_at?: string | null
          released_minor?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: string[]
          risk_score?: number
          rule_id?: string | null
          rule_key: string
          rule_version?: number | null
          settled_at?: string | null
          source_id: string
          source_type: string
          status: string
          status_reason?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          basis?: Json
          beneficiary_user_id?: string
          budget_period?: string | null
          buyer_user_id?: string | null
          created_at?: string
          currency?: string
          decision?: string
          event_id?: string | null
          id?: string
          idempotency_key?: string
          is_shadow?: boolean
          lot_id?: string | null
          next_check_at?: string | null
          notified_pending_at?: string | null
          release_at?: string | null
          released_minor?: number | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: string[]
          risk_score?: number
          rule_id?: string | null
          rule_key?: string
          rule_version?: number | null
          settled_at?: string | null
          source_id?: string
          source_type?: string
          status?: string
          status_reason?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_event_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_event_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reward_event_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_event_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "credit_lot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_event_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reward_rule"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_outbox: {
        Row: {
          aggregate_id: string
          attempts: number
          created_at: string
          dead_lettered_at: string | null
          event_type: string
          id: number
          last_error: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          aggregate_id: string
          attempts?: number
          created_at?: string
          dead_lettered_at?: string | null
          event_type: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          aggregate_id?: string
          attempts?: number
          created_at?: string
          dead_lettered_at?: string | null
          event_type?: string
          id?: never
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      reward_program_setting: {
        Row: {
          allow_full_credit_ticket_orders: boolean
          audience: string
          beta_user_ids: string[]
          budget_floor_minor: number
          budget_net_revenue_share_bps: number
          credit_share_payout_hold_bps: number
          dual_approval_threshold_minor: number
          id: number
          max_credit_share_of_ticket_order_bps: number
          min_cash_charge_minor: number
          notify_email_enabled: boolean
          notify_push_enabled: boolean
          redeem_promotions_enabled: boolean
          redeem_tickets_enabled: boolean
          referral_attribution_window_days: number
          referral_capture_enabled: boolean
          rewards_enabled: boolean
          risk_weights: Json
          shadow_mode: boolean
          support_goodwill_monthly_cap_minor: number
          updated_at: string
          updated_by: string | null
          withdrawal_min_minor: number
          withdrawals_enabled: boolean
        }
        Insert: {
          allow_full_credit_ticket_orders?: boolean
          audience?: string
          beta_user_ids?: string[]
          budget_floor_minor?: number
          budget_net_revenue_share_bps?: number
          credit_share_payout_hold_bps?: number
          dual_approval_threshold_minor?: number
          id?: number
          max_credit_share_of_ticket_order_bps?: number
          min_cash_charge_minor?: number
          notify_email_enabled?: boolean
          notify_push_enabled?: boolean
          redeem_promotions_enabled?: boolean
          redeem_tickets_enabled?: boolean
          referral_attribution_window_days?: number
          referral_capture_enabled?: boolean
          rewards_enabled?: boolean
          risk_weights?: Json
          shadow_mode?: boolean
          support_goodwill_monthly_cap_minor?: number
          updated_at?: string
          updated_by?: string | null
          withdrawal_min_minor?: number
          withdrawals_enabled?: boolean
        }
        Update: {
          allow_full_credit_ticket_orders?: boolean
          audience?: string
          beta_user_ids?: string[]
          budget_floor_minor?: number
          budget_net_revenue_share_bps?: number
          credit_share_payout_hold_bps?: number
          dual_approval_threshold_minor?: number
          id?: number
          max_credit_share_of_ticket_order_bps?: number
          min_cash_charge_minor?: number
          notify_email_enabled?: boolean
          notify_push_enabled?: boolean
          redeem_promotions_enabled?: boolean
          redeem_tickets_enabled?: boolean
          referral_attribution_window_days?: number
          referral_capture_enabled?: boolean
          rewards_enabled?: boolean
          risk_weights?: Json
          shadow_mode?: boolean
          support_goodwill_monthly_cap_minor?: number
          updated_at?: string
          updated_by?: string | null
          withdrawal_min_minor?: number
          withdrawals_enabled?: boolean
        }
        Relationships: []
      }
      reward_rebate_run: {
        Row: {
          finished_at: string | null
          id: string
          period_start: string
          shadow_mode: boolean
          started_at: string
          stats: Json
          triggered_by: string | null
        }
        Insert: {
          finished_at?: string | null
          id?: string
          period_start: string
          shadow_mode: boolean
          started_at?: string
          stats?: Json
          triggered_by?: string | null
        }
        Update: {
          finished_at?: string | null
          id?: string
          period_start?: string
          shadow_mode?: boolean
          started_at?: string
          stats?: Json
          triggered_by?: string | null
        }
        Relationships: []
      }
      reward_rule: {
        Row: {
          caps: Json
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          expiry_days: number | null
          flat_minor: number | null
          id: string
          is_active: boolean
          lot_kind: string
          min_basis_minor: number
          net_share_cap_bps: number | null
          note: string | null
          rate_bps: number | null
          release_delay: string | null
          release_policy: string
          rule_key: string
          spend_scope: string
          version: number
          withdrawable: boolean
          withdrawable_delay: string | null
        }
        Insert: {
          caps?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          expiry_days?: number | null
          flat_minor?: number | null
          id?: string
          is_active?: boolean
          lot_kind: string
          min_basis_minor?: number
          net_share_cap_bps?: number | null
          note?: string | null
          rate_bps?: number | null
          release_delay?: string | null
          release_policy: string
          rule_key: string
          spend_scope: string
          version: number
          withdrawable?: boolean
          withdrawable_delay?: string | null
        }
        Update: {
          caps?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          expiry_days?: number | null
          flat_minor?: number | null
          id?: string
          is_active?: boolean
          lot_kind?: string
          min_basis_minor?: number
          net_share_cap_bps?: number | null
          note?: string | null
          rate_bps?: number | null
          release_delay?: string | null
          release_policy?: string
          rule_key?: string
          spend_scope?: string
          version?: number
          withdrawable?: boolean
          withdrawable_delay?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_rule_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
        ]
      }
      risk_signal: {
        Row: {
          created_at: string
          details: Json
          id: string
          related_user_id: string | null
          reward_event_id: string | null
          severity: string
          signal_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          related_user_id?: string | null
          reward_event_id?: string | null
          severity: string
          signal_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          related_user_id?: string | null
          reward_event_id?: string | null
          severity?: string
          signal_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_signal_reward_event_id_fkey"
            columns: ["reward_event_id"]
            isOneToOne: false
            referencedRelation: "reward_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_signal_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_signal_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      search_concept: {
        Row: {
          applies_to: string[]
          created_at: string
          enabled: boolean
          expands_to: string[]
          id: number
          note: string | null
          term: string
          updated_at: string
        }
        Insert: {
          applies_to?: string[]
          created_at?: string
          enabled?: boolean
          expands_to: string[]
          id?: never
          note?: string | null
          term: string
          updated_at?: string
        }
        Update: {
          applies_to?: string[]
          created_at?: string
          enabled?: boolean
          expands_to?: string[]
          id?: never
          note?: string | null
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      search_query_log: {
        Row: {
          clicked_at: string | null
          clicked_id: string | null
          clicked_rank: number | null
          clicked_type: string | null
          created_at: string
          event_count: number
          has_filters: boolean
          has_location: boolean
          id: number
          latency_ms: number | null
          mode: string
          organizer_count: number
          place_count: number
          platform: string
          query_norm: string
          surface: string
          zero_results: boolean | null
        }
        Insert: {
          clicked_at?: string | null
          clicked_id?: string | null
          clicked_rank?: number | null
          clicked_type?: string | null
          created_at?: string
          event_count?: number
          has_filters?: boolean
          has_location?: boolean
          id?: never
          latency_ms?: number | null
          mode: string
          organizer_count?: number
          place_count?: number
          platform: string
          query_norm: string
          surface: string
          zero_results?: boolean | null
        }
        Update: {
          clicked_at?: string | null
          clicked_id?: string | null
          clicked_rank?: number | null
          clicked_type?: string | null
          created_at?: string
          event_count?: number
          has_filters?: boolean
          has_location?: boolean
          id?: never
          latency_ms?: number | null
          mode?: string
          organizer_count?: number
          place_count?: number
          platform?: string
          query_norm?: string
          surface?: string
          zero_results?: boolean | null
        }
        Relationships: []
      }
      storage_purge_config: {
        Row: {
          content_upload_sweep_at: string | null
          dispatch_url: string | null
          id: boolean
          last_dispatched_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          content_upload_sweep_at?: string | null
          dispatch_url?: string | null
          id?: boolean
          last_dispatched_at?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          content_upload_sweep_at?: string | null
          dispatch_url?: string | null
          id?: boolean
          last_dispatched_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      storage_purge_queue: {
        Row: {
          attempts: number
          bucket_id: string
          claimed_at: string | null
          created_at: string
          detail: string | null
          finished_at: string | null
          id: number
          object_path: string
          reason: string
          status: string
        }
        Insert: {
          attempts?: number
          bucket_id: string
          claimed_at?: string | null
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: never
          object_path: string
          reason: string
          status?: string
        }
        Update: {
          attempts?: number
          bucket_id?: string
          claimed_at?: string | null
          created_at?: string
          detail?: string | null
          finished_at?: string | null
          id?: never
          object_path?: string
          reason?: string
          status?: string
        }
        Relationships: []
      }
      story: {
        Row: {
          content: string
          created_at: string
          id: string
          media_url: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          media_url: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          media_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      story_default: {
        Row: {
          content: string
          created_at: string
          id: string
          media_url: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          media_url: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          media_url?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription: {
        Row: {
          end_date: string
          events_used: number
          id: string
          plan_id: number
          start_date: string
          stories_used: number
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          end_date: string
          events_used?: number
          id?: string
          plan_id: number
          start_date: string
          stories_used?: number
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          end_date?: string
          events_used?: number
          id?: string
          plan_id?: number
          start_date?: string
          stories_used?: number
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      subscription_checkout: {
        Row: {
          completed_at: string | null
          created_at: string
          currency: string
          discount: number | null
          expires_at: string | null
          id: string
          promo_code: string | null
          status: string
          subscription_plan_name: string | null
          total_price: number
          unit_price: number
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          currency: string
          discount?: number | null
          expires_at?: string | null
          id?: string
          promo_code?: string | null
          status?: string
          subscription_plan_name?: string | null
          total_price: number
          unit_price: number
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          currency?: string
          discount?: number | null
          expires_at?: string | null
          id?: string
          promo_code?: string | null
          status?: string
          subscription_plan_name?: string | null
          total_price?: number
          unit_price?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_checkout_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscription_checkout_subscription_plan_name_fkey"
            columns: ["subscription_plan_name"]
            isOneToOne: false
            referencedRelation: "subscription_plan"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "subscription_checkout_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_checkout_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      subscription_plan: {
        Row: {
          duration: string
          highlight_delay: string | null
          highlight_window: string
          id: number
          max_events: number | null
          max_stories: number | null
          name: string
          price: number
          retention: string
        }
        Insert: {
          duration: string
          highlight_delay?: string | null
          highlight_window: string
          id?: number
          max_events?: number | null
          max_stories?: number | null
          name: string
          price: number
          retention: string
        }
        Update: {
          duration?: string
          highlight_delay?: string | null
          highlight_window?: string
          id?: number
          max_events?: number | null
          max_stories?: number | null
          name?: string
          price?: number
          retention?: string
        }
        Relationships: []
      }
      ticket: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          issued_at: string
          metadata: Json | null
          occurrence_id: string | null
          qr_public_id: string
          qr_version: string
          seat_number: string | null
          status: string
          ticket_checkout_id: string | null
          ticket_code: string | null
          ticket_type_id: string
          transaction_id: string | null
          updated_at: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          occurrence_id?: string | null
          qr_public_id: string
          qr_version: string
          seat_number?: string | null
          status?: string
          ticket_checkout_id?: string | null
          ticket_code?: string | null
          ticket_type_id: string
          transaction_id?: string | null
          updated_at?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          issued_at?: string
          metadata?: Json | null
          occurrence_id?: string | null
          qr_public_id?: string
          qr_version?: string
          seat_number?: string | null
          status?: string
          ticket_checkout_id?: string | null
          ticket_code?: string | null
          ticket_type_id?: string
          transaction_id?: string | null
          updated_at?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_ticket_checkout_id_fkey"
            columns: ["ticket_checkout_id"]
            isOneToOne: false
            referencedRelation: "ticket_checkout"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ticket_checkout: {
        Row: {
          checkout_session_id: string | null
          completed_at: string | null
          created_at: string | null
          discount: number | null
          discounted_units: number
          event_id: string | null
          expires_at: string | null
          id: string
          occurrence_id: string | null
          promo_code: string | null
          quantity: number
          referral_code: string | null
          referral_source: string | null
          referral_touched_at: string | null
          referrer_user_id: string | null
          status: string | null
          ticket_type_id: string | null
          total_price: number
          unit_price: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          checkout_session_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          discount?: number | null
          discounted_units?: number
          event_id?: string | null
          expires_at?: string | null
          id?: string
          occurrence_id?: string | null
          promo_code?: string | null
          quantity: number
          referral_code?: string | null
          referral_source?: string | null
          referral_touched_at?: string | null
          referrer_user_id?: string | null
          status?: string | null
          ticket_type_id?: string | null
          total_price: number
          unit_price: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          checkout_session_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          discount?: number | null
          discounted_units?: number
          event_id?: string | null
          expires_at?: string | null
          id?: string
          occurrence_id?: string | null
          promo_code?: string | null
          quantity?: number
          referral_code?: string | null
          referral_source?: string | null
          referral_touched_at?: string | null
          referrer_user_id?: string | null
          status?: string | null
          ticket_type_id?: string | null
          total_price?: number
          unit_price?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checkout_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checkout_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "event_occurrence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checkout_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checkout_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_checkout_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checkout_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checkout_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ticket_type: {
        Row: {
          available_from: string | null
          available_until: string | null
          created_at: string | null
          currency: string
          event_id: string | null
          id: string
          price: number | null
          quantity: number | null
          type: string | null
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string | null
          currency: string
          event_id?: string | null
          id?: string
          price?: number | null
          quantity?: number | null
          type?: string | null
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string | null
          currency?: string
          event_id?: string | null
          id?: string
          price?: number | null
          quantity?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_type_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ticket_type_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction: {
        Row: {
          amount: number
          country_code: string | null
          created_at: string
          credit_amount: number
          credit_refunded_amount: number
          currency: string
          email: string
          full_name: string
          id: string
          metadata: Json | null
          payment_gateway_response: Json | null
          payment_method: string | null
          phone_number: string | null
          provider: string
          provider_fee: number | null
          provider_reference: string
          provider_transaction_id: string | null
          reason: string
          refund_claimed_at: string | null
          refund_requested_at: string | null
          settlement_amount: number | null
          settlement_currency: string | null
          status: string
          tax_amount: number
          transaction_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          country_code?: string | null
          created_at?: string
          credit_amount?: number
          credit_refunded_amount?: number
          currency: string
          email: string
          full_name: string
          id?: string
          metadata?: Json | null
          payment_gateway_response?: Json | null
          payment_method?: string | null
          phone_number?: string | null
          provider: string
          provider_fee?: number | null
          provider_reference: string
          provider_transaction_id?: string | null
          reason: string
          refund_claimed_at?: string | null
          refund_requested_at?: string | null
          settlement_amount?: number | null
          settlement_currency?: string | null
          status: string
          tax_amount?: number
          transaction_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          country_code?: string | null
          created_at?: string
          credit_amount?: number
          credit_refunded_amount?: number
          currency?: string
          email?: string
          full_name?: string
          id?: string
          metadata?: Json | null
          payment_gateway_response?: Json | null
          payment_method?: string | null
          phone_number?: string | null
          provider?: string
          provider_fee?: number | null
          provider_reference?: string
          provider_transaction_id?: string | null
          reason?: string
          refund_claimed_at?: string | null
          refund_requested_at?: string | null
          settlement_amount?: number | null
          settlement_currency?: string | null
          status?: string
          tax_amount?: number
          transaction_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transaction_settlement_currency_fkey"
            columns: ["settlement_currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transaction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      transaction_status: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      user_image_history: {
        Row: {
          created_at: string
          public_id: string
          transformation: string | null
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          public_id: string
          transformation?: string | null
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          public_id?: string
          transformation?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_image_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_image_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_image_history_0: {
        Row: {
          created_at: string
          public_id: string
          transformation: string | null
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          public_id: string
          transformation?: string | null
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          public_id?: string
          transformation?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      user_image_history_1: {
        Row: {
          created_at: string
          public_id: string
          transformation: string | null
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          public_id: string
          transformation?: string | null
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          public_id?: string
          transformation?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      user_image_history_2: {
        Row: {
          created_at: string
          public_id: string
          transformation: string | null
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          public_id: string
          transformation?: string | null
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          public_id?: string
          transformation?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      user_image_history_3: {
        Row: {
          created_at: string
          public_id: string
          transformation: string | null
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          public_id: string
          transformation?: string | null
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          public_id?: string
          transformation?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      user_info: {
        Row: {
          avatar_public_id: string | null
          avatar_version: string | null
          bio: string | null
          country_code: string | null
          created_at: string
          display_currency: string | null
          distance_unit: string | null
          full_name: string | null
          id: string
          is_admin: boolean
          locale: string | null
          organizer_verification_case_id: string | null
          organizer_verified: boolean
          organizer_verified_at: string | null
          search_tsv: unknown
          status_id: number
          updated_at: string
          username: string | null
          username_is_generated: boolean
          website: string | null
        }
        Insert: {
          avatar_public_id?: string | null
          avatar_version?: string | null
          bio?: string | null
          country_code?: string | null
          created_at?: string
          display_currency?: string | null
          distance_unit?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean
          locale?: string | null
          organizer_verification_case_id?: string | null
          organizer_verified?: boolean
          organizer_verified_at?: string | null
          search_tsv?: unknown
          status_id?: number
          updated_at?: string
          username?: string | null
          username_is_generated?: boolean
          website?: string | null
        }
        Update: {
          avatar_public_id?: string | null
          avatar_version?: string | null
          bio?: string | null
          country_code?: string | null
          created_at?: string
          display_currency?: string | null
          distance_unit?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          locale?: string | null
          organizer_verification_case_id?: string | null
          organizer_verified?: boolean
          organizer_verified_at?: string | null
          search_tsv?: unknown
          status_id?: number
          updated_at?: string
          username?: string | null
          username_is_generated?: boolean
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_info_display_currency_fkey"
            columns: ["display_currency"]
            isOneToOne: false
            referencedRelation: "currency"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_info_organizer_verification_case_id_fkey"
            columns: ["organizer_verification_case_id"]
            isOneToOne: false
            referencedRelation: "verification_case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_info_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "user_status"
            referencedColumns: ["id"]
          },
        ]
      }
      user_referral: {
        Row: {
          bound_at: string
          code: string
          qualified_at: string | null
          qualified_via: string | null
          referee_user_id: string
          referrer_user_id: string
          reward_event_id: string | null
          source: string
          status: string
          updated_at: string
          welcome_reward_event_id: string | null
        }
        Insert: {
          bound_at?: string
          code: string
          qualified_at?: string | null
          qualified_via?: string | null
          referee_user_id: string
          referrer_user_id: string
          reward_event_id?: string | null
          source: string
          status?: string
          updated_at?: string
          welcome_reward_event_id?: string | null
        }
        Update: {
          bound_at?: string
          code?: string
          qualified_at?: string | null
          qualified_via?: string | null
          referee_user_id?: string
          referrer_user_id?: string
          reward_event_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          welcome_reward_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_referral_referee_user_id_fkey"
            columns: ["referee_user_id"]
            isOneToOne: true
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_referral_referee_user_id_fkey"
            columns: ["referee_user_id"]
            isOneToOne: true
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_referral_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_referral_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_referral_reward_event_id_fkey"
            columns: ["reward_event_id"]
            isOneToOne: false
            referencedRelation: "reward_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_referral_welcome_reward_event_id_fkey"
            columns: ["welcome_reward_event_id"]
            isOneToOne: false
            referencedRelation: "reward_event"
            referencedColumns: ["id"]
          },
        ]
      }
      user_status: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      verification_case: {
        Row: {
          applicant_note: string | null
          claim_request_id: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          decision_reason: string | null
          id: string
          info_requested_at: string | null
          legal_name: string | null
          organizer_type: string | null
          organizer_user_id: string | null
          place_id: string | null
          requester_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          source: string
          status: string
          subject_id: string | null
          subject_snapshot: Json | null
          subject_type: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          applicant_note?: string | null
          claim_request_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          decision_reason?: string | null
          id?: string
          info_requested_at?: string | null
          legal_name?: string | null
          organizer_type?: string | null
          organizer_user_id?: string | null
          place_id?: string | null
          requester_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source?: string
          status?: string
          subject_id?: string | null
          subject_snapshot?: Json | null
          subject_type: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          applicant_note?: string | null
          claim_request_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          decision_reason?: string | null
          id?: string
          info_requested_at?: string | null
          legal_name?: string | null
          organizer_type?: string | null
          organizer_user_id?: string | null
          place_id?: string | null
          requester_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source?: string
          status?: string
          subject_id?: string | null
          subject_snapshot?: Json | null
          subject_type?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_case_claim_request_id_fkey"
            columns: ["claim_request_id"]
            isOneToOne: false
            referencedRelation: "place_claim_request"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_case_organizer_user_id_fkey"
            columns: ["organizer_user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_case_organizer_user_id_fkey"
            columns: ["organizer_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "verification_case_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_case_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_case_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      verification_event: {
        Row: {
          actor_id: string | null
          actor_kind: string
          case_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: number
          meta: Json | null
          reason: string | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          case_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: never
          meta?: Json | null
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          case_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: never
          meta?: Json | null
          reason?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_event_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "verification_case"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_evidence: {
        Row: {
          case_id: string
          created_at: string
          evidence_type: string
          file_name: string | null
          id: string
          mime_type: string
          purged_at: string | null
          size_bytes: number
          status: string
          storage_path: string
          uploaded_at: string | null
          uploaded_by: string
        }
        Insert: {
          case_id: string
          created_at?: string
          evidence_type: string
          file_name?: string | null
          id?: string
          mime_type: string
          purged_at?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          uploaded_at?: string | null
          uploaded_by: string
        }
        Update: {
          case_id?: string
          created_at?: string
          evidence_type?: string
          file_name?: string | null
          id?: string
          mime_type?: string
          purged_at?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          uploaded_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "verification_case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_evidence_evidence_type_fkey"
            columns: ["evidence_type"]
            isOneToOne: false
            referencedRelation: "verification_evidence_type"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "verification_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      verification_evidence_type: {
        Row: {
          active: boolean
          applies_to: string[]
          description: string | null
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          applies_to?: string[]
          description?: string | null
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          applies_to?: string[]
          description?: string | null
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      verification_program_setting: {
        Row: {
          audience: string
          beta_user_ids: string[]
          draft_expiry_days: number
          id: number
          max_evidence_files: number
          max_file_bytes: number
          organizer_requests_enabled: boolean
          organizer_types_enabled: string[]
          place_requests_enabled: boolean
          retention_days_after_revoke: number
          retention_days_unapproved: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          beta_user_ids?: string[]
          draft_expiry_days?: number
          id?: number
          max_evidence_files?: number
          max_file_bytes?: number
          organizer_requests_enabled?: boolean
          organizer_types_enabled?: string[]
          place_requests_enabled?: boolean
          retention_days_after_revoke?: number
          retention_days_unapproved?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          beta_user_ids?: string[]
          draft_expiry_days?: number
          id?: number
          max_evidence_files?: number
          max_file_bytes?: number
          organizer_requests_enabled?: boolean
          organizer_types_enabled?: string[]
          place_requests_enabled?: boolean
          retention_days_after_revoke?: number
          retention_days_unapproved?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      wallet: {
        Row: {
          balance: number | null
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          currency: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_p0: {
        Row: {
          balance: number | null
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          currency: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_p1: {
        Row: {
          balance: number | null
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          currency: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_p2: {
        Row: {
          balance: number | null
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          currency: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_p3: {
        Row: {
          balance: number | null
          created_at: string
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          currency: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      web_push_subscription: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_edition: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          duplicated_from_edition_id: string | null
          id: string
          intro: string | null
          published_at: string | null
          published_by: string | null
          scheduled_for: string | null
          scope_id: string
          status: string
          subtitle: string | null
          title: string
          unpublished_at: string | null
          updated_at: string
          version: number
          week_start: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          duplicated_from_edition_id?: string | null
          id?: string
          intro?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          scope_id: string
          status?: string
          subtitle?: string | null
          title: string
          unpublished_at?: string | null
          updated_at?: string
          version?: number
          week_start: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          duplicated_from_edition_id?: string | null
          id?: string
          intro?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          scope_id?: string
          status?: string
          subtitle?: string | null
          title?: string
          unpublished_at?: string | null
          updated_at?: string
          version?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_edition_duplicated_from_edition_id_fkey"
            columns: ["duplicated_from_edition_id"]
            isOneToOne: false
            referencedRelation: "weekly_edition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_edition_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "weekly_scope"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_item: {
        Row: {
          added_by: string | null
          blurb: string | null
          created_at: string
          edition_id: string
          headline: string | null
          id: string
          pinned: boolean
          position: number
          score: number | null
          score_breakdown: Json | null
          section_id: string
          source: string
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          blurb?: string | null
          created_at?: string
          edition_id: string
          headline?: string | null
          id?: string
          pinned?: boolean
          position: number
          score?: number | null
          score_breakdown?: Json | null
          section_id: string
          source?: string
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          blurb?: string | null
          created_at?: string
          edition_id?: string
          headline?: string | null
          id?: string
          pinned?: boolean
          position?: number
          score?: number | null
          score_breakdown?: Json | null
          section_id?: string
          source?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_item_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "weekly_edition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_item_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "weekly_section"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_program_setting: {
        Row: {
          audience: string
          beta_user_ids: string[]
          default_publish_hour_local: number
          edition_retention_weeks: number
          enabled: boolean
          exposure_lookback_editions: number
          id: number
          max_items_per_section: number
          max_per_organizer_per_section: number
          teaser_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string
          beta_user_ids?: string[]
          default_publish_hour_local?: number
          edition_retention_weeks?: number
          enabled?: boolean
          exposure_lookback_editions?: number
          id?: number
          max_items_per_section?: number
          max_per_organizer_per_section?: number
          teaser_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          beta_user_ids?: string[]
          default_publish_hour_local?: number
          edition_retention_weeks?: number
          enabled?: boolean
          exposure_lookback_editions?: number
          id?: number
          max_items_per_section?: number
          max_per_organizer_per_section?: number
          teaser_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      weekly_scope: {
        Row: {
          centre: unknown
          centre_lat: number | null
          centre_lng: number | null
          country_code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          position: number
          radius_km: number | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          centre?: unknown
          centre_lat?: number | null
          centre_lng?: number | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          position?: number
          radius_km?: number | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          centre?: unknown
          centre_lat?: number | null
          centre_lng?: number | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          position?: number
          radius_km?: number | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      weekly_section: {
        Row: {
          body: string | null
          config: Json
          created_at: string
          edition_id: string
          icon_key: string | null
          id: string
          is_visible: boolean
          kind: string
          layout: string
          position: number
          subject_scope: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          config?: Json
          created_at?: string
          edition_id: string
          icon_key?: string | null
          id?: string
          is_visible?: boolean
          kind?: string
          layout?: string
          position: number
          subject_scope?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          config?: Json
          created_at?: string
          edition_id?: string
          icon_key?: string | null
          id?: string
          is_visible?: boolean
          kind?: string
          layout?: string
          position?: number
          subject_scope?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_section_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "weekly_edition"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_report_group: {
        Row: {
          categories: string[] | null
          dedupe_key: string | null
          latest_created_at: string | null
          open_count: number | null
          priority_rank: number | null
          report_count: number | null
          target_id: string | null
          target_type: string | null
        }
        Relationships: []
      }
      app_request_metric_hourly: {
        Row: {
          bucket: string | null
          err_count: number | null
          ok_count: number | null
          p50_ms: number | null
          p95_ms: number | null
          platform: string | null
          total: number | null
        }
        Relationships: []
      }
      user_profile_details: {
        Row: {
          avatar_public_id: string | null
          avatar_version: string | null
          average_rating: number | null
          bio: string | null
          full_name: string | null
          total_favorites: number | null
          total_posts: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: []
      }
      wallet_public: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profile_details"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Functions: {
      _content_hashtags_text: { Args: { p_tags: string[] }; Returns: string }
      _credit_draw_lots: {
        Args: {
          p_amount_minor: number
          p_preferred_lot: string
          p_scopes: string[]
          p_terminal_status: string
          p_user_id: string
        }
        Returns: {
          drawn_minor: number
          lot_id: string
        }[]
      }
      _credit_ensure_account: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      _credit_entry: {
        Args: {
          p_amount_minor: number
          p_journal_id: string
          p_ledger_id: string
          p_lot_id: string
        }
        Returns: undefined
      }
      _credit_expire_lot: { Args: { p_lot_id: string }; Returns: number }
      _credit_first_order_eligible: {
        Args: { p_order_total_minor: number; p_user_id: string }
        Returns: boolean
      }
      _credit_home_currency: { Args: { p_user_id: string }; Returns: string }
      _credit_scopes_for: { Args: { p_scope: string }; Returns: string[] }
      _credit_scopes_for_user: {
        Args: {
          p_order_total_minor: number
          p_scope: string
          p_user_id: string
        }
        Returns: string[]
      }
      _credit_system_ledger_id: {
        Args: { p_code: string; p_currency?: string }
        Returns: string
      }
      _credit_user_ledger_id: {
        Args: { p_code: string; p_user_id: string }
        Returns: string
      }
      _event_settles_at: { Args: { p_event_id: string }; Returns: string }
      _fieldops_notify: {
        Args: {
          p_body: string
          p_route: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      _normalized_email: { Args: { p_email: string }; Returns: string }
      _notification_delivery_due: {
        Args: { p_limit: number }
        Returns: number[]
      }
      _notification_optional_category: {
        Args: { p_type: string }
        Returns: string
      }
      _payment_fingerprint: { Args: { p_response: Json }; Returns: string }
      _payout_credit_review: {
        Args: { p_currency: string; p_organizer_id: string }
        Returns: Json
      }
      _place_visit_code_at: {
        Args: { p_place_id: string; p_window: number }
        Returns: string
      }
      _promoter_commission_post: {
        Args: { p_delta_minor: number; p_reward_event_id: string }
        Returns: undefined
      }
      _recommendation_email_allowed: {
        Args: { p_reason: string; p_user: string }
        Returns: boolean
      }
      _recommendation_push_allowed: {
        Args: { p_reason: string; p_user: string }
        Returns: boolean
      }
      _recommendation_reason_allowed: {
        Args: { p_reason: string; p_user: string }
        Returns: boolean
      }
      _recommendation_subject_suppression: {
        Args: { p_subject_id: string; p_subject_type: string }
        Returns: string
      }
      _recommendation_suppression: {
        Args: { p_subject_id: string; p_subject_type: string; p_user: string }
        Returns: string
      }
      _referral_bind_block_reason: {
        Args: { p_bind_within_days: number; p_referee: string }
        Returns: string
      }
      _referral_display_name: { Args: { p_user_id: string }; Returns: string }
      _reward_accrue: { Args: { p_id: string }; Returns: string }
      _reward_commit_budget: {
        Args: { p_amount_minor: number }
        Returns: string
      }
      _reward_dispatch: {
        Args: { p_aggregate_id: string; p_event_type: string }
        Returns: undefined
      }
      _reward_evaluate_event_referral: {
        Args: { p_checkout_id: string }
        Returns: string
      }
      _reward_evaluate_promoter_commission: {
        Args: { p_checkout_id: string }
        Returns: string
      }
      _reward_event_rebate_basis: {
        Args: { p_event_id: string; p_owners: string[] }
        Returns: Json
      }
      _reward_event_unique_buyers: {
        Args: { p_event_id: string; p_organizer: string }
        Returns: number
      }
      _reward_friend_decide: {
        Args: {
          p_basis: Json
          p_event_id: string
          p_path: string
          p_referee: string
          p_release_at: string
          p_source_id: string
          p_source_type: string
          p_transaction_id: string
        }
        Returns: string
      }
      _reward_friend_qualify_claim: {
        Args: { p_claim_id: string }
        Returns: string
      }
      _reward_friend_qualify_order: {
        Args: { p_checkout_id: string }
        Returns: string
      }
      _reward_friend_qualify_organizer: {
        Args: { p_event_id: string }
        Returns: string
      }
      _reward_grant_welcome: { Args: { p_referee: string }; Returns: string }
      _reward_loyalty_cycle_start: {
        Args: {
          p_at: string
          p_shadow: boolean
          p_user_id: string
          p_window_days: number
        }
        Returns: string
      }
      _reward_loyalty_evaluate: {
        Args: { p_checkout_id: string }
        Returns: string
      }
      _reward_loyalty_events: {
        Args: { p_min_minor: number; p_since: string; p_user_id: string }
        Returns: {
          event_id: string
          first_paid_at: string
        }[]
      }
      _reward_milestone_evaluate: {
        Args: { p_event_id: string; p_period: string }
        Returns: string
      }
      _reward_notify: {
        Args: {
          p_body: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      _reward_place_visits_evaluate: {
        Args: { p_period: string; p_place_id: string }
        Returns: string
      }
      _reward_rebate_evaluate: {
        Args: { p_event_id: string; p_period: string; p_rule_key: string }
        Returns: string
      }
      _reward_risk_weight: {
        Args: { p_flag: string; p_weights: Json }
        Returns: number
      }
      _reward_same_person_flags: {
        Args: { p_a: string; p_b: string }
        Returns: string[]
      }
      _reward_settle_one: {
        Args: { p_id: string; p_mode: string }
        Returns: string
      }
      _reward_void: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      _search_concept_alternatives: {
        Args: { p_phrase: string; p_scope: string }
        Returns: unknown
      }
      _search_event_in_window: {
        Args: {
          p_ends_at: string
          p_event_id: string
          p_from: string
          p_starts_at: string
          p_to: string
        }
        Returns: boolean
      }
      _search_event_pool: {
        Args: {
          p_as_of: string
          p_category: string
          p_limit: number
          p_norm: string
          p_organizer_id: string
          p_origin: unknown
          p_radius_km: number
        }
        Returns: {
          id: string
          text_score: number
        }[]
      }
      _search_is_stopword: { Args: { p_word: string }; Returns: boolean }
      _search_like_escape: { Args: { p_text: string }; Returns: string }
      _search_normalize: { Args: { p_query: string }; Returns: string }
      _search_organizer_pool: {
        Args: { p_handle: string; p_limit: number; p_norm: string }
        Returns: {
          id: string
          text_score: number
        }[]
      }
      _search_place_pool: {
        Args: {
          p_category_id: number
          p_limit: number
          p_norm: string
          p_origin: unknown
          p_radius_km: number
        }
        Returns: {
          id: string
          text_score: number
        }[]
      }
      _search_prefix_tsquery: { Args: { p_norm: string }; Returns: unknown }
      _search_related_tsquery: {
        Args: { p_norm: string; p_scope: string }
        Returns: unknown
      }
      _search_relaxed_tsquery: { Args: { p_norm: string }; Returns: unknown }
      _search_temporal: {
        Args: { p_as_of: string; p_norm: string; p_timezone?: string }
        Returns: {
          date_from: string
          date_to: string
          rest: string
        }[]
      }
      _search_trgm_thresholds: { Args: never; Returns: undefined }
      _search_web_tsquery: { Args: { p_norm: string }; Returns: unknown }
      _user_timezone: { Args: { p_user_id: string }; Returns: string }
      _weekly_document_has_content: { Args: { p_doc: Json }; Returns: boolean }
      account_deletion_blockers: { Args: { p_user_id: string }; Returns: Json }
      account_is_restricted: { Args: never; Returns: boolean }
      account_setup_prompt_dismiss: {
        Args: never
        Returns: {
          dismiss_count: number
          dismissed_at: string
        }[]
      }
      admin_clear_payout_review: {
        Args: { p_admin_id: string; p_note: string; p_payout_id: string }
        Returns: string
      }
      admin_create_payout: {
        Args: {
          p_amount: number
          p_currency: string
          p_organizer_id: string
          p_payout_account_id: string
        }
        Returns: {
          payout_id: string
          reference: string
        }[]
      }
      admin_dashboard_counts: { Args: never; Returns: Json }
      admin_dashboard_kpis: {
        Args: {
          p_currency?: string
          p_from: string
          p_prev_from: string
          p_prev_to: string
          p_to: string
        }
        Returns: Json
      }
      admin_effective_permissions: { Args: never; Returns: string[] }
      admin_fieldops_commission_totals: {
        Args: { p_campaign_id?: string }
        Returns: Json
      }
      admin_finance_overview: {
        Args: {
          p_currency?: string
          p_from: string
          p_prev_from: string
          p_prev_to: string
          p_to: string
        }
        Returns: Json
      }
      admin_has_permission: { Args: { p_permission: string }; Returns: boolean }
      admin_organizer_balance: {
        Args: { p_organizer_id?: string }
        Returns: Json
      }
      admin_platform_analytics: {
        Args: {
          p_bucket: string
          p_currency?: string
          p_from: string
          p_prev_from: string
          p_prev_to: string
          p_to: string
        }
        Returns: Json
      }
      admin_recommendation_metrics: { Args: { p_days?: number }; Returns: Json }
      admin_rewards_overview: {
        Args: { p_currency?: string; p_from: string; p_to: string }
        Returns: Json
      }
      admin_search_concept_preview: {
        Args: { p_applies_to: string[]; p_expands_to: string[]; p_term: string }
        Returns: Json
      }
      admin_search_insights: { Args: { p_days?: number }; Returns: Json }
      admin_search_vocabulary_gaps: {
        Args: { p_days?: number; p_limit?: number }
        Returns: Json
      }
      admin_settle_payout: {
        Args: {
          p_failure_reason?: string
          p_payout_id: string
          p_status: string
        }
        Returns: string
      }
      admin_transaction_refundable_amounts: {
        Args: { p_transaction_ids: string[] }
        Returns: {
          refundable: number
          transaction_id: string
        }[]
      }
      admin_user_demographics: {
        Args: {
          p_from: string
          p_prev_from: string
          p_prev_to: string
          p_to: string
        }
        Returns: Json
      }
      anonymize_deleted_account: { Args: { p_user_id: string }; Returns: Json }
      apply_moderation_action: {
        Args: {
          p_action: string
          p_actor_id: string
          p_idempotency_key: string
          p_reason: string
          p_report_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      approve_place_claim: {
        Args: { p_admin_id: string; p_request_id: string }
        Returns: undefined
      }
      approve_place_claim_and_verify: {
        Args: { p_admin_id: string; p_request_id: string }
        Returns: string
      }
      archive_or_delete_expired_event: {
        Args: { p_event_id: string }
        Returns: Json
      }
      block_participant: {
        Args: {
          p_block?: boolean
          p_blocked_id: string
          p_conversation_id: string
        }
        Returns: undefined
      }
      cancel_event_and_release_tickets: {
        Args: { p_event_id: string }
        Returns: {
          attendee_user_id: string
          event_title: string
          provider: string
          provider_reference: string
          refund_transaction_id: string
          transaction_amount: number
          transaction_currency: string
        }[]
      }
      claim_transaction_refund: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
      cleanup_expired_drafts: { Args: never; Returns: undefined }
      cleanup_rate_limit_buckets: { Args: never; Returns: undefined }
      cloudinary_cleanup_claim: {
        Args: { p_limit?: number }
        Returns: {
          cleanup_id: number
          public_id: string
          resource_type: string
        }[]
      }
      cloudinary_cleanup_enqueue: {
        Args: { p_public_id: string; p_resource_type: string }
        Returns: undefined
      }
      cloudinary_cleanup_finish: {
        Args: { p_detail?: string; p_ids: number[]; p_status: string }
        Returns: number
      }
      compute_event_promotion_end_date: {
        Args: { p_from_date: string; p_tier_id: number }
        Returns: string
      }
      compute_place_promotion_end_date: {
        Args: { p_from_date: string; p_tier_id: number }
        Returns: string
      }
      compute_subscription_end_date: {
        Args: { from_date: string; plan_id: number }
        Returns: string
      }
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      content_admin_overview: {
        Args: { p_currency?: string; p_from: string; p_to: string }
        Returns: Json
      }
      content_attribute_conversions: { Args: never; Returns: number }
      content_audience_refresh: { Args: never; Returns: Json }
      content_campaign_accrue: {
        Args: { p_campaign_id: string }
        Returns: number
      }
      content_campaign_activate_from_checkout: {
        Args: {
          p_checkout_id: string
          p_transaction_id: string
          p_user_id: string
        }
        Returns: Json
      }
      content_campaign_metrics: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      content_campaign_reconcile: { Args: never; Returns: Json }
      content_campaign_record_refund: {
        Args: {
          p_actor_id: string
          p_amount_minor: number
          p_campaign_id: string
          p_reason: string
        }
        Returns: Json
      }
      content_campaign_refundable_minor: {
        Args: { p_campaign_id: string }
        Returns: number
      }
      content_campaign_tick: { Args: never; Returns: Json }
      content_campaign_transition: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_campaign_id: string
          p_reason?: string
          p_to: string
        }
        Returns: {
          activated_at: string | null
          active_seconds: number
          advertiser_id: string
          budget_minor: number
          cancelled_at: string | null
          checkout_id: string | null
          click_count: number
          completed_at: string | null
          completion_count: number
          conversion_count: number
          cpm_minor: number
          created_at: string
          currency: string
          duration_days: number
          end_reason: string | null
          ends_at: string
          estimate_basis: string
          estimated_impressions: number
          estimated_reach_high: number
          estimated_reach_low: number
          id: string
          impression_count: number
          impression_goal: number
          last_accrued_at: string | null
          objective: string
          paid_minor: number
          pause_reason: string | null
          pause_source: string | null
          post_id: string
          pricing_version: number
          reach_count: number
          refund_requested_at: string | null
          refunded_minor: number
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spent_minor: number
          starts_at: string
          status: string
          targeting_categories: string[]
          targeting_location: unknown
          targeting_radius_km: number | null
          transaction_id: string | null
          updated_at: string
          version: number
          view_count: number
        }
        SetofOptions: {
          from: "*"
          to: "content_campaign"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      content_click_ingest: {
        Args: {
          p_campaign: string
          p_kind: string
          p_post_id: string
          p_viewer: string
          p_viewer_key: string
        }
        Returns: Json
      }
      content_feed: {
        Args: {
          p_as_of: string
          p_cursor_id: string
          p_cursor_score: number
          p_lat: number
          p_limit: number
          p_lng: number
          p_radius_km: number
          p_surface: string
          p_viewer: string
        }
        Returns: {
          post_id: string
          score: number
        }[]
      }
      content_housekeeping: { Args: never; Returns: Json }
      content_post_documents: {
        Args: { p_ids: string[]; p_viewer: string }
        Returns: {
          document: Json
          post_id: string
        }[]
      }
      content_post_insights: {
        Args: { p_days?: number; p_post_id: string }
        Returns: Json
      }
      content_post_is_public: {
        Args: {
          p_expires_at: string
          p_kind: string
          p_moderation_state: string
          p_published_at: string
          p_status: string
        }
        Returns: boolean
      }
      content_post_publish: {
        Args: { p_actor_id: string; p_post_id: string }
        Returns: string
      }
      content_publisher_eligible: {
        Args: {
          p_publisher_kind: string
          p_publisher_place_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      content_realtime_can_join: {
        Args: { p_post_id: string }
        Returns: boolean
      }
      content_rollup_stats: { Args: { p_batch?: number }; Returns: Json }
      content_sponsored_candidates: {
        Args: {
          p_lat: number
          p_limit: number
          p_lng: number
          p_viewer: string
          p_viewer_key: string
        }
        Returns: {
          campaign_id: string
          post_id: string
        }[]
      }
      content_story_tray: {
        Args: { p_viewer: string }
        Returns: {
          has_unseen: boolean
          is_self: boolean
          latest_at: string
          publisher_id: string
          publisher_kind: string
          story_count: number
          story_ids: string[]
        }[]
      }
      content_trending_refresh: { Args: never; Returns: number }
      content_upload_sweep_claim: {
        Args: { p_min_hours?: number }
        Returns: boolean
      }
      content_users_blocked: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      content_view_ingest: {
        Args: { p_events: Json; p_viewer: string; p_viewer_key: string }
        Returns: Json
      }
      create_event: {
        Args: {
          p_address: Json
          p_capacity: number
          p_client_request_id: string
          p_country_code?: string
          p_currency?: string
          p_description: string
          p_ends_at: string
          p_event_category: string
          p_event_code: string
          p_event_type: string[]
          p_featured: boolean
          p_flyer_public_id: string
          p_flyer_version: string
          p_latitude: number
          p_longitude: number
          p_organizer_id: string
          p_place_id?: string
          p_promo_codes: Json
          p_receiving_account: Json
          p_require_registration: boolean
          p_slug: string
          p_specific_dates: Json
          p_starts_at: string
          p_ticket_types: Json
          p_timezone?: string
          p_title: string
          p_website_url: string
        }
        Returns: string
      }
      create_place: {
        Args: {
          p_address: Json
          p_category_id: number
          p_client_request_id: string
          p_country_code?: string
          p_cover_public_id: string
          p_cover_version: string
          p_description: string
          p_latitude: number
          p_longitude: number
          p_name: string
          p_opening_hours: Json
          p_owner_id: string
          p_phone: string
          p_services: Json
          p_slug: string
          p_social_links: Json
          p_timezone?: string
          p_website_url: string
          p_whatsapp: string
        }
        Returns: string
      }
      create_ticket_checkout: {
        Args: {
          p_event_id: string
          p_expires_at: string
          p_lines: Json
          p_occurrence_id: string
          p_promo_code_id: string
          p_promo_code_text: string
          p_user_id: string
        }
        Returns: string
      }
      credit_capture_reservation: {
        Args: {
          p_label?: string
          p_reservation_id: string
          p_transaction_id: string
        }
        Returns: {
          captured_minor: number
          created: boolean
          journal_id: string
        }[]
      }
      credit_close_account: {
        Args: { p_actor_id?: string; p_actor_type?: string; p_user_id: string }
        Returns: undefined
      }
      credit_debit_available: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_allow_negative?: boolean
          p_amount_minor: number
          p_idempotency_key: string
          p_journal_type: string
          p_label?: string
          p_memo?: string
          p_preferred_lot?: string
          p_reward_event_id?: string
          p_source_id?: string
          p_source_type?: string
          p_user_id: string
        }
        Returns: {
          created: boolean
          debited_minor: number
          journal_id: string
          shortfall_minor: number
        }[]
      }
      credit_execute_adjustment: {
        Args: { p_approver: string; p_note?: string; p_request_id: string }
        Returns: string
      }
      credit_expire_due_lots: { Args: { p_limit?: number }; Returns: number }
      credit_grant: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_amount_minor: number
          p_expires_at?: string
          p_idempotency_key: string
          p_journal_type: string
          p_label?: string
          p_lot_kind: string
          p_memo?: string
          p_release_at?: string
          p_reward_event_id?: string
          p_source_id?: string
          p_source_type?: string
          p_spend_scope: string
          p_user_id: string
          p_withdrawable?: boolean
          p_withdrawable_at?: string
        }
        Returns: {
          created: boolean
          journal_id: string
          lot_id: string
        }[]
      }
      credit_grant_goodwill: {
        Args: {
          p_admin_id: string
          p_amount_minor: number
          p_expires_at?: string
          p_idempotency_key: string
          p_reason: string
          p_user_id: string
        }
        Returns: {
          created: boolean
          journal_id: string
          lot_id: string
        }[]
      }
      credit_reconciliation_checks: { Args: never; Returns: Json }
      credit_refund_redemption: {
        Args: {
          p_amount_minor: number
          p_label?: string
          p_transaction_id: string
        }
        Returns: {
          created: boolean
          journal_id: string
          refunded_minor: number
        }[]
      }
      credit_reject_adjustment: {
        Args: { p_admin: string; p_note: string; p_request_id: string }
        Returns: undefined
      }
      credit_release_lot: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_idempotency_key: string
          p_lot_id: string
          p_memo?: string
          p_release_minor?: number
        }
        Returns: {
          created: boolean
          journal_id: string
          released_minor: number
        }[]
      }
      credit_release_reservation: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_reason: string
          p_reservation_id: string
        }
        Returns: boolean
      }
      credit_release_stale_reservations: {
        Args: { p_limit?: number }
        Returns: number
      }
      credit_request_adjustment: {
        Args: {
          p_allow_negative?: boolean
          p_amount_minor: number
          p_direction: string
          p_expires_at?: string
          p_reason: string
          p_requested_by: string
          p_spend_scope?: string
          p_user_id: string
          p_user_label?: string
        }
        Returns: {
          request_id: string
          requires_second_approver: boolean
        }[]
      }
      credit_reserve: {
        Args: {
          p_amount_minor: number
          p_expires_at: string
          p_label?: string
          p_order_total_minor: number
          p_payment_attempt_id: string
          p_scope: string
          p_target_id: string
          p_target_type: string
          p_user_id: string
        }
        Returns: string
      }
      credit_set_account_status: {
        Args: {
          p_actor_id?: string
          p_reason: string
          p_status: string
          p_user_id: string
        }
        Returns: string
      }
      credit_spendable: {
        Args: {
          p_order_total_minor?: number
          p_scope: string
          p_user_id: string
        }
        Returns: Json
      }
      credit_void_lot: {
        Args: {
          p_actor_id?: string
          p_actor_type?: string
          p_idempotency_key: string
          p_lot_id: string
          p_memo?: string
        }
        Returns: {
          created: boolean
          journal_id: string
          voided_minor: number
        }[]
      }
      currency_minor_units: { Args: { p_currency: string }; Returns: number }
      default_market_country: { Args: never; Returns: string }
      default_market_currency: { Args: never; Returns: string }
      default_market_timezone: { Args: never; Returns: string }
      delete_message: { Args: { p_message_id: string }; Returns: undefined }
      discovery_audience_includes: {
        Args: { p_audience: string; p_beta: string[]; p_user: string }
        Returns: boolean
      }
      edit_message: {
        Args: { p_content: string; p_message_id: string }
        Returns: undefined
      }
      ensure_future_review_partitions: { Args: never; Returns: undefined }
      event_capacity_check: { Args: { p_event_id: string }; Returns: undefined }
      event_reminders_enqueue: { Args: never; Returns: number }
      event_shared_capacity_left: {
        Args: { p_event_id: string }
        Returns: number
      }
      expire_stale_content_campaign_checkouts: {
        Args: never
        Returns: undefined
      }
      expire_stale_event_promotion_checkouts: {
        Args: never
        Returns: {
          completed_at: string | null
          created_at: string
          currency: string
          event_id: string
          expires_at: string | null
          id: string
          owner_id: string
          status: string
          tier_id: number
          total_price: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "event_promotion_checkout"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_stale_place_promotion_checkouts: {
        Args: never
        Returns: {
          completed_at: string | null
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          owner_id: string
          place_id: string
          status: string
          tier_id: number
          total_price: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "place_promotion_checkout"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_stale_subscription_checkouts: {
        Args: never
        Returns: {
          completed_at: string | null
          created_at: string
          currency: string
          discount: number | null
          expires_at: string | null
          id: string
          promo_code: string | null
          status: string
          subscription_plan_name: string | null
          total_price: number
          unit_price: number
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "subscription_checkout"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_stale_ticket_checkouts: {
        Args: never
        Returns: {
          checkout_session_id: string | null
          completed_at: string | null
          created_at: string | null
          discount: number | null
          discounted_units: number
          event_id: string | null
          expires_at: string | null
          id: string
          occurrence_id: string | null
          promo_code: string | null
          quantity: number
          referral_code: string | null
          referral_source: string | null
          referral_touched_at: string | null
          referrer_user_id: string | null
          status: string | null
          ticket_type_id: string | null
          total_price: number
          unit_price: number
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ticket_checkout"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fieldops_approve_payout_batch: {
        Args: { p_admin: string; p_batch_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          item_count: number
          label: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string
          status: string
          total_minor: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_payout_batch"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_bind_invited_memberships: {
        Args: { p_user_id: string }
        Returns: number
      }
      fieldops_build_payout_batch: {
        Args: {
          p_admin: string
          p_campaign_id: string
          p_label: string
          p_method?: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          item_count: number
          label: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string
          status: string
          total_minor: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_payout_batch"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_campaign_stats: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      fieldops_cancel_payout_batch: {
        Args: { p_admin: string; p_batch_id: string; p_reason: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          item_count: number
          label: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string
          status: string
          total_minor: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_payout_batch"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_commission_rule_set_active: {
        Args: {
          p_activity_key: string
          p_campaign_id: string
          p_rule_id: string
        }
        Returns: undefined
      }
      fieldops_daily_series: {
        Args: { p_campaign_id: string; p_from: string; p_to: string }
        Returns: {
          day: string
          earned_minor: number
          rejected: number
          submitted: number
          succeeded: number
          verified: number
        }[]
      }
      fieldops_decide_flag: {
        Args: {
          p_admin: string
          p_decision: string
          p_note?: string
          p_onboarding_id: string
        }
        Returns: {
          activity_key: string | null
          assignment_id: string | null
          business_name: string | null
          business_phone_e164: string | null
          business_whatsapp_e164: string | null
          campaign_id: string
          claim_request_id: string | null
          client_request_id: string
          created_at: string
          duplicate_acknowledged: boolean
          entity_created_at: string | null
          event_id: string | null
          flag_details: Json
          flags: string[]
          holding_until: string | null
          id: string
          inside_territory: boolean | null
          kind: string
          member_id: string
          member_user_id: string
          mode: string
          overridden_at: string | null
          overridden_by: string | null
          override_note: string | null
          owner_duplicate_waived_at: string | null
          owner_duplicate_waived_by: string | null
          owner_full_name: string | null
          owner_is_new_account: boolean | null
          owner_phone_e164: string | null
          owner_phone_verified_at: string | null
          owner_prior_events: number
          owner_prior_places: number
          owner_user_id: string | null
          place_id: string | null
          prospect_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          resubmission_count: number
          review_decision: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          similar_matches: Json
          status: string
          submission_accuracy_m: number | null
          submission_distance_m: number | null
          submission_lat: number | null
          submission_lng: number | null
          submission_location: unknown
          submitted_at: string | null
          succeeded_at: string | null
          team_id: string
          territory_id: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_onboarding"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_evaluate_onboarding: {
        Args: { p_onboarding_id: string }
        Returns: Json
      }
      fieldops_find_similar_places: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_name: string
          p_phone?: string
          p_radius_m?: number
          p_similarity?: number
          p_whatsapp?: string
        }
        Returns: {
          created_at: string
          distance_m: number
          id: string
          name: string
          owner_id: string
          phone_match: boolean
          similarity: number
          slug: string
          status: string
        }[]
      }
      fieldops_health: { Args: never; Returns: Json }
      fieldops_is_lead_of_team: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      fieldops_is_member: { Args: { p_campaign_id: string }; Returns: boolean }
      fieldops_mark_payout_item: {
        Args: {
          p_admin: string
          p_failure?: string
          p_item_id: string
          p_reference?: string
          p_status: string
        }
        Returns: {
          amount_minor: number
          batch_id: string
          campaign_id: string
          commission_count: number
          created_at: string
          currency: string
          destination_snapshot: Json
          failure_reason: string | null
          id: string
          member_id: string
          member_user_id: string
          paid_at: string | null
          paid_by: string | null
          payment_reference: string | null
          status: string
          transfer_code: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_payout_item"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_member_stats: {
        Args: { p_campaign_id: string }
        Returns: {
          assigned_days: number
          content_approved: number
          earned_minor: number
          full_name: string
          median_review_hours: number
          member_id: string
          member_user_id: string
          paid_minor: number
          prospects: number
          rejected: number
          role: string
          status: string
          submitted: number
          succeeded: number
          verified: number
        }[]
      }
      fieldops_memberships_for: {
        Args: { p_user_id: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          campaign_status: string
          currency: string
          joined_at: string
          membership_id: string
          region_id: string
          role: string
          status: string
          team_id: string
        }[]
      }
      fieldops_my_memberships: {
        Args: never
        Returns: {
          campaign_id: string
          campaign_name: string
          campaign_status: string
          currency: string
          joined_at: string
          membership_id: string
          region_id: string
          role: string
          status: string
          team_id: string
        }[]
      }
      fieldops_payout_reconciliation: { Args: never; Returns: Json }
      fieldops_phone_belongs_to_member: {
        Args: { p_phone_e164: string }
        Returns: boolean
      }
      fieldops_program_enabled: { Args: never; Returns: boolean }
      fieldops_record_pending_commission: {
        Args: { p_onboarding_id: string }
        Returns: {
          activity_key: string
          amount_minor: number
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          content_submission_id: string | null
          created_at: string
          currency: string
          earned_at: string
          id: string
          idempotency_key: string
          member_id: string
          member_user_id: string
          onboarding_id: string | null
          paid_at: string | null
          payout_item_id: string | null
          period_start: string | null
          rejected_at: string | null
          rejection_reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          reverses_commission_id: string | null
          rule_id: string | null
          rule_version: number | null
          status: string
          team_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_commission"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_reverse_commission: {
        Args: { p_admin: string; p_commission_id: string; p_reason: string }
        Returns: {
          activity_key: string
          amount_minor: number
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
          content_submission_id: string | null
          created_at: string
          currency: string
          earned_at: string
          id: string
          idempotency_key: string
          member_id: string
          member_user_id: string
          onboarding_id: string | null
          paid_at: string | null
          payout_item_id: string | null
          period_start: string | null
          rejected_at: string | null
          rejection_reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          reverses_commission_id: string | null
          rule_id: string | null
          rule_version: number | null
          status: string
          team_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_commission"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_review_content: {
        Args: {
          p_decision: string
          p_note?: string
          p_reviewer: string
          p_submission_id: string
        }
        Returns: {
          brief_id: string | null
          campaign_id: string
          caption: string | null
          created_at: string
          holding_until: string | null
          id: string
          member_id: string
          member_user_id: string
          platform: string
          posted_at: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          self_reported_metrics: Json
          status: string
          team_id: string
          updated_at: string
          url: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_content_submission"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_run_eligibility_sweep: {
        Args: { p_limit?: number }
        Returns: Json
      }
      fieldops_run_housekeeping: { Args: never; Returns: Json }
      fieldops_run_monthly_stipends: {
        Args: { p_admin: string; p_campaign_id: string; p_period_start: string }
        Returns: Json
      }
      fieldops_set_campaign_status: {
        Args: { p_actor: string; p_campaign_id: string; p_status: string }
        Returns: {
          activated_at: string | null
          archived_at: string | null
          budget_cap_minor: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          ends_on: string | null
          holding_days_override: number | null
          id: string
          name: string
          region_id: string
          slug: string
          starts_on: string | null
          status: string
          status_changed_at: string
          status_changed_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_campaign"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fieldops_sweep_content: { Args: { p_limit?: number }; Returns: Json }
      fieldops_territory_contains: {
        Args: { p_lat: number; p_lng: number; p_territory_id: string }
        Returns: boolean
      }
      fieldops_territory_stats: {
        Args: { p_campaign_id: string }
        Returns: {
          contacted: number
          covered: boolean
          name: string
          prospects: number
          rejected: number
          status: string
          submitted: number
          succeeded: number
          territory_id: string
        }[]
      }
      fieldops_transition_onboarding: {
        Args: {
          p_actor: string
          p_actor_kind: string
          p_details?: Json
          p_note?: string
          p_onboarding_id: string
          p_to: string
        }
        Returns: {
          activity_key: string | null
          assignment_id: string | null
          business_name: string | null
          business_phone_e164: string | null
          business_whatsapp_e164: string | null
          campaign_id: string
          claim_request_id: string | null
          client_request_id: string
          created_at: string
          duplicate_acknowledged: boolean
          entity_created_at: string | null
          event_id: string | null
          flag_details: Json
          flags: string[]
          holding_until: string | null
          id: string
          inside_territory: boolean | null
          kind: string
          member_id: string
          member_user_id: string
          mode: string
          overridden_at: string | null
          overridden_by: string | null
          override_note: string | null
          owner_duplicate_waived_at: string | null
          owner_duplicate_waived_by: string | null
          owner_full_name: string | null
          owner_is_new_account: boolean | null
          owner_phone_e164: string | null
          owner_phone_verified_at: string | null
          owner_prior_events: number
          owner_prior_places: number
          owner_user_id: string | null
          place_id: string | null
          prospect_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          resubmission_count: number
          review_decision: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          similar_matches: Json
          status: string
          submission_accuracy_m: number | null
          submission_distance_m: number | null
          submission_lat: number | null
          submission_lng: number | null
          submission_location: unknown
          submitted_at: string | null
          succeeded_at: string | null
          team_id: string
          territory_id: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fieldops_onboarding"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      follow_counts: {
        Args: { p_ids: string[]; p_kind: string }
        Returns: {
          follower_count: number
          target_id: string
        }[]
      }
      get_active_place_promotions: {
        Args: {
          p_limit?: number
          p_max_distance_km?: number
          p_user_lat?: number
          p_user_lng?: number
        }
        Returns: {
          address: Json
          avg_rating: number
          category_id: number
          category_name: string
          category_slug: string
          claimed: boolean
          cover_public_id: string
          cover_version: string
          created_at: string
          description: string
          distance_km: number
          id: string
          is_open: boolean
          location: unknown
          name: string
          owner_id: string
          phone: string
          promotion_ends_at: string
          review_count: number
          slug: string
          status: string
          temporary_status: string
          verified: boolean
          website_url: string
          whatsapp: string
        }[]
      }
      get_active_platform_fee_rate: {
        Args: { p_country_code?: string; p_currency?: string }
        Returns: number
      }
      get_auth_user_id_by_phone: { Args: { p_phone: string }; Returns: string }
      get_event_attendance_count: {
        Args: { p_event_id: string }
        Returns: number
      }
      get_event_attendance_counts: {
        Args: { p_event_ids: string[] }
        Returns: {
          attendance_count: number
          event_id: string
        }[]
      }
      get_event_attendee_contacts: {
        Args: { p_event_id: string }
        Returns: {
          email: string
          phone: string
          user_id: string
        }[]
      }
      get_event_cancellation_impact: {
        Args: { p_event_id: string }
        Returns: {
          attendee_count: number
          free_ticket_count: number
          paid_ticket_count: number
        }[]
      }
      get_event_date_analytics: {
        Args: { p_end_date?: string; p_event_id: string; p_start_date?: string }
        Returns: {
          ends_at: string
          occurrence_id: string
          revenue: number
          starts_at: string
          tickets_cancelled: number
          tickets_sold: number
        }[]
      }
      get_event_overview_analytics: {
        Args: { p_end_date?: string; p_event_id: string; p_start_date?: string }
        Returns: {
          capacity: number
          capacity_remaining: number
          currency: string
          distinct_attendees: number
          ends_at: string
          event_title: string
          gross_sales: number
          promo_purchase_count: number
          require_registration: boolean
          starts_at: string
          tickets_cancelled: number
          tickets_sold: number
          total_discount: number
        }[]
      }
      get_event_promo_analytics: {
        Args: { p_end_date?: string; p_event_id: string; p_start_date?: string }
        Returns: {
          orders: number
          promo_code: string
          total_discount: number
          total_revenue: number
          units_discounted: number
        }[]
      }
      get_event_rating: {
        Args: { p_event_id: string }
        Returns: {
          average_rating: number
          total_ratings: number
        }[]
      }
      get_event_refund_breakdown: {
        Args: { p_event_id: string }
        Returns: {
          completed_refund_amount: number
          currency: string
          pending_refund_amount: number
          refund_request_count: number
        }[]
      }
      get_event_returning_attendee_stats: {
        Args: { p_end_date?: string; p_event_id: string; p_start_date?: string }
        Returns: {
          first_time_count: number
          returning_count: number
        }[]
      }
      get_event_sales_timeline: {
        Args: { p_event_id: string }
        Returns: {
          gross: number
          orders: number
          sale_date: string
        }[]
      }
      get_event_suggestions: {
        Args: { p_limit?: number; p_search_text: string }
        Returns: {
          event_category: string
          event_code: string
          flyer_public_id: string
          flyer_version: string
          id: string
          slug: string
          starts_at: string
          title: string
        }[]
      }
      get_event_ticket_type_analytics: {
        Args: { p_end_date?: string; p_event_id: string; p_start_date?: string }
        Returns: {
          cancelled: number
          currency: string
          discount: number
          percent_sold: number
          price: number
          quantity_capacity: number
          revenue: number
          sold: number
          ticket_type_id: string
          type: string
        }[]
      }
      get_events_in_window: {
        Args: {
          p_cursor_id?: string
          p_cursor_starts_at?: string
          p_page_size?: number
          p_radius_km: number
          p_user_lat: number
          p_user_lng: number
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          address: Json
          capacity: number
          country_code: string
          created_at: string
          currency: string
          description: string
          ends_at: string
          event_category: string
          event_code: string
          event_type: string
          featured: boolean
          flyer_public_id: string
          flyer_version: string
          id: string
          location: unknown
          min_price: number
          occurrences: Json
          organizer_id: string
          slug: string
          starts_at: string
          status: string
          timezone: string
          title: string
          website_url: string
        }[]
      }
      get_filtered_events: {
        Args: {
          p_cursor_distance_km?: number
          p_cursor_id?: string
          p_cursor_starts_at?: string
          p_end_date: string
          p_event_category: string
          p_event_type: string[]
          p_max_distance_km: number
          p_max_price: number
          p_min_price: number
          p_min_rating: number
          p_page_size?: number
          p_search_text: string
          p_start_date: string
          p_user_lat: number
          p_user_lng: number
        }
        Returns: {
          address: Json
          attendance_count: number
          avg_rating: number
          capacity: number
          country_code: string
          created_at: string
          currency: string
          distance_km: number
          ends_at: string
          event_category: string
          event_code: string
          flyer_public_id: string
          flyer_version: string
          id: string
          location: unknown
          min_price: number
          occurrences: Json
          organizer_id: string
          starts_at: string
          status: string
          timezone: string
          title: string
        }[]
      }
      get_filtered_places: {
        Args: {
          p_category_id?: number
          p_cursor_distance?: number
          p_cursor_id?: string
          p_max_distance_km?: number
          p_min_rating?: number
          p_open_now?: boolean
          p_page_size?: number
          p_search_text?: string
          p_user_lat?: number
          p_user_lng?: number
        }
        Returns: {
          address: Json
          avg_rating: number
          category_id: number
          category_name: string
          category_slug: string
          claimed: boolean
          cover_public_id: string
          cover_version: string
          created_at: string
          cursor_distance_km: number
          description: string
          distance_km: number
          id: string
          is_open: boolean
          location: unknown
          name: string
          owner_id: string
          phone: string
          review_count: number
          slug: string
          status: string
          temporary_status: string
          verified: boolean
          website_url: string
          whatsapp: string
        }[]
      }
      get_my_credit_activity: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
        }
        Returns: {
          amount_minor: number
          created_at: string
          id: string
          journal_type: string
          label: string
          lot_expires_at: string
          lot_kind: string
          lot_release_at: string
          lot_status: string
          source_id: string
          source_type: string
        }[]
      }
      get_my_credit_summary: { Args: never; Returns: Json }
      get_nearby_events:
        | {
            Args: { search_radius: number; user_lat: number; user_lng: number }
            Returns: {
              address: Json
              capacity: number
              created_at: string
              currency: string
              description: string
              ends_at: string
              event_category: string
              event_code: string
              event_type: string
              featured: boolean
              flyer_public_id: string
              flyer_version: string
              id: string
              location: unknown
              min_price: number
              occurrences: Json
              organizer_id: string
              slug: string
              starts_at: string
              status: string
              title: string
              website_url: string
            }[]
          }
        | {
            Args: {
              p_cursor_id?: string
              p_cursor_sort_key?: string
              p_page_size?: number
              search_radius: number
              user_lat: number
              user_lng: number
            }
            Returns: {
              address: Json
              attendance_count: number
              capacity: number
              created_at: string
              currency: string
              cursor_sort_key: string
              ends_at: string
              event_category: string
              event_code: string
              event_type: string
              featured: boolean
              flyer_public_id: string
              flyer_version: string
              id: string
              location: unknown
              min_price: number
              occurrences: Json
              organizer_avg_rating: number
              organizer_id: string
              organizer_rating_count: number
              slug: string
              starts_at: string
              status: string
              ticket_types: Json
              title: string
              website_url: string
            }[]
          }
      get_nearby_places: {
        Args: {
          p_cursor_distance?: number
          p_cursor_id?: string
          p_page_size?: number
          search_radius: number
          user_lat: number
          user_lng: number
        }
        Returns: {
          address: Json
          avg_rating: number
          category_id: number
          category_name: string
          category_slug: string
          claimed: boolean
          cover_public_id: string
          cover_version: string
          created_at: string
          cursor_distance_km: number
          description: string
          distance_km: number
          id: string
          is_open: boolean
          location: unknown
          name: string
          owner_id: string
          phone: string
          review_count: number
          slug: string
          status: string
          temporary_status: string
          verified: boolean
          website_url: string
          whatsapp: string
        }[]
      }
      get_organizer_dashboard: {
        Args: {
          p_bucket: string
          // The four timestamps stay nullable: the function is not STRICT
          // (confirmed via pg_proc.proisstrict on 2026-09-12) and
          // organizerDashboardQuery.ts passes null for "all time". The
          // generator drops the `| null`; kept by hand so regeneration does
          // not break that caller (re-applied by hand on 2026-09-25).
          p_end: string | null
          p_prev_end: string | null
          p_prev_start: string | null
          p_start: string | null
        }
        Returns: Json
      }
      get_organizer_dashboard_overview: {
        Args: { p_end: string; p_start: string }
        Returns: {
          active_events_count: number
          currency: string
          distinct_purchasers: number
          gross_sales: number
          paid_orders: number
          registrations: number
          tickets_cancelled: number
          tickets_sold: number
          total_discount: number
          total_events_count: number
          upcoming_events_count: number
        }[]
      }
      get_organizer_event_performance: {
        Args: {
          p_end: string
          p_limit: number
          p_sort: string
          p_start: string
        }
        Returns: {
          capacity_remaining: number
          currency: string
          event_id: string
          revenue: number
          starts_at: string
          status: string
          tickets_sold: number
          title: string
        }[]
      }
      get_organizer_finance_overview: {
        Args: never
        Returns: {
          available_balance: number
          currency: string
          pending_balance: number
          total_earnings: number
        }[]
      }
      get_organizer_ledger_transactions: {
        Args: {
          p_cursor_created_at: string
          p_cursor_id: string
          p_limit: number
        }
        Returns: {
          amount: number
          created_at: string
          currency: string
          entry_id: string
          event_id: string
          event_title: string
          line: string
          reference: string
          status: string
        }[]
      }
      get_organizer_needs_attention: {
        Args: { p_days_soon?: number }
        Returns: {
          event_id: string
          event_title: string
          message: string
          rule_type: string
        }[]
      }
      get_organizer_pending_earnings: {
        Args: never
        Returns: {
          amount: number
          currency: string
          event_id: string
          event_title: string
        }[]
      }
      get_organizer_recent_activity: {
        Args: { p_limit: number }
        Returns: {
          activity_type: string
          detail: string
          event_id: string
          event_title: string
          occurred_at: string
        }[]
      }
      get_organizer_refund_breakdown: {
        Args: never
        Returns: {
          completed_refund_amount: number
          currency: string
          pending_refund_amount: number
          refund_request_count: number
        }[]
      }
      get_organizer_sales_timeline: {
        Args: {
          p_bucket: string
          p_currency?: string
          p_end: string
          p_start: string
        }
        Returns: {
          bucket_start: string
          gross: number
          orders: number
        }[]
      }
      get_organizer_upcoming_events: {
        Args: { p_limit: number }
        Returns: {
          capacity: number
          event_id: string
          min_ticket_type_percent_remaining: number
          next_occurrence_starts_at: string
          status: string
          tickets_sold: number
          title: string
        }[]
      }
      get_place_rating: {
        Args: { p_place_id: string }
        Returns: {
          average_rating: number
          total_ratings: number
        }[]
      }
      get_place_ratings: {
        Args: { p_place_ids: string[] }
        Returns: {
          average_rating: number
          place_id: string
          total_ratings: number
        }[]
      }
      get_place_suggestions: {
        Args: { p_limit?: number; p_search_text: string }
        Returns: {
          category_id: number
          cover_public_id: string
          cover_version: string
          id: string
          name: string
          slug: string
        }[]
      }
      get_public_profile: { Args: { p_username: string }; Returns: Json }
      get_rewards_program_public: { Args: never; Returns: Json }
      get_similar_events: {
        Args: {
          input_category: string
          input_location: unknown
          input_radius_km: number
        }
        Returns: {
          address: Json
          capacity: number
          country_code: string
          created_at: string
          description: string
          ends_at: string
          event_category: string
          event_code: string
          event_type: string
          flyer_public_id: string
          flyer_version: string
          id: string
          location: unknown
          occurrences: Json
          organizer_id: string
          require_registration: boolean
          slug: string
          starts_at: string
          status: string
          ticket_currency: string
          ticket_price: number
          timezone: string
          title: string
          website_url: string
        }[]
      }
      get_transaction_refundable_amount: {
        Args: { p_transaction_id: string }
        Returns: number
      }
      get_unread_conversation_count: { Args: never; Returns: number }
      get_user_rating: {
        Args: { p_reviewed_id: string }
        Returns: {
          average_rating: number
          total_ratings: number
        }[]
      }
      get_user_transaction_history: {
        Args: {
          p_cursor_created_at: string
          p_cursor_id: string
          p_end: string
          p_limit: number
          p_start: string
        }
        Returns: {
          amount: number
          cancelled_quantity: number
          completed_at: string
          created_at: string
          credit_used: number
          currency: string
          id: string
          kind: string
          quantity: number
          reference: string
          refund_requested_at: string
          refund_status: string
          service_fee: number
          status: string
          subtitle: string
          title: string
          total_paid: number
        }[]
      }
      get_user_transaction_summary: {
        Args: { p_end: string; p_start: string }
        Returns: {
          amount_spent: number
          currency: string
          failed_count: number
          pending_count: number
          subscriptions_count: number
          successful_count: number
          tickets_purchased: number
          total_transactions: number
        }[]
      }
      grant_admin_role: {
        Args: { p_actor_id: string; p_role_key: string; p_target_user: string }
        Returns: undefined
      }
      hidden_listing_countries: { Args: never; Returns: string[] }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id?: string }
        Returns: boolean
      }
      is_event_settled: { Args: { p_event_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      issue_free_ticket: {
        Args: {
          p_event_id: string
          p_expires_at: string
          p_occurrence_id: string
          p_qr_public_id: string
          p_qr_version: string
          p_ticket_code: string
          p_user_id: string
        }
        Returns: string
      }
      issue_tickets_for_checkout: {
        Args: {
          p_checkout_session_id: string
          p_metadata: Json
          p_ticket_expires_at: string
          p_tickets: Json
          p_transaction_id: string
          p_user_id: string
        }
        Returns: {
          already_issued: boolean
          ticket_id: string
        }[]
      }
      list_conversations: {
        Args: {
          p_cursor_id?: string
          p_cursor_ts?: string
          p_filter?: string
          p_limit?: number
          p_muted?: boolean
          p_role_scope?: string
          p_search?: string
          p_type?: string
        }
        Returns: {
          archived: boolean
          conversation_id: string
          created_at: string
          event_id: string
          last_message_at: string
          last_message_preview: string
          last_message_sender_id: string
          muted: boolean
          my_last_read_at: string
          my_role: string
          other_avatar_public_id: string
          other_avatar_version: string
          other_display_name: string
          other_participant_ids: string[]
          other_user_id: string
          other_username: string
          place_id: string
          status: string
          subject_title: string
          title: string
          type: string
          unread_count: number
        }[]
      }
      listing_market_visible: {
        Args: { p_country_code: string }
        Returns: boolean
      }
      loyalty_progress: { Args: { p_user_id: string }; Returns: Json }
      major_to_minor: {
        Args: { p_amount: number; p_currency: string }
        Returns: number
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string; p_up_to?: string }
        Returns: undefined
      }
      mark_conversation_unread: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      market_currency_for_country: {
        Args: { p_country_code: string }
        Returns: string
      }
      market_timezone_at: { Args: { p_origin: unknown }; Returns: string }
      market_timezone_for_country: {
        Args: { p_country_code: string }
        Returns: string
      }
      market_transition: {
        Args: {
          p_actor_id: string
          p_country_code: string
          p_expected_version?: number
          p_readiness_ok?: boolean
          p_reason?: string
          p_transition: string
        }
        Returns: {
          address_schema: Json | null
          centre_lat: number | null
          centre_lng: number | null
          country_code: string
          created_at: string
          default_currency: string
          default_locale: string
          default_timezone: string
          dial_code: string
          display_config: Json
          distance_unit: string
          fee_config: Json
          is_default: boolean
          launched_at: string | null
          legal_config: Json
          name: string
          otp_provider: string | null
          status: string
          supported_currencies: string[]
          supported_locales: string[]
          tax_config: Json
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "market"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      minor_to_major: {
        Args: { p_currency: string; p_minor: number }
        Returns: number
      }
      money_currencies_in_use: { Args: never; Returns: Json }
      money_round: {
        Args: { p_amount: number; p_currency: string }
        Returns: number
      }
      notification_delivery_claim: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          channel: string
          created_at: string
          data: Json
          delivery_id: number
          link: string
          notification_id: string
          source: string
          title: string
          type: string
          user_id: string
        }[]
      }
      notification_delivery_finish: {
        Args: { p_detail?: string; p_ids: number[]; p_status: string }
        Returns: number
      }
      open_conversation: {
        Args: { p_event_id?: string; p_place_id?: string; p_type: string }
        Returns: string
      }
      open_reconciliation_incident: {
        Args: {
          p_component: string
          p_severity: string
          p_summary: string
          p_title: string
        }
        Returns: undefined
      }
      phone_otp_claim_send: {
        Args: {
          p_cooldown_seconds: number
          p_ip_address: string | null
          p_per_ip_hour: number
          p_per_number_day: number
          p_per_number_hour: number
          p_phone_e164: string
        }
        Returns: Json
      }
      phone_otp_take_attempt: {
        Args: { p_max_attempts: number; p_phone_e164: string; p_purpose: string }
        Returns: boolean
      }
      place_is_open_now: {
        Args: { p_now?: string; p_place_id: string }
        Returns: boolean
      }
      place_visit_code: { Args: { p_place_id: string }; Returns: Json }
      place_visit_record: {
        Args: {
          p_accuracy_m: number
          p_code: string
          p_install_id: string
          p_lat: number
          p_lng: number
          p_mocked: boolean
          p_place_id: string
          p_platform: string
          p_user_id: string
        }
        Returns: Json
      }
      place_visit_stats: { Args: { p_place_id: string }; Returns: Json }
      promoter_commission_event_stats: {
        Args: { p_event_id: string }
        Returns: Json
      }
      purge_reviewed_claim_documents: {
        Args: { p_older_than?: string }
        Returns: number
      }
      purge_verification_evidence: { Args: never; Returns: Json }
      rebate_stats: { Args: { p_user_id: string }; Returns: Json }
      recommendation_digest_email_items: {
        Args: { p_notification_id: string }
        Returns: {
          image_public_id: string
          image_version: string
          organizer_username: string
          path: string
          reason_kind: string
          starts_at: string
          subject_id: string
          subject_type: string
          subtitle: string
          timezone: string
          title: string
        }[]
      }
      recommendation_dismiss: {
        Args: { p_subject_id: string; p_subject_type: string; p_user: string }
        Returns: Json
      }
      recommendation_mark_opened: {
        Args: {
          p_notification_id: string
          p_subject_id?: string
          p_subject_type?: string
          p_user: string
        }
        Returns: boolean
      }
      recommendations_build_digest: {
        Args: { p_force?: boolean; p_limit?: number }
        Returns: Json
      }
      recommendations_for_user: {
        Args: { p_limit?: number; p_user: string }
        Returns: {
          basis: Json
          created_at: string
          reason_kind: string
          recommendation_id: string
          score: number
          status: string
          subject_id: string
          subject_type: string
        }[]
      }
      recommendations_generate: { Args: { p_limit?: number }; Returns: Json }
      recommendations_purge: { Args: never; Returns: Json }
      record_device_install: {
        Args: { p_install_id: string; p_platform: string; p_user_id: string }
        Returns: undefined
      }
      record_fee_refund_adjustment: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      record_organizer_earning: {
        Args: { p_ticket_checkout_id: string }
        Returns: undefined
      }
      record_payment_dispute: {
        Args: {
          p_amount_minor: number
          p_currency: string
          p_event: string
          p_provider?: string
          p_provider_dispute_id: string
          p_provider_reference: string
          p_raw: Json
          p_resolution: string
          p_status: string
        }
        Returns: string
      }
      record_payout_reversal: {
        Args: { p_payout_id: string; p_reason?: string }
        Returns: string
      }
      record_platform_fee: {
        Args: { p_processing_cost?: number; p_transaction_id: string }
        Returns: undefined
      }
      record_refund_adjustment: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      record_refund_hold: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      record_refund_release: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      recover_stale_payment_attempts: { Args: never; Returns: undefined }
      referral_bind: {
        Args: { p_code: string; p_referee: string; p_source: string }
        Returns: Json
      }
      referral_ensure_code: { Args: { p_user_id: string }; Returns: string }
      referral_purge_old_touches: { Args: never; Returns: number }
      referral_record_touch: {
        Args: {
          p_code: string
          p_event_id: string
          p_install_id: string
          p_ip_hash: string
          p_place_id: string
          p_platform: string
          p_source: string
          p_ua_hash: string
          p_visitor_user_id: string
        }
        Returns: string
      }
      referral_resolve_code: { Args: { p_code: string }; Returns: Json }
      referral_stats: { Args: { p_user_id: string }; Returns: Json }
      release_transaction_refund_claim: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      request_organizer_payout: {
        Args: {
          p_amount: number
          p_currency: string
          p_payout_account_id: string
        }
        Returns: {
          payout_id: string
          reference: string
        }[]
      }
      resolve_report: {
        Args: {
          p_action: string
          p_actor_id: string
          p_report_id: string
          p_resolution: string
          p_status: string
        }
        Returns: Json
      }
      review_list: {
        Args: {
          p_after_created?: string
          p_after_helpful?: number
          p_after_id?: string
          p_exclude_viewer?: boolean
          p_limit?: number
          p_rating?: number
          p_review_id?: string
          p_sort?: string
          p_subject_id: string
          p_subject_kind: string
        }
        Returns: {
          comment: string
          created_at: string
          edited_at: string
          helpful_count: number
          id: string
          is_verified_attendee: boolean
          photos: Json
          rating: number
          response: string
          response_at: string
          reviewer_avatar_public_id: string
          reviewer_avatar_version: string
          reviewer_deleted: boolean
          reviewer_full_name: string
          reviewer_id: string
          reviewer_username: string
          subject_id: string
          title: string
          viewer_found_helpful: boolean
        }[]
      }
      review_set_helpful: {
        Args: { p_helpful: boolean; p_review_id: string; p_review_kind: string }
        Returns: {
          helpful_count: number
          viewer_found_helpful: boolean
        }[]
      }
      review_summary: {
        Args: { p_subject_id: string; p_subject_kind: string }
        Returns: {
          average_rating: number
          count_1: number
          count_2: number
          count_3: number
          count_4: number
          count_5: number
          total_ratings: number
        }[]
      }
      revoke_admin_role: {
        Args: { p_actor_id: string; p_role_key: string; p_target_user: string }
        Returns: undefined
      }
      reward_review_decision: {
        Args: {
          p_admin_id: string
          p_approve: boolean
          p_note: string
          p_reward_event_id: string
        }
        Returns: string
      }
      reward_rule_set_active: {
        Args: { p_rule_id: string; p_rule_key: string }
        Returns: undefined
      }
      rewards_enabled_for_user: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      rewards_health: { Args: never; Returns: Json }
      rewards_notify_pending: { Args: never; Returns: number }
      rewards_process_outbox: { Args: { p_limit?: number }; Returns: number }
      rewards_run_monthly_rebates: {
        Args: { p_period_start?: string; p_triggered_by?: string }
        Returns: Json
      }
      rewards_settle_due: { Args: { p_limit?: number }; Returns: Json }
      run_exchange_rate_refresh: { Args: never; Returns: undefined }
      run_financial_reconciliation: { Args: never; Returns: Json }
      run_notification_delivery: { Args: never; Returns: undefined }
      run_scheduled_health_check: { Args: never; Returns: undefined }
      run_storage_purge_dispatch: { Args: never; Returns: undefined }
      search_events: {
        Args: {
          p_as_of?: string
          p_category?: string
          p_cursor_id?: string
          p_cursor_score?: number
          p_end_date?: string
          p_lat?: number
          p_lng?: number
          p_max_price?: number
          p_min_price?: number
          p_min_rating?: number
          p_organizer_id?: string
          p_page_size?: number
          p_query: string
          p_radius_km?: number
          p_start_date?: string
          p_types?: string[]
        }
        Returns: {
          address: Json
          as_of: string
          attendance_count: number
          avg_rating: number
          capacity: number
          country_code: string
          created_at: string
          currency: string
          distance_km: number
          ends_at: string
          event_category: string
          event_code: string
          flyer_public_id: string
          flyer_version: string
          id: string
          is_new: boolean
          location: unknown
          min_price: number
          occurrences: Json
          organizer_id: string
          organizer_username: string
          organizer_verified: boolean
          score: number
          starts_at: string
          status: string
          timezone: string
          title: string
        }[]
      }
      search_log_click: {
        Args: {
          p_entity_id: string
          p_id: number
          p_rank: number
          p_type: string
        }
        Returns: boolean
      }
      search_log_purge: { Args: { p_days?: number }; Returns: number }
      search_log_record: {
        Args: {
          p_event_count: number
          p_has_filters: boolean
          p_has_location: boolean
          p_latency_ms: number
          p_organizer_count: number
          p_place_count: number
          p_platform: string
          p_query: string
          p_surface: string
        }
        Returns: number
      }
      search_organizers: {
        Args: {
          p_as_of?: string
          p_cursor_id?: string
          p_cursor_score?: number
          p_lat?: number
          p_lng?: number
          p_page_size?: number
          p_query: string
        }
        Returns: {
          as_of: string
          avatar_public_id: string
          avatar_version: string
          avg_rating: number
          bio: string
          event_count: number
          full_name: string
          id: string
          is_new: boolean
          organizer_verified: boolean
          place_count: number
          rating_count: number
          score: number
          upcoming_count: number
          username: string
        }[]
      }
      search_places: {
        Args: {
          p_as_of?: string
          p_category_id?: number
          p_cursor_id?: string
          p_cursor_score?: number
          p_lat?: number
          p_lng?: number
          p_min_rating?: number
          p_open_now?: boolean
          p_page_size?: number
          p_query: string
          p_radius_km?: number
        }
        Returns: {
          address: Json
          as_of: string
          avg_rating: number
          category_id: number
          category_name: string
          category_slug: string
          claimed: boolean
          cover_public_id: string
          cover_version: string
          created_at: string
          description: string
          distance_km: number
          id: string
          is_new: boolean
          is_open: boolean
          location: unknown
          name: string
          owner_id: string
          phone: string
          review_count: number
          score: number
          slug: string
          status: string
          temporary_status: string
          verified: boolean
          website_url: string
          whatsapp: string
        }[]
      }
      search_spotlight: {
        Args: { p_limit?: number; p_query: string; p_viewer: string }
        Returns: {
          post_id: string
          rank: number
        }[]
      }
      search_suggest: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_query: string
          p_types?: string[]
        }
        Returns: {
          distance_km: number
          entity_type: string
          event_code: string
          id: string
          image_public_id: string
          image_version: string
          label: string
          score: number
          slug: string
          starts_at: string
          sublabel: string
          verified: boolean
        }[]
      }
      send_message: {
        Args: {
          p_attachments?: Json
          p_client_generated_id?: string
          p_content?: string
          p_conversation_id: string
          p_message_type?: string
          p_reply_to_message_id?: string
        }
        Returns: string
      }
      send_story_reply: {
        Args: {
          p_client_generated_id?: string
          p_content: string
          p_post_id: string
          p_reply_kind?: string
        }
        Returns: Json
      }
      set_admin_user_status: {
        Args: { p_actor_id: string; p_status: string; p_target_user: string }
        Returns: undefined
      }
      set_conversation_state: {
        Args: {
          p_archived?: boolean
          p_conversation_id: string
          p_muted?: boolean
        }
        Returns: undefined
      }
      stamp_checkout_referral: {
        Args: {
          p_checkout_session_id: string
          p_code: string
          p_source: string
          p_touched_at: string
          p_user_id: string
        }
        Returns: string
      }
      storage_purge_claim: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          object_path: string
          purge_id: number
        }[]
      }
      storage_purge_enqueue: {
        Args: { p_bucket: string; p_path: string; p_reason: string }
        Returns: undefined
      }
      storage_purge_finish: {
        Args: { p_detail?: string; p_ids: number[]; p_status: string }
        Returns: number
      }
      toggle_message_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: {
          added: boolean
        }[]
      }
      user_block_set: {
        Args: { p_block?: boolean; p_blocked_id: string }
        Returns: boolean
      }
      verification_transition: {
        Args: {
          p_action: string
          p_actor_id: string
          p_actor_kind: string
          p_case_id: string
          p_expected_status?: string
          p_reason?: string
        }
        Returns: Json
      }
      viewer_follows: {
        Args: { p_kind: string; p_target_id: string }
        Returns: boolean
      }
      weekly_claim_edit: {
        Args: { p_edition_id: string; p_expected_version: number }
        Returns: number
      }
      weekly_edition_create: {
        Args: {
          p_actor: string
          p_duplicate_from?: string
          p_intro?: string
          p_scope_id: string
          p_subtitle?: string
          p_title: string
          p_week_start: string
        }
        Returns: string
      }
      weekly_edition_document: {
        Args: { p_admin?: boolean; p_as_of?: string; p_edition_id: string }
        Returns: Json
      }
      weekly_edition_transition: {
        Args: {
          p_action: string
          p_actor: string
          p_actor_roles: string[]
          p_edition_id: string
          p_expected_version: number
          p_reason?: string
          p_request_meta?: Json
          p_scheduled_for?: string
        }
        Returns: Json
      }
      weekly_edition_validation: {
        Args: { p_as_of?: string; p_edition_id: string }
        Returns: Json
      }
      weekly_edition_view: {
        Args: { p_as_of?: string; p_scope_slug: string; p_week_start?: string }
        Returns: Json
      }
      weekly_health: { Args: never; Returns: Json }
      weekly_housekeeping: { Args: never; Returns: Json }
      weekly_item_move: {
        Args: { p_item_id: string; p_to_section_id: string }
        Returns: undefined
      }
      weekly_items_reorder: {
        Args: { p_item_ids: string[]; p_section_id: string }
        Returns: undefined
      }
      weekly_publish_due: { Args: never; Returns: Json }
      weekly_resolve_scope: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          is_national: boolean
          name: string
          slug: string
        }[]
      }
      weekly_sections_reorder: {
        Args: { p_edition_id: string; p_section_ids: string[] }
        Returns: undefined
      }
      weekly_subject_validity: {
        Args: {
          p_allow_ended?: boolean
          p_as_of?: string
          p_subject_id: string
          p_subject_type: string
        }
        Returns: string
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

