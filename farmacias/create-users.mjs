import { createClient } from '@supabase/supabase-js';
const s = createClient(
  'https://egwzbevdxjmgkpphtlol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd3piZXZkeGptZ2twcGh0bG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMDI2OCwiZXhwIjoyMDkxMDg2MjY4fQ.0UrTgZrwNJnlFejhT3dc2bl2FCSWBXP-XgKcMh8Jh9w'
);

const users = [
  { email: 'admin@farma.com', password: 'admin123', role: 'administrador', name: 'Dr. Roberto Mendez' },
  { email: 'farma@farma.com', password: 'farma123', role: 'farmaceutico', name: 'Lic. Ana Garcia' },
  { email: 'venta@farma.com', password: 'venta123', role: 'vendedor', name: 'Carlos Ruiz' },
];

for (const u of users) {
  const { data, error } = await s.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { name: u.name, role: u.role },
  });
  if (error) {
    if (error.message.includes('already')) {
      console.log(u.role + ': ya existe');
    } else {
      console.log(u.role + ': ERROR - ' + error.message);
    }
  } else {
    console.log(u.role + ': creado (' + data.user.id + ')');
  }
}
