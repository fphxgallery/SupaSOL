import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchTokens, type TokenInfo } from '../api/tokens';

export function useTokenSearch(debounceMs = 300) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, debounceMs]);

  const result = useQuery({
    queryKey: ['token-search', debouncedQuery],
    queryFn: () => searchTokens(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  return { query, setQuery, tokens: result.data ?? [], isLoading: result.isFetching };
}

export type { TokenInfo };
