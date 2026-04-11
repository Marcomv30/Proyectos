import { useState } from 'react'
import { useStore } from '../lib/store'
import { Search, Package, AlertTriangle, TrendingDown, Edit } from 'lucide-react'

export default function InventoryView() {
  const { products, branches, selectedBranch, setSelectedBranch } = useStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'low' | 'prescription'>('all')

  const enrichedProducts = products.map((p) => {
    const branchInv = selectedBranch === 'all'
      ? p.inventory.reduce((sum, inv) => ({ sum: sum.sum + inv.quantity, count: sum.count + 1 }), { sum: 0, count: p.inventory.length })
      : { sum: p.inventory.find((inv) => inv.branch_id === selectedBranch)?.quantity ?? 0, count: 1 }
    return { ...p, totalStock: branchInv.sum, stockCount: branchInv.count }
  }).filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.barcode.includes(searchTerm)
    const matchFilter = filterType === 'all' || (filterType === 'low' && p.totalStock < 50) || (filterType === 'prescription' && p.requires_prescription)
    return matchSearch && matchFilter
  })

  const totalProducts = products.length
  const lowStock = products.filter((p) => p.inventory.reduce((s, inv) => s + inv.quantity, 0) < 50).length
  const totalValue = products.reduce((sum, p) => {
    const totalQty = p.inventory.reduce((s, inv) => s + inv.quantity, 0)
    return sum + p.unit_price * totalQty
  }, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Productos</p>
              <p className="text-2xl font-bold text-slate-800">{totalProducts}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Stock Bajo</p>
              <p className="text-2xl font-bold text-amber-600">{lowStock}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Valor Inventario</p>
              <p className="text-2xl font-bold text-slate-800">${totalValue.toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o código de barras..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              {(['all', 'low', 'prescription'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-3 py-2 text-xs font-medium transition ${
                    filterType === f ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'low' ? 'Stock Bajo' : 'Rx'}
                </button>
              ))}
            </div>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 focus:border-emerald-500 outline-none"
            >
              <option value="all">Todas Sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {['Producto', 'Código', 'Categoría', 'Precio', 'Stock Total', 'Tipo', 'Sucursales'].map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-xs font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enrichedProducts.map((product) => {
                const branchDetails = product.inventory
                  .map((inv) => {
                    const branch = branches.find((b) => b.id === inv.branch_id)
                    return { name: branch?.name || inv.branch_id.slice(0, 8), qty: inv.quantity }
                  })
                  .filter((x) => selectedBranch === 'all' || x.name === branches.find((b) => b.id === selectedBranch)?.name)

                return (
                  <tr key={product.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/30 transition">
                    <td className="py-3 px-3">
                      <p className="font-medium text-slate-700">{product.name}</p>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs font-mono text-slate-400">{product.barcode}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md text-xs">{product.category?.name}</span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-700">${product.unit_price.toFixed(2)}</td>
                    <td className="py-3 px-3">
                      <span className={`font-medium ${product.totalStock < 50 ? 'text-amber-600' : product.totalStock < 20 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {product.totalStock}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {product.requires_prescription ? (
                        <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded font-medium">Requiere Rx</span>
                      ) : (
                        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-medium">Libre</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="space-y-0.5 text-[10px] text-slate-400">
                        {branchDetails.map((x) => (
                          <div key={x.name}>{x.name}: {x.qty}</div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
