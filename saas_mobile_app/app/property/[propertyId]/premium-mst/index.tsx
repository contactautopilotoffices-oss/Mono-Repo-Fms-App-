import React from 'react';
import { useGlobalSearchParams } from 'expo-router';
import PremiumMstDashboard from '@/components/dashboard/PremiumMstDashboard';

export default function PremiumMstRoute() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return <PremiumMstDashboard propertyId={propertyId} />;
}
