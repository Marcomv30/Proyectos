import { createClient } from '@supabase/supabase-js';
const s = createClient(
  'https://egwzbevdxjmgkpphtlol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd3piZXZkeGptZ2twcGh0bG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxMDI2OCwiZXhwIjoyMDkxMDg2MjY4fQ.0UrTgZrwNJnlFejhT3dc2bl2FCSWBXP-XgKcMh8Jh9w'
);

// 1. Categories
const { data: cats } = await s.from('product_categories').select('id, name');
const cm = {};
cats.forEach(c => cm[c.name] = c.id);
console.log('Categories loaded');

// 2. Products
const products = [
  { name: 'Paracetamol 500mg', barcode: '7501001234567', category_id: cm['Analgésicos'], unit_price: 2.50, requires_prescription: false },
  { name: 'Ibuprofeno 400mg', barcode: '7501001234568', category_id: cm['Antiinflamatorios'], unit_price: 3.75, requires_prescription: false },
  { name: 'Amoxicilina 500mg', barcode: '7501001234569', category_id: cm['Antibióticos'], unit_price: 8.90, requires_prescription: true },
  { name: 'Loratadina 10mg', barcode: '7501001234570', category_id: cm['Antihistamínicos'], unit_price: 4.20, requires_prescription: false },
  { name: 'Omeprazol 20mg', barcode: '7501001234571', category_id: cm['Gastrointestinal'], unit_price: 6.50, requires_prescription: false },
  { name: 'Losartán 50mg', barcode: '7501001234572', category_id: cm['Cardiovascular'], unit_price: 12.30, requires_prescription: true },
  { name: 'Metformina 850mg', barcode: '7501001234573', category_id: cm['Antidiabéticos'], unit_price: 5.60, requires_prescription: true },
  { name: 'Vitamina C 1g', barcode: '7501001234574', category_id: cm['Vitaminas'], unit_price: 3.90, requires_prescription: false },
  { name: 'Diclofenaco Gel', barcode: '7501001234575', category_id: cm['Tópicos'], unit_price: 7.80, requires_prescription: false },
  { name: 'Atorvastatina 20mg', barcode: '7501001234576', category_id: cm['Cardiovascular'], unit_price: 15.40, requires_prescription: true },
];
const { data: existingBc } = await s.from('products').select('barcode');
const existSet = new Set((existingBc || []).map(p => p.barcode));
const toInsert = products.filter(p => !existSet.has(p.barcode));
if (toInsert.length > 0) {
  const r = await s.from('products').insert(toInsert);
  console.log('Products:', r.error ? 'ERR ' + r.error.message : 'OK (' + toInsert.length + ')');
} else {
  console.log('Products: already exist');
}

// 3. Branches
const { data: branches } = await s.from('branches').select('id');
const bids = branches.map(b => b.id);
console.log('Branches:', bids.length);

// 4. Inventory
const { data: prods } = await s.from('products').select('id');
const { data: existInv } = await s.from('inventory').select('product_id, branch_id');
const existInvSet = new Set((existInv || []).map(i => i.product_id + '|' + i.branch_id));
const inv = [];
prods.forEach(p => {
  bids.forEach(b => {
    const key = p.id + '|' + b;
    if (!existInvSet.has(key)) {
      inv.push({ product_id: p.id, branch_id: b, quantity: Math.floor(Math.random() * 400) + 50, min_stock_alert: 20 });
    }
  });
});
if (inv.length > 0) {
  const r = await s.from('inventory').insert(inv);
  console.log('Inventory:', r.error ? 'ERR ' + r.error.message : 'OK (' + inv.length + ')');
} else {
  console.log('Inventory: already exists');
}

// 5. Terminals
const f1 = branches[0]?.id;
const f2 = branches[1]?.id;
const f3 = branches[2]?.id;
const terminals = [
  { id: 't-0001-0000-4000-8000-000000000001', name: 'Caja Principal 1', branch_id: f1, status: 'online' },
  { id: 't-0002-0000-4000-8000-000000000002', name: 'Caja Rapida 2', branch_id: f1, status: 'online' },
  { id: 't-0003-0000-4000-8000-000000000003', name: 'Sucursal Norte', branch_id: f2, status: 'online' },
  { id: 't-0004-0000-4000-8000-000000000004', name: 'Sucursal Sur', branch_id: f3, status: 'offline' },
  { id: 't-0005-0000-4000-8000-000000000005', name: 'App Movil Admin', branch_id: null, status: 'online' },
];
const { data: existTerms } = await s.from('terminals').select('id');
const existTermSet = new Set((existTerms || []).map(t => t.id));
const toIns = terminals.filter(t => !existTermSet.has(t.id));
if (toIns.length > 0) {
  const r = await s.from('terminals').insert(toIns);
  console.log('Terminals:', r.error ? 'ERR ' + r.error.message : 'OK (' + toIns.length + ')');
} else {
  console.log('Terminals: already exist');
}

// Final count
const final = {};
for (const t of ['branches','product_categories','products','inventory','terminals']) {
  const r = await s.from(t).select('*', { count: 'exact', head: true });
  final[t] = r.count;
}
console.log('\nFinal data:');
console.log(JSON.stringify(final, null, 2));
