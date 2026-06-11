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
      billing_plan_versions: {
        Row: {
          created_at: string
          effective_from: string
          fixed_fee: number | null
          id: string
          plan_id: string
          price_bw: number | null
          price_color: number | null
          tiers: Json | null
          type: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          fixed_fee?: number | null
          id?: string
          plan_id: string
          price_bw?: number | null
          price_color?: number | null
          tiers?: Json | null
          type: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          fixed_fee?: number | null
          id?: string
          plan_id?: string
          price_bw?: number | null
          price_color?: number | null
          tiers?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          active: boolean
          created_at: string
          fixed_fee: number | null
          id: string
          name: string
          price_bw: number | null
          price_color: number | null
          tiers: Json | null
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          fixed_fee?: number | null
          id?: string
          name: string
          price_bw?: number | null
          price_color?: number | null
          tiers?: Json | null
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          fixed_fee?: number | null
          id?: string
          name?: string
          price_bw?: number | null
          price_color?: number | null
          tiers?: Json | null
          type?: string
        }
        Relationships: []
      }
      client_profiles: {
        Row: {
          client_id: number
          profile_id: string
          verified_at: string
        }
        Insert: {
          client_id: number
          profile_id: string
          verified_at?: string
        }
        Update: {
          client_id?: number
          profile_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean
          adresse: string | null
          email: string | null
          id: number
          ninea: string | null
          nom_client: string
          princity_company_id: string | null
          princity_id: number | null
          princity_prefix: string | null
          telephone: string | null
          ville: string | null
        }
        Insert: {
          active?: boolean
          adresse?: string | null
          email?: string | null
          id?: number
          ninea?: string | null
          nom_client: string
          princity_company_id?: string | null
          princity_id?: number | null
          princity_prefix?: string | null
          telephone?: string | null
          ville?: string | null
        }
        Update: {
          active?: boolean
          adresse?: string | null
          email?: string | null
          id?: number
          ninea?: string | null
          nom_client?: string
          princity_company_id?: string | null
          princity_id?: number | null
          princity_prefix?: string | null
          telephone?: string | null
          ville?: string | null
        }
        Relationships: []
      }
      contract_machine_override_versions: {
        Row: {
          contract_machine_id: string
          created_at: string
          effective_from: string
          fixed_fee_override: number | null
          id: string
          price_bw_override: number | null
          price_color_override: number | null
        }
        Insert: {
          contract_machine_id: string
          created_at?: string
          effective_from: string
          fixed_fee_override?: number | null
          id?: string
          price_bw_override?: number | null
          price_color_override?: number | null
        }
        Update: {
          contract_machine_id?: string
          created_at?: string
          effective_from?: string
          fixed_fee_override?: number | null
          id?: string
          price_bw_override?: number | null
          price_color_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_machine_override_versions_contract_machine_id_fkey"
            columns: ["contract_machine_id"]
            isOneToOne: false
            referencedRelation: "contract_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_machine_override_versions_contract_machine_id_fkey"
            columns: ["contract_machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["open_line_id"]
          },
        ]
      }
      contract_machines: {
        Row: {
          billing_day_override: number | null
          billing_plan_id: string | null
          contract_id: string
          created_at: string
          date_debut: string
          date_fin: string | null
          end_counter_bw: number | null
          end_counter_color: number | null
          fixed_fee_override: number | null
          id: string
          machine_id: string
          maintenance_frequency_override: string | null
          notes: string | null
          price_bw_override: number | null
          price_color_override: number | null
          replaces_contract_machine_id: string | null
          start_counter_bw: number | null
          start_counter_color: number | null
          statut: Database["public"]["Enums"]["contract_machine_status"]
        }
        Insert: {
          billing_day_override?: number | null
          billing_plan_id?: string | null
          contract_id: string
          created_at?: string
          date_debut: string
          date_fin?: string | null
          end_counter_bw?: number | null
          end_counter_color?: number | null
          fixed_fee_override?: number | null
          id?: string
          machine_id: string
          maintenance_frequency_override?: string | null
          notes?: string | null
          price_bw_override?: number | null
          price_color_override?: number | null
          replaces_contract_machine_id?: string | null
          start_counter_bw?: number | null
          start_counter_color?: number | null
          statut?: Database["public"]["Enums"]["contract_machine_status"]
        }
        Update: {
          billing_day_override?: number | null
          billing_plan_id?: string | null
          contract_id?: string
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          end_counter_bw?: number | null
          end_counter_color?: number | null
          fixed_fee_override?: number | null
          id?: string
          machine_id?: string
          maintenance_frequency_override?: string | null
          notes?: string | null
          price_bw_override?: number | null
          price_color_override?: number | null
          replaces_contract_machine_id?: string | null
          start_counter_bw?: number | null
          start_counter_color?: number | null
          statut?: Database["public"]["Enums"]["contract_machine_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contract_machines_billing_plan_id_fkey"
            columns: ["billing_plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_machines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_machines_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "contract_machines_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "contract_machines_replaces_contract_machine_id_fkey"
            columns: ["replaces_contract_machine_id"]
            isOneToOne: false
            referencedRelation: "contract_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_machines_replaces_contract_machine_id_fkey"
            columns: ["replaces_contract_machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["open_line_id"]
          },
        ]
      }
      contracts: {
        Row: {
          billing_day: number | null
          client_id: number
          created_at: string
          date_debut: string
          date_renouvellement: string | null
          id: string
          maintenance_frequency: string | null
          numero_contrat: string
          statut: Database["public"]["Enums"]["contract_status"]
        }
        Insert: {
          billing_day?: number | null
          client_id: number
          created_at?: string
          date_debut: string
          date_renouvellement?: string | null
          id?: string
          maintenance_frequency?: string | null
          numero_contrat: string
          statut?: Database["public"]["Enums"]["contract_status"]
        }
        Update: {
          billing_day?: number | null
          client_id?: number
          created_at?: string
          date_debut?: string
          date_renouvellement?: string | null
          id?: string
          maintenance_frequency?: string | null
          numero_contrat?: string
          statut?: Database["public"]["Enums"]["contract_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_responses: {
        Row: {
          comment: string | null
          created_at: string
          expires_at: string
          id: string
          incident_id: string
          rating: number | null
          responded_at: string | null
          token: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          incident_id: string
          rating?: number | null
          responded_at?: string | null
          token?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          incident_id?: string
          rating?: number | null
          responded_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "csat_responses_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: true
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      incident_history: {
        Row: {
          changed_by: string | null
          comment: string | null
          created_at: string
          id: string
          incident_id: string
          new_status: string | null
          old_status: string | null
        }
        Insert: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          incident_id: string
          new_status?: string | null
          old_status?: string | null
        }
        Update: {
          changed_by?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          incident_id?: string
          new_status?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_history_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_parts: {
        Row: {
          incident_id: string
          part_id: number
        }
        Insert: {
          incident_id: string
          part_id: number
        }
        Update: {
          incident_id?: string
          part_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "incident_parts_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_photos: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_photos_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          assigned_to: string | null
          autres_pieces: string | null
          category: Database["public"]["Enums"]["incident_category"]
          closed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_machine_id: string | null
          created_at: string
          description: string | null
          id: string
          machine_id: string | null
          numero_incident: string
          opened_by: string | null
          priority: Database["public"]["Enums"]["incident_priority"]
          rapport_intervention: string | null
          resolved_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          autres_pieces?: string | null
          category?: Database["public"]["Enums"]["incident_category"]
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_machine_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          machine_id?: string | null
          numero_incident: string
          opened_by?: string | null
          priority?: Database["public"]["Enums"]["incident_priority"]
          rapport_intervention?: string | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          autres_pieces?: string | null
          category?: Database["public"]["Enums"]["incident_category"]
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_machine_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          machine_id?: string | null
          numero_incident?: string
          opened_by?: string | null
          priority?: Database["public"]["Enums"]["incident_priority"]
          rapport_intervention?: string | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_contract_machine_id_fkey"
            columns: ["contract_machine_id"]
            isOneToOne: false
            referencedRelation: "contract_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_contract_machine_id_fkey"
            columns: ["contract_machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["open_line_id"]
          },
          {
            foreignKeyName: "incidents_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "incidents_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "incidents_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount_bw: number
          amount_color: number
          amount_fixed: number
          amount_total: number
          billing_type: string
          breakdown: Json | null
          contract_id: string | null
          created_at: string
          delta_bw: number
          delta_color: number
          fixed_fee: number | null
          id: string
          invoice_id: string
          is_estimated: boolean
          machine_id: string | null
          machine_label: string
          numero_contrat: string
          plan_name: string
          price_bw: number | null
          price_color: number | null
          tiers: Json | null
        }
        Insert: {
          amount_bw?: number
          amount_color?: number
          amount_fixed?: number
          amount_total?: number
          billing_type: string
          breakdown?: Json | null
          contract_id?: string | null
          created_at?: string
          delta_bw?: number
          delta_color?: number
          fixed_fee?: number | null
          id?: string
          invoice_id: string
          is_estimated?: boolean
          machine_id?: string | null
          machine_label: string
          numero_contrat: string
          plan_name: string
          price_bw?: number | null
          price_color?: number | null
          tiers?: Json | null
        }
        Update: {
          amount_bw?: number
          amount_color?: number
          amount_fixed?: number
          amount_total?: number
          billing_type?: string
          breakdown?: Json | null
          contract_id?: string | null
          created_at?: string
          delta_bw?: number
          delta_color?: number
          fixed_fee?: number | null
          id?: string
          invoice_id?: string
          is_estimated?: boolean
          machine_id?: string | null
          machine_label?: string
          numero_contrat?: string
          plan_name?: string
          price_bw?: number | null
          price_color?: number | null
          tiers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          annulation_reason: string | null
          annulled_at: string | null
          annulled_by: string | null
          client_id: number
          client_name: string
          contract_id: string | null
          created_at: string
          currency: string
          has_estimated: boolean
          has_replacement: boolean
          id: string
          issued_at: string
          issued_by: string | null
          numero_facture: string
          period_end: string | null
          period_month: number
          period_start: string | null
          period_year: number
          status: string
          total_amount: number
        }
        Insert: {
          annulation_reason?: string | null
          annulled_at?: string | null
          annulled_by?: string | null
          client_id: number
          client_name: string
          contract_id?: string | null
          created_at?: string
          currency?: string
          has_estimated?: boolean
          has_replacement?: boolean
          id?: string
          issued_at?: string
          issued_by?: string | null
          numero_facture: string
          period_end?: string | null
          period_month: number
          period_start?: string | null
          period_year: number
          status?: string
          total_amount?: number
        }
        Update: {
          annulation_reason?: string | null
          annulled_at?: string | null
          annulled_by?: string | null
          client_id?: number
          client_name?: string
          contract_id?: string | null
          created_at?: string
          currency?: string
          has_estimated?: boolean
          has_replacement?: boolean
          id?: string
          issued_at?: string
          issued_by?: string | null
          numero_facture?: string
          period_end?: string | null
          period_month?: number
          period_start?: string | null
          period_year?: number
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_annulled_by_fkey"
            columns: ["annulled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          needs: string
          phone: string
          status: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          needs: string
          phone: string
          status?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          needs?: string
          phone?: string
          status?: string
        }
        Relationships: []
      }
      machine_counters: {
        Row: {
          annulation_reason: string | null
          annule_at: string | null
          annule_by: string | null
          client_id: number | null
          contract_id: string | null
          counter_bw: number
          counter_color: number
          day: number | null
          id: string
          is_replacement_start: boolean
          machine_id: string
          month: number
          notes: string | null
          previous_machine_id: string | null
          recorded_at: string
          recorded_by: string | null
          status: string
          year: number
        }
        Insert: {
          annulation_reason?: string | null
          annule_at?: string | null
          annule_by?: string | null
          client_id?: number | null
          contract_id?: string | null
          counter_bw?: number
          counter_color?: number
          day?: number | null
          id?: string
          is_replacement_start?: boolean
          machine_id: string
          month: number
          notes?: string | null
          previous_machine_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          status?: string
          year: number
        }
        Update: {
          annulation_reason?: string | null
          annule_at?: string | null
          annule_by?: string | null
          client_id?: number | null
          contract_id?: string | null
          counter_bw?: number
          counter_color?: number
          day?: number | null
          id?: string
          is_replacement_start?: boolean
          machine_id?: string
          month?: number
          notes?: string | null
          previous_machine_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "machine_counters_annule_by_fkey"
            columns: ["annule_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_counters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_counters_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_counters_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "machine_counters_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "machine_counters_previous_machine_id_fkey"
            columns: ["previous_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "machine_counters_previous_machine_id_fkey"
            columns: ["previous_machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "machine_counters_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          active: boolean
          localisation: string | null
          marque: string
          modele: string
          numero_serie: string
          princity_device_id: string | null
          princity_pending: boolean
          type: Database["public"]["Enums"]["machine_type"] | null
        }
        Insert: {
          active?: boolean
          localisation?: string | null
          marque: string
          modele: string
          numero_serie: string
          princity_device_id?: string | null
          princity_pending?: boolean
          type?: Database["public"]["Enums"]["machine_type"] | null
        }
        Update: {
          active?: boolean
          localisation?: string | null
          marque?: string
          modele?: string
          numero_serie?: string
          princity_device_id?: string | null
          princity_pending?: boolean
          type?: Database["public"]["Enums"]["machine_type"] | null
        }
        Relationships: []
      }
      maintenance_parts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          part_id: number | null
          quantity: number
          visit_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          part_id?: number | null
          quantity?: number
          visit_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          part_id?: number | null
          quantity?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_parts_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "maintenance_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          active: boolean
          contract_id: string
          created_at: string
          frequency: string
          id: string
          notes: string | null
        }
        Insert: {
          active?: boolean
          contract_id: string
          created_at?: string
          frequency: string
          id?: string
          notes?: string | null
        }
        Update: {
          active?: boolean
          contract_id?: string
          created_at?: string
          frequency?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_visits: {
        Row: {
          assigned_to: string | null
          contract_machine_id: string
          created_at: string
          done_at: string | null
          done_by: string | null
          id: string
          matrix_notified: boolean
          notes: string | null
          plan_id: string
          qr_verified: boolean
          scheduled_date: string
          status: string
        }
        Insert: {
          assigned_to?: string | null
          contract_machine_id: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          matrix_notified?: boolean
          notes?: string | null
          plan_id: string
          qr_verified?: boolean
          scheduled_date: string
          status?: string
        }
        Update: {
          assigned_to?: string | null
          contract_machine_id?: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          matrix_notified?: boolean
          notes?: string | null
          plan_id?: string
          qr_verified?: boolean
          scheduled_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_visits_contract_machine_id_fkey"
            columns: ["contract_machine_id"]
            isOneToOne: false
            referencedRelation: "contract_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_visits_contract_machine_id_fkey"
            columns: ["contract_machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["open_line_id"]
          },
          {
            foreignKeyName: "maintenance_visits_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_visits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
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
      princity_alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["alert_type"] | null
          client_id: number | null
          client_raw: string | null
          competence_level: string | null
          description: string | null
          id: string
          incident_id: string | null
          ip_address: string | null
          mac_address: string | null
          machine_id: string | null
          modele: string | null
          princity_alert_code: number | null
          princity_device_id_raw: string | null
          processed: boolean
          processed_at: string | null
          received_at: string
          severity: string | null
          site: string | null
        }
        Insert: {
          alert_type?: Database["public"]["Enums"]["alert_type"] | null
          client_id?: number | null
          client_raw?: string | null
          competence_level?: string | null
          description?: string | null
          id?: string
          incident_id?: string | null
          ip_address?: string | null
          mac_address?: string | null
          machine_id?: string | null
          modele?: string | null
          princity_alert_code?: number | null
          princity_device_id_raw?: string | null
          processed?: boolean
          processed_at?: string | null
          received_at?: string
          severity?: string | null
          site?: string | null
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["alert_type"] | null
          client_id?: number | null
          client_raw?: string | null
          competence_level?: string | null
          description?: string | null
          id?: string
          incident_id?: string | null
          ip_address?: string | null
          mac_address?: string | null
          machine_id?: string | null
          modele?: string | null
          princity_alert_code?: number | null
          princity_device_id_raw?: string | null
          processed?: boolean
          processed_at?: string | null
          received_at?: string
          severity?: string | null
          site?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "princity_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "princity_alerts_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "princity_alerts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["numero_serie"]
          },
          {
            foreignKeyName: "princity_alerts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_park"
            referencedColumns: ["numero_serie"]
          },
        ]
      }
      princity_api_logs: {
        Row: {
          endpoint_called: string | null
          error_message: string | null
          executed_at: string
          function_name: string
          id: string
          records_created: number
          records_processed: number
          status: string
        }
        Insert: {
          endpoint_called?: string | null
          error_message?: string | null
          executed_at?: string
          function_name: string
          id?: string
          records_created?: number
          records_processed?: number
          status: string
        }
        Update: {
          endpoint_called?: string | null
          error_message?: string | null
          executed_at?: string
          function_name?: string
          id?: string
          records_created?: number
          records_processed?: number
          status?: string
        }
        Relationships: []
      }
      princity_health: {
        Row: {
          alert_sent: boolean
          function_name: string
          last_error_at: string | null
          last_error_message: string | null
          last_success_at: string | null
        }
        Insert: {
          alert_sent?: boolean
          function_name: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
        }
        Update: {
          alert_sent?: boolean
          function_name?: string
          last_error_at?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_dispatcher: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_dispatcher?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_dispatcher?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
    }
    Views: {
      v_machine_park: {
        Row: {
          active: boolean | null
          client_id: number | null
          localisation: string | null
          louee: boolean | null
          marque: string | null
          modele: string | null
          numero_contrat: string | null
          numero_serie: string | null
          open_contract_id: string | null
          open_date_debut: string | null
          open_line_id: string | null
          type: Database["public"]["Enums"]["machine_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_machines_contract_id_fkey"
            columns: ["open_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_machine_from_stock: { Args: { p_payload: Json }; Returns: string }
      auth_client_contract_ids: { Args: never; Returns: string[] }
      auth_client_contract_machine_ids: { Args: never; Returns: string[] }
      auth_client_machine_ids: { Args: never; Returns: string[] }
      auth_tech_assigned_client_ids: { Args: never; Returns: number[] }
      auth_tech_assigned_machine_ids: { Args: never; Returns: string[] }
      auth_tech_contract_machine_ids: { Args: never; Returns: string[] }
      auth_tech_incident_contract_ids: { Args: never; Returns: string[] }
      auth_tech_incident_ids: { Args: never; Returns: string[] }
      can_delete_contract: { Args: { p_contract_id: string }; Returns: Json }
      close_maintenance_visit: {
        Args: {
          p_autres_pieces: string
          p_done_by: string
          p_notes: string
          p_part_ids: number[]
          p_serie: string
          p_visit_id: string
        }
        Returns: Json
      }
      create_contract_with_lines: { Args: { payload: Json }; Returns: Json }
      emit_contract_invoice: { Args: { p_payload: Json }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      next_incident_number: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      replace_contract_machine: { Args: { p_payload: Json }; Returns: string }
      return_machine_to_stock: { Args: { p_payload: Json }; Returns: string }
      update_contract_with_lines: {
        Args: { p_contract_id: string; payload: Json }
        Returns: Json
      }
      wipe_data_tables: { Args: never; Returns: undefined }
    }
    Enums: {
      alert_type: "panne" | "toner_bas" | "autre"
      contract_machine_status: "actif" | "suspendu" | "terminé"
      contract_status: "actif" | "suspendu" | "terminé"
      incident_category: "panne" | "maintenance" | "consommable" | "autre"
      incident_priority: "basse" | "normale" | "haute" | "urgente"
      incident_status: "nouveau" | "assigné" | "en_cours" | "résolu" | "fermé"
      machine_type: "color" | "noir_blanc"
      user_role: "client" | "technician" | "admin"
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
      alert_type: ["panne", "toner_bas", "autre"],
      contract_machine_status: ["actif", "suspendu", "terminé"],
      contract_status: ["actif", "suspendu", "terminé"],
      incident_category: ["panne", "maintenance", "consommable", "autre"],
      incident_priority: ["basse", "normale", "haute", "urgente"],
      incident_status: ["nouveau", "assigné", "en_cours", "résolu", "fermé"],
      machine_type: ["color", "noir_blanc"],
      user_role: ["client", "technician", "admin"],
    },
  },
} as const
