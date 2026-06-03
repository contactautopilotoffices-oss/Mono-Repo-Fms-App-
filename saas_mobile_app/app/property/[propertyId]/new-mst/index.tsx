import React from 'react';
import { useGlobalSearchParams } from 'expo-router';
import NewMstDashboard from '@/components/dashboard/NewMstDashboard';

export default function NewMstRoute() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return <NewMstDashboard propertyId={propertyId} />;
}
