// Mirrors server-side canUserSeePrices in saas_mobileApp_server/lib/procurement.ts
// Keep these in sync.

const ALWAYS_ALLOWED_ORG_ROLES = new Set(['procurement', 'org_super_admin', 'master_admin']);

export interface ProcurementPriceVisibilitySetting {
  property_id?: string | null;
  roles?: string[] | null;
  users?: string[] | null;
}

export interface PropertyMembershipSummary {
  property_id: string;
  role: string;
}

export function canUserSeePrices(
  userId: string | undefined | null,
  organizationId: string | undefined | null,
  orgRole: string | undefined | null,
  propertyMemberships: PropertyMembershipSummary[],
  propertyId: string | undefined,
  visibilitySettings: ProcurementPriceVisibilitySetting[] | null | undefined
): boolean {
  if (!userId || !organizationId) return false;

  const normalizedOrgRole = (orgRole ?? '').toLowerCase();
  if (ALWAYS_ALLOWED_ORG_ROLES.has(normalizedOrgRole)) {
    return true;
  }

  if (!visibilitySettings?.length) {
    return false;
  }

  for (const config of visibilitySettings) {
    if (config.users?.includes(userId)) {
      return true;
    }

    if (propertyId && config.property_id && config.property_id !== propertyId) {
      continue;
    }

    if (normalizedOrgRole && config.roles?.map(r => r.toLowerCase()).includes(normalizedOrgRole)) {
      return true;
    }

    const propertyRole = propertyMemberships.find(
      (membership) => membership.property_id === (config.property_id ?? propertyId)
    )?.role;
    if (propertyRole && config.roles?.map(r => r.toLowerCase()).includes(propertyRole.toLowerCase())) {
      return true;
    }
  }

  return false;
}
