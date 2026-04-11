import { useState } from 'react'
import { mockTerminals } from '../lib/mock-data'
import type { Terminal } from '../lib/supabase'
import { Monitor, Wifi, WifiOff, Clock, RefreshCw, MapPin } from 'lucide-react'

export default function TerminalsView() {
  const [terminals] = useState<Terminal[]>(mockTerminals)
  const [syncing, setSyncing] = useState(false)

  const handleSync = () => {
    setSyncing(true)
    setTimeout(() => setSyncing(false), 1500)
  }

  const onlineCount = terminals.filter((t) => t.status === 'online').length

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Terminales Activas</p>
          <p className="text-3xl font-bold text-slate-800">
            {onlineCount} <span className="text-lg text-slate-400 font-normal">/ {terminals.length}</span>
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Sincronizar Todo
        </button>
      </div>

      {/* Terminal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {terminals.map((terminal) => (
          <div key={terminal.id} className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  terminal.status === 'online' ? 'bg-emerald-50' : 'bg-red-50'
                }`}>
                  <Monitor className={`w-5 h-5 ${terminal.status === 'online' ? 'text-emerald-600' : 'text-red-500'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{terminal.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{terminal.id}</p>
                </div>
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${
                terminal.status === 'online' ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {terminal.status === 'online' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {terminal.status === 'online' ? 'Online' : 'Offline'}
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                <span>{terminal.branch_id.replace('_', ' ').replace('farmacia ', 'Farmacia ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Última actividad: {new Date(terminal.last_seen).toLocaleTimeString()}</span>
              </div>
            </div>

            {terminal.status === 'online' && (
              <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Operador: {terminal.operator_user_id}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
