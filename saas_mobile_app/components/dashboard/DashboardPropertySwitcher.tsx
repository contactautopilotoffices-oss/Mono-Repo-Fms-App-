import React, { useState } from 'react';
import { View, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import PropertySwitcherModal from '@/components/dashboard/PropertySwitcherModal';

interface Props {
  canSwitchProperty: boolean;
  propertyPhoto?: string | null;
  propertyId: string;
  orgId: string;
}

export default function DashboardPropertySwitcher({
  canSwitchProperty,
  propertyPhoto,
  propertyId,
  orgId,
}: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  if (!canSwitchProperty) return null;

  return (
    <>
      <TouchableOpacity
        style={{
          width: 36,
          height: 36,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: 0,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.2)',
          borderRadius: 18,
          backgroundColor: 'rgba(255,255,255,0.1)',
        }}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        {propertyPhoto ? (
          <Image
            source={{ uri: propertyPhoto }}
            style={{ width: '100%', height: '100%', borderRadius: 18 }}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="business" size={18} color="#FFFFFF" />
        )}
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            backgroundColor: '#0B0B0F',
            borderRadius: 8,
            width: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="swap-vertical" size={10} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      <PropertySwitcherModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        currentPropertyId={propertyId}
        orgId={orgId}
        onSelect={(newPropertyId) => {
          setShowModal(false);
          router.replace(`/property/${newPropertyId}/dashboard` as never);
        }}
      />
    </>
  );
}
