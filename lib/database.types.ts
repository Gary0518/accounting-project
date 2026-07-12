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
      categories: {
        Row: {
          active: boolean
          direction: string
          id: number
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          direction: string
          id?: never
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          direction?: string
          id?: never
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      channels: {
        Row: {
          active: boolean
          id: number
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: never
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: never
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      entries: {
        Row: {
          amount: number
          category: string
          channel: string | null
          created_at: string
          created_by: string | null
          deposit: number
          deposit_payment_method: string | null
          direction: string
          entry_date: string
          guest_note: string | null
          handler: string | null
          id: string
          memo: string | null
          nights: number | null
          payment_method: string | null
          property_id: number | null
          room_nights: number | null
          room_type: string | null
          rooms: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          channel?: string | null
          created_at?: string
          created_by?: string | null
          deposit?: number
          deposit_payment_method?: string | null
          direction: string
          entry_date: string
          guest_note?: string | null
          handler?: string | null
          id?: string
          memo?: string | null
          nights?: number | null
          payment_method?: string | null
          property_id?: number | null
          room_nights?: number | null
          room_type?: string | null
          rooms?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          channel?: string | null
          created_at?: string
          created_by?: string | null
          deposit?: number
          deposit_payment_method?: string | null
          direction?: string
          entry_date?: string
          guest_note?: string | null
          handler?: string | null
          id?: string
          memo?: string | null
          nights?: number | null
          payment_method?: string | null
          property_id?: number | null
          room_nights?: number | null
          room_type?: string | null
          rooms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          id: number
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: never
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: never
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_admin: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_admin?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      properties: {
        Row: {
          active: boolean
          id: number
          name: string
          sort_order: number
          total_rooms: number
        }
        Insert: {
          active?: boolean
          id?: never
          name: string
          sort_order?: number
          total_rooms?: number
        }
        Update: {
          active?: boolean
          id?: never
          name?: string
          sort_order?: number
          total_rooms?: number
        }
        Relationships: []
      }
      room_types: {
        Row: {
          active: boolean
          id: number
          name: string
          quantity: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          id?: never
          name: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          id?: never
          name?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: []
      }
      user_property_access: {
        Row: {
          can_cashflow: boolean
          can_input: boolean
          can_operations: boolean
          property_id: number
          user_id: string
        }
        Insert: {
          can_cashflow?: boolean
          can_input?: boolean
          can_operations?: boolean
          property_id: number
          user_id: string
        }
        Update: {
          can_cashflow?: boolean
          can_input?: boolean
          can_operations?: boolean
          property_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_property_access_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { uid: string }; Returns: boolean }
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
