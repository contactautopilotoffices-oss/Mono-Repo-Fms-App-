const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.local' });
require('dotenv').config({ path: '../saas_mobileApp_server/.env' });
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('property_memberships').select('role, is_active').limit(10);
  console.log(data);
}
run();
