'use client';
import { useMemo, useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { serverApi } from '@/lib/serverApi';

export interface Ticket {
  id: string;
  ticket_number?: string;
  title?: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  raised_by?: string;
  assigned_to?: string;
  assignee?: { full_name?: string; user_photo_url?: string };
}

export interface TenantTicketFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export function useTenantTickets(propertyId: string | undefined, userId: string | undefined, filters?: TenantTicketFilters) {
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const LIMIT = 15;

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error,
    refetch
  } = useInfiniteQuery({
    queryKey: ['tenant_tickets', propertyId, filters],
    queryFn: async ({ pageParam = 0 }) => {
      if (!propertyId) return [];
      console.log('[useTenantTickets] Fetching directly from DB (Infinite) for propertyId:', propertyId, 'offset:', pageParam, 'filters:', filters);
      
      const filtersArr: any[] = [
        { op: 'eq', column: 'property_id', value: propertyId },
        { op: 'eq', column: 'internal', value: false } // only fetch tenant/external tickets
      ];
      
      if (filters?.status && filters.status !== 'all') {
        filtersArr.push({ op: 'eq', column: 'status', value: filters.status });
      }
      if (filters?.search) {
        filtersArr.push({ op: 'ilike', column: 'title', value: `%${filters.search}%` });
      }

      const res = await serverApi.query<{ data: Ticket[] }>({
        table: 'tickets',
        action: 'select',
        select: 'id, ticket_number, title, description, status, priority, created_at, raised_by, assigned_to, assignee:users!assigned_to(full_name, user_photo_url)',
        filters: filtersArr,
        limit: LIMIT,
        offset: pageParam,
        orderBy: { column: 'created_at', ascending: false }
      });
      
      if (res.error) {
        console.error('[useTenantTickets] Error fetching tickets:', res.error);
        return [];
      }
      
      return res.data || [];
    },
    getNextPageParam: (lastPage: Ticket[], allPages: Ticket[][]) => {
      // If we got fewer items than the limit, we're at the end
      if (lastPage.length < LIMIT) {
        return undefined;
      }
      // Otherwise, the next offset is the number of all items fetched so far
      return allPages.flat().length;
    },
    enabled: !!propertyId,
    initialPageParam: 0,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    refetchOnMount: 'always',
  });

  // Flatten the pages into a single array
  const tickets = useMemo(() => {
    return data ? data.pages.flat() : [];
  }, [data]);

  // Real-time subscription
  useEffect(() => {
    if (!propertyId) return;

    const channelName = `tenant_tickets_${propertyId}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `property_id=eq.${propertyId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant_tickets', propertyId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [propertyId, supabase, queryClient]);

  const stats = useMemo(() => {
    const open = tickets.filter((t: Ticket) => !['resolved', 'closed'].includes(t.status?.toLowerCase())).length;
    const total = tickets.length;
    const critical = tickets.filter((t: Ticket) => t.priority?.toLowerCase() === 'critical' && t.status !== 'resolved' && t.status !== 'closed').length;
    const completed = tickets.filter((t: Ticket) => ['resolved', 'closed'].includes(t.status?.toLowerCase())).length;
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { open, total, critical, completion };
  }, [tickets]);

  return { 
    tickets, 
    loading: isLoading, 
    isFetching,
    error: error ? error.message : null, 
    stats, 
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  };
}
