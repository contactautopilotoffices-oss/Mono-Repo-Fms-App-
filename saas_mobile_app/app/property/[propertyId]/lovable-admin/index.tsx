import React from 'react';
import { useGlobalSearchParams } from 'expo-router';
import LovablePropertyAdminDashboard from '@/components/dashboard/LovablePropertyAdminDashboard';

export default function LovablePropertyAdminRoute() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  return <LovablePropertyAdminDashboard propertyId={propertyId} />;
}
