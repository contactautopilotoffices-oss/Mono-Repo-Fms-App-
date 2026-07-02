const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'd:/Projects/Mono-Repo-Fms-App-/saas_mobileApp_server/.env';
const envContent = fs.readFileSync(envPath, 'utf8');

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: user } = await supabase.from('users').select('id, email').eq('email', 'admin.etpl@gmail.com').single();
  if (!user) return console.log('User not found');
  
  const { data: propMems } = await supabase.from('property_memberships').select('role, property_id, properties(name), is_active').eq('user_id', user.id);
  
  console.log('Prop Mems:', JSON.stringify(propMems, null, 2));
}

check();
