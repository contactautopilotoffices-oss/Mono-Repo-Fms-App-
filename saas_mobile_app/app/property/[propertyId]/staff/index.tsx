import StaffDashboard from '@/components/dashboard/StaffDashboard';
import { useGlobalSearchParams } from 'expo-router';

export default function StaffPage() {
  const { propertyId } = useGlobalSearchParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return <StaffDashboard propertyId={propertyId} />;
}
