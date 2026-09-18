export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      conta_granatum: {
        Row: {
          atualizado_em: string;
          conta_id_granatum: string;
          id: string;
          nome: string | null;
        };
        Insert: {
          atualizado_em?: string;
          conta_id_granatum: string;
          id?: string;
          nome?: string | null;
        };
        Update: {
          atualizado_em?: string;
          conta_id_granatum?: string;
          id?: string;
          nome?: string | null;
        };
        Relationships: [];
      };
      credenciais_fallback: {
        Row: {
          ambiente: string | null;
          atualizado_em: string;
          id: string;
          provedor: string;
          token_cifrado: string | null;
          url_base: string | null;
        };
        Insert: {
          ambiente?: string | null;
          atualizado_em?: string;
          id?: string;
          provedor: string;
          token_cifrado?: string | null;
          url_base?: string | null;
        };
        Update: {
          ambiente?: string | null;
          atualizado_em?: string;
          id?: string;
          provedor?: string;
          token_cifrado?: string | null;
          url_base?: string | null;
        };
        Relationships: [];
      };
      integracoes_mcp: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          id: string;
          nome: string;
          provedor: string;
          status: string;
          token_cifrado: string | null;
          transporte: string | null;
          ultima_checagem: string | null;
          ultimo_erro: string | null;
          url_mcp: string | null;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          id?: string;
          nome: string;
          provedor: string;
          status?: string;
          token_cifrado?: string | null;
          transporte?: string | null;
          ultima_checagem?: string | null;
          ultimo_erro?: string | null;
          url_mcp?: string | null;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          id?: string;
          nome?: string;
          provedor?: string;
          status?: string;
          token_cifrado?: string | null;
          transporte?: string | null;
          ultima_checagem?: string | null;
          ultimo_erro?: string | null;
          url_mcp?: string | null;
        };
        Relationships: [];
      };
      log_alteracoes_granatum: {
        Row: {
          antes: Json | null;
          criado_em: string;
          depois: Json | null;
          id: string;
          lancamento_id: string;
          usuario_id: string | null;
        };
        Insert: {
          antes?: Json | null;
          criado_em?: string;
          depois?: Json | null;
          id?: string;
          lancamento_id: string;
          usuario_id?: string | null;
        };
        Update: {
          antes?: Json | null;
          criado_em?: string;
          depois?: Json | null;
          id?: string;
          lancamento_id?: string;
          usuario_id?: string | null;
        };
        Relationships: [];
      };
      pares_conciliacao: {
        Row: {
          asaas_id: string;
          criado_em: string;
          data: string;
          granatum_id: string;
          id: string;
          tipo: string;
          usuario_id: string | null;
          valor: number;
        };
        Insert: {
          asaas_id: string;
          criado_em?: string;
          data: string;
          granatum_id: string;
          id?: string;
          tipo: string;
          usuario_id?: string | null;
          valor: number;
        };
        Update: {
          asaas_id?: string;
          criado_em?: string;
          data?: string;
          granatum_id?: string;
          id?: string;
          tipo?: string;
          usuario_id?: string | null;
          valor?: number;
        };
        Relationships: [];
      };
      tool_mapping: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          funcao: string;
          id: string;
          provedor: string;
          tool_name: string | null;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          funcao: string;
          id?: string;
          provedor: string;
          tool_name?: string | null;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          funcao?: string;
          id?: string;
          provedor?: string;
          tool_name?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
