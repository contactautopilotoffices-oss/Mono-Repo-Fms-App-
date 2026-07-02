const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'd:/Projects/Mono-Repo-Fms-App-/saas_mobileApp_server/.env';
const envContent = fs.readFileSync(envPath, 'utf8');

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const admin = createClient(supabaseUrl, supabaseKey);

async function testApi() {
  const userId = '52cc596b-0b1a-4d7a-b514-6330058e0a3b'; // Needs to be the actual user ID for admin.etpl@gmail.com. Let me fetch it first.
  const { data: user } = await admin.from('users').select('id').eq('email', 'admin.etpl@gmail.com').single();
  const uid = user.id;

  const urlOrgId = null; 

  const { data: orgMembership } = await admin
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', uid)
    .or('is_active.eq.true,is_active.is.null')
    .in('role', ['org_super_admin', 'org_admin', 'owner', 'super_tenant'])
    .limit(1)
    .maybeSingle();

  const isOrgAdmin = !!orgMembership;
  const resolvedOrgId = urlOrgId || orgMembership?.organization_id;

  let propIdsAllowed = null;
  if (!isOrgAdmin) {
    const { data: propMemberships } = await admin
      .from('property_memberships')
      .select('property_id')
      .eq('user_id', uid)
      .or('is_active.eq.true,is_active.is.null')
      .in('role', ['property_admin', 'admin', 'manager', 'property_manager', 'facility_manager']);

    if (propMemberships && propMemberships.length > 0) {
      propIdsAllowed = propMemberships.map(m => m.property_id);
    } else {
      return console.log("Unauthorized");
    }
  }

  let propQuery = admin
    .from('properties')
    .select('id, name, code, address, image_url, organization_id');
    
  if (resolvedOrgId) {
    propQuery = propQuery.eq('organization_id', resolvedOrgId);
  }
  
  if (propIdsAllowed) {
    propQuery = propQuery.in('id', propIdsAllowed);
  }
  
  const { data: propData, error } = await propQuery;
  console.log("Returned properties count:", propData.length);
  console.log("Properties:", propData.map(p => p.name).join(", "));
}

testApi();
