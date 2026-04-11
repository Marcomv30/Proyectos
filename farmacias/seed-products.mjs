import { createClient } from '@supabase/supabase-js';
const s = createClient(
  'https://egwzbevdxjmgkpphtlol.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnd3piZXZkeGptZ2twcGh0bG9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTAyNjgsImV4cCI6MjA5MTA4NjI2OH0.oF-rCunnxoOgR8bY0hPWXNzqaAdI_YAPyl_Nu6KQ4S0'
);

const cats = await s.from('product_categories').select('id, name');
const cm = {};
cats.data.forEach(c => cm[c.name] = c.id);
console.log('Categories:', Object.keys(cm).join(', '));

// Products - insert directly via JS client (needs admin key since anon has RLS)
// We'll use the raw category IDs
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

// Check which already exist
const existing = await s.from('products').select('barcode');
const existingBarcodes = new Set(existing.data.map(p => p.barcode));
const toInsert = products.filter(p => !existingBarcodes.has(p.barcode));
console.log('To insert:', toInsert.length);

if (toInsert.length > 0) {
  const result = await s.from('products').insert(toInsert);
  if (result.error) {
    console.log('ERROR:', result.error.message);
    console.log('Hint: Need service_role key to bypass RLS');
  } else {
    console.log('Products inserted successfully');
  }
}
