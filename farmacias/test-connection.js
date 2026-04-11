const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://egwzbevdxjmgkpphtlol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd3piZXZkeGptZ2twcGh0bG9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTAyNjgsImV4cCI6MjA5MTA4NjI2OH0.oF-rCunnxoOgR8bY0hPWXNzqaAdI_YAPyl_Nu6KQ4S0'
);

async function test() {
  const tables = ['branches', 'products', 'inventory', 'sales', 'terminals', 'terminal_sessions', 'notifications', 'treatment_reminders'];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(t + ': ERROR - ' + error.message);
    } else {
      console.log(t + ': OK (' + count + ' filas)');
    }
  }
}
test();
