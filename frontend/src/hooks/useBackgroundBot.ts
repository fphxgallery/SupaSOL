import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBotStatus } from '../api/bot';
import type { BotStatus } from '../api/bot';

export function useBackgroundBot() {
  return useQuery<BotStatus>({
    queryKey: ['bot-status'],
    queryFn: getBotStatus,
    refetchInterval: 5_000,
    retry: false,
    staleTime: 0,
  });
}

export function useInvalidateBotStatus() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['bot-status'] });
}
