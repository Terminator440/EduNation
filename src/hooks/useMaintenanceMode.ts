import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const MAINTENANCE_QUERY_KEY = ["maintenance-mode"];

export function useMaintenanceMode() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: MAINTENANCE_QUERY_KEY,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("get_maintenance_mode");
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const setMaintenance = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc("set_maintenance_mode", { enabled });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MAINTENANCE_QUERY_KEY });
    },
  });

  return {
    maintenanceMode: query.data ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    setMaintenanceMode: setMaintenance.mutateAsync,
    isSetting: setMaintenance.isPending,
  };
}
