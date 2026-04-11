import { useState, useEffect } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, ShoppingCart, AlertTriangle, Activity } from 'lucide-react'

export default function DashboardView() {
  const { products, sales, terminals } = useStore()
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [chartData, setChartData] = useState<{ hora: string; ventas: number }[]>([])

  useEffect(() => {
    if (sales.length > 0) {
      const rev = sales.reduce((sum, s) => sum + s.total_amount, 0)
      setTotalRevenue(rev)

      // Group by hour
      const hours: Record<string, number> = {}
      sales.forEach((sale) => {
        const hour = new Date(sale.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
        hours[hour] = (hours[hour] || 0) + sale.total_amount
      })
      setChartData(Object.entries(hours).map(([hora, ventas]) => ({ hora, ventas })).sort())
    }
  }, [sales])

  const lowStock = products.reduce((sum, p) => {
    const totalQty = p.inventory.reduce((s, inv) => s + inv.quantity, 0)
    return sum + (totalQty < 50 ? 1 : 0)
  }, 0)

  const stats = {
    revenue: totalRevenue,
    transactions: sales.length,
    products: products.length,
    lowStock,
    terminalsOnline: terminals.filter((t) => t.status === 'online').length,
    terminalsTotal: terminals.length,
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Ingresos', value: '$' + stats.revenue.toFixed(2), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Ventas', value: String(stats.transactions), icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Productos', value: String(stats.products), icon: Activity, color: 'text-slate-600', bg: 'bg-slate-50' },
          { label: 'Stock Bajo', value: String(stats.lowStock), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" /> Ventas
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Ventas']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Line type="monotone" dataKey="ventas" stroke="#059669" strokeWidth={2.5} dot={{ fill: '#059669', r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" /> Terminales Activas
          </h3>
          <div className="text-center mb-4">
            <p className="text-3xl font-bold text-emerald-600">{stats.terminalsOnline}</p>
            <p className="text-sm text-slate-500">de {stats.terminalsTotal} terminales</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div
              className="bg-emerald-500 h-3 rounded-full transition-all"
              style={{ width: `${stats.terminalsTotal > 0 ? (stats.terminalsOnline / stats.terminalsTotal) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-4 space-y-2">
            {terminals.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{t.name}</span>
                <span className={`flex items-center gap-1 ${t.status === 'online' ? 'text-emerald-600' : 'text-red-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${t.status === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {t.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Ventas Recientes</h3>
        {sales.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay ventas registradas aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sales.slice(0, 10).map((sale) => {
              const ago = Math.floor((Date.now() - new Date(sale.created_at).getTime()) / 60000)
              return (
                <div key={sale.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">Venta #{sale.id.slice(0, 8)}</p>
                      <p className="text-xs text-slate-400">{sale.terminal_id || 'Sin terminal'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-800">${sale.total_amount.toFixed(2)}</p>
                    <p className="text-xs text-slate-400">{ago}m atrás</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
