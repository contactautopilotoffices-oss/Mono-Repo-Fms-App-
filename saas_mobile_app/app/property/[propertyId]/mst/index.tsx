import React from 'react';
import { useGlobalSearchParams } from 'expo-router';
import MstDashboard from '../../../../components/dashboard/MstDashboard';

export default function MstDashboardPage() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();

  if (!propertyId) {
    return null;
  }

  return <MstDashboard propertyId={propertyId} />;
}
