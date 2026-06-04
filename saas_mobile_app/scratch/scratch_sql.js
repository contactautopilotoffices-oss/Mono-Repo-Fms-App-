const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://xvucakstcmtfoanmgcql.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg', { auth: { persistSession: false } });

async function run() {
  const query = "SELECT proname, pg_get_functiondef(oid) as def FROM pg_proc WHERE proname LIKE '%gamification%' OR proname LIKE '%mst%' OR proname = 'handle_ticket_resolution'";

  const { data, error } = await supabase.rpc('execute_sql', { query });
  
  if (error) {
    console.error("RPC Error:", error);
    return;
  }
  
  console.log(JSON.stringify(data.data, null, 2));
}

run();
