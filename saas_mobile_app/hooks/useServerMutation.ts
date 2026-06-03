import { useMutation, UseMutationOptions, UseMutationResult } from '@tanstack/react-query';

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
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>
): UseMutationResult<TData, Error, TVariables> {
  return useMutation<TData, Error, TVariables>({
    mutationFn,
    retry: 1,
    networkMode: 'offlineFirst',
    ...options,
  });
}
