import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAiDecisions } from '../api/bot';

export function useAiDecisions(enabled: boolean) {
  return useQuery({
    queryKey: ['bot-ai-decisions'],
    queryFn: getAiDecisions,
    refetchInterval: 5_000,
    retry: false,
    staleTime: 0,
    enabled,
  });
}

export function useInvalidateAiDecisions() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['bot-ai-decisions'] });
}
