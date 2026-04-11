import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://egwzbevdxjmgkpphtlol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd3piZXZkeGptZ2twcGh0bG9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTAyNjgsImV4cCI6MjA5MTA4NjI2OH0.oF-rCunnxoOgR8bY0hPWXNzqaAdI_YAPyl_Nu6KQ4S0'
);

// Use gen_random_uuid() in SQL instead. We'll use the RPC approach.
const { data: branches, error: bErr } = await supabase.rpc(
  'seed_data'
);
if (bErr) {
  console.log('RPC not found, using raw SQL insert...');

  // Use raw SQL via psql-equivalent: create branches with actual UUIDs
  const uuids = {
    f1: 'e0000000-0000-4000-8000-000000000001',
    f2: 'e0000000-0000-4000-8000-000000000002',
    f3: 'e0000000-0000-4000-8000-000000000003',
  };

  let ok = 0, fail = 0;

  // Branches
  let r = await supabase.from('branches').insert([
    { id: uuids.f1, name: 'Farmacia Centro', address: 'Calle Principal #123', phone: '555-0101' },
    { id: uuids.f2, name: 'Farmacia Norte', address: 'Av. Constituci\u00f3n #456', phone: '555-0102' },
    { id: uuids.f3, name: 'Farmacia Sur', address: 'Blvd. Reforma #789', phone: '555-0103' },
  ]);
  console.log('branches:', r.error ? r.error.message : 'OK');
  if (!r.error) ok++; else fail++;

  // Categories (might already exist)
  const existingCats = await supabase.from('product_categories').select('id, name');
  const cm = {};
  if (existingCats.data) existingCats.data.forEach(c => cm[c.name] = c.id);

  if (Object.keys(cm).length === 0) {
    r = await supabase.from('product_categories').insert([
      { name: 'Analg\u00e9sicos', requires_prescription: false },
      { name: 'Antiinflamatorios', requires_prescription: false },
      { name: 'Antibi\u00f3ticos', requires_prescription: true },
      { name: 'Antihistam\u00ednicos', requires_prescription: false },
      { name: 'Gastrointestinal', requires_prescription: false },
      { name: 'Cardiovascular', requires_prescription: true },
      { name: 'Antidiab\u00e9ticos', requires_prescription: true },
      { name: 'Vitaminas', requires_prescription: false },
      { name: 'T\u00f3picos', requires_prescription: false },
    ]);
    console.log('categories:', r.error ? r.error.message : 'OK');
    if (!r.error) ok++; else fail++;

    const cd2 = await supabase.from('product_categories').select('id, name');
    if (cd2.data) cd2.data.forEach(c => cm[c.name] = c.id);
  } else {
    console.log('categories: already exist (' + Object.keys(cm).length + ')');
  }

  // Products
  const pid = (n) => 'a' + String(n).padStart(7, '0') + '-0000-4000-8000-' + String(n).padStart(12, '0');
  const products = [
    { id: pid(1), name: 'Paracetamol 500mg', barcode: '7501001234567', category_id: cm['Analg\u00e9sicos'], unit_price: 2.50, requires_prescription: false },
    { id: pid(2), name: 'Ibuprofeno 400mg', barcode: '7501001234568', category_id: cm['Antiinflamatorios'], unit_price: 3.75, requires_prescription: false },
    { id: pid(3), name: 'Amoxicilina 500mg', barcode: '7501001234569', category_id: cm['Antibi\u00f3ticos'], unit_price: 8.90, requires_prescription: true },
    { id: pid(4), name: 'Loratadina 10mg', barcode: '7501001234570', category_id: cm['Antihistam\u00ednicos'], unit_price: 4.20, requires_prescription: false },
    { id: pid(5), name: 'Omeprazol 20mg', barcode: '7501001234571', category_id: cm['Gastrointestinal'], unit_price: 6.50, requires_prescription: false },
    { id: pid(6), name: 'Losart\u00e1n 50mg', barcode: '7501001234572', category_id: cm['Cardiovascular'], unit_price: 12.30, requires_prescription: true },
    { id: pid(7), name: 'Metformina 850mg', barcode: '7501001234573', category_id: cm['Antidiab\u00e9ticos'], unit_price: 5.60, requires_prescription: true },
    { id: pid(8), name: 'Vitamina C 1g', barcode: '7501001234574', category_id: cm['Vitaminas'], unit_price: 3.90, requires_prescription: false },
    { id: pid(9), name: 'Diclofenaco Gel', barcode: '7501001234575', category_id: cm['T\u00f3picos'], unit_price: 7.80, requires_prescription: false },
    { id: pid(10), name: 'Atorvastatina 20mg', barcode: '7501001234576', category_id: cm['Cardiovascular'], unit_price: 15.40, requires_prescription: true },
  ];

  r = await supabase.from('products').insert(products);
  console.log('products:', r.error ? r.error.message : 'OK');
  if (!r.error) ok++; else fail++;

  // Inventory
  const pids = (await supabase.from('products').select('id')).data || [];
  const bids = [uuids.f1, uuids.f2, uuids.f3];
  const inv = [];
  for (const p of pids) {
    for (const b of bids) {
      inv.push({ product_id: p.id, branch_id: b, quantity: Math.floor(Math.random() * 400) + 50, min_stock_alert: 20 });
    }
  }
  if (inv.length > 0) {
    r = await supabase.from('inventory').insert(inv);
    console.log('inventory:', r.error ? r.error.message : 'OK (' + inv.length + ' rows)');
    if (!r.error) ok++; else fail++;
  }

  // Terminals
  const tid = (n) => 'c' + String(n).padStart(7, '0') + '-0000-4000-8000-' + String(n).padStart(12, '0');
  r = await supabase.from('terminals').insert([
    { id: tid(1), name: 'Caja Principal 1', branch_id: uuids.f1, status: 'online' },
    { id: tid(2), name: 'Caja R\u00e1pida 2', branch_id: uuids.f1, status: 'online' },
    { id: tid(3), name: 'Sucursal Norte', branch_id: uuids.f2, status: 'online' },
    { id: tid(4), name: 'Sucursal Sur', branch_id: uuids.f3, status: 'offline' },
    { id: tid(5), name: 'App M\u00f3vil Admin', branch_id: null, status: 'online' },
  ]);
  console.log('terminals:', r.error ? r.error.message : 'OK');
  if (!r.error) ok++; else fail++;

  console.log(ok + '/' + (ok + fail) + ' tables seeded');
  if (ok === 5) console.log('Datos sembrados correctamente!');
} else {
  console.log('RPC result:', branches);
}
