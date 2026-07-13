// @ts-nocheck
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

/**
 * React Query mutation wrapper with offline-first support.
 *
 * Usage:
 *   const mutation = useServerMutation(
 *     (newTicket) => createTicket(newTicket),
 *     {
 *       onSuccess: () => {
 *         queryClient.invalidateQueries({ queryKey: ['tickets', propertyId] });
 *       }
 *     }
 *   );
 */
export function useServerMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<Parameters<typeof useMutation<TData, Error, TVariables, unknown>>[0], 'mutationFn'>
): UseMutationResult<TData, Error, TVariables, unknown> {
  return useMutation<TData, Error, TVariables, unknown>({
    mutationFn,
    retry: 1,
    networkMode: 'offlineFirst',
    ...options,
  });
}
