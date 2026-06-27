import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkAccess() {
  const userId = '5973fcab-7b2c-4a00-bf8b-034053e35f34';
  const propertyId = '4f0f44eb-5169-4c67-9d09-325016125a8d';

  console.log(`Checking access for user ${userId} and property ${propertyId}`);

  const { data: propMem, error: propErr } = await supabase
    .from('property_memberships')
    .select('*')
    .eq('user_id', userId)
    .eq('property_id', propertyId);
  
  console.log('Property Memberships:', propMem);

  const { data: prop } = await supabase.from('properties').select('organization_id').eq('id', propertyId).single();
  
  if (prop) {
    console.log('Property org_id:', prop.organization_id);
    const { data: orgMem, error: orgErr } = await supabase
      .from('organization_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('organization_id', prop.organization_id);
      
    console.log('Org Memberships:', orgMem);
  }
}

checkAccess();
