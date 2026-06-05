const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env.local' });
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:3000';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'fake';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('tickets').select('is_internal, internal').limit(1);
  console.log("tickets internal columns:", data, error);
}
run();
