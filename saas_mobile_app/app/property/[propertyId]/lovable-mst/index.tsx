import React from 'react';
import { useGlobalSearchParams } from 'expo-router';
import LovableMstDashboard from '@/components/dashboard/LovableMstDashboard';

export default function LovableMstRoute() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  return <LovableMstDashboard propertyId={propertyId} />;
}
