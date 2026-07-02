const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'd:/Projects/Mono-Repo-Fms-App-/saas_mobileApp_server/.env';
const envContent = fs.readFileSync(envPath, 'utf8');

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const admin = createClient(supabaseUrl, supabaseKey);

async function testApi() {
  const { data: user } = await admin.from('users').select('id').eq('email', 'admin.etpl@gmail.com').single();
  const uid = user.id;

  const { data: propMemberships1, error: err1 } = await admin
    .from('property_memberships')
    .select('property_id')
    .eq('user_id', uid)
    .or('is_active.eq.true,is_active.is.null')
    .in('role', ['property_admin']);
    
  console.log("Query 1:", propMemberships1?.length, err1);
}

testApi();
