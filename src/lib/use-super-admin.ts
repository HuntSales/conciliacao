import { useQuery } from "@tanstack/react-query";
import { souSuperAdmin } from "@/lib/empresas.functions";

export function useSuperAdmin() {
  return useQuery({
    queryKey: ["sou-super-admin"],
    queryFn: () => souSuperAdmin(),
    staleTime: Infinity,
  });
}
