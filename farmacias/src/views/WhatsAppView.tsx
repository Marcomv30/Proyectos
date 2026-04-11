import { useState } from 'react'
import { useStore } from '../lib/store'
import { MessageSquare, Send, RefreshCw, CheckCircle, XCircle, Phone, Clock } from 'lucide-react'

const MOCK_MESSAGES = [
  { id: 1, phone: '+52 55 1234 5678', message: 'Factura de compra #2847 - XML/PDF adjunto', status: 'sent' as const, type: 'invoice', time: 'Hace 5 min' },
  { id: 2, phone: '+52 55 8765 4321', message: 'Recordatorio: su tratamiento de Losartán vence pronto', status: 'sent' as const, type: 'treatment_reminder', time: 'Hace 12 min' },
  { id: 3, phone: '+52 55 1111 2222', message: 'Factura de compra #2845', status: 'failed' as const, type: 'invoice', time: 'Hace 20 min' },
  { id: 4, phone: '+52 55 3333 4444', message: 'Su pedido está listo para recoger en Farmacia Centro', status: 'sent' as const, type: 'invoice', time: 'Hace 30 min' },
  { id: 5, phone: '+52 55 5555 6666', message: 'Recordatorio: reabastecimiento de Metformina 850mg', status: 'pending' as const, type: 'treatment_reminder', time: 'Hace 45 min' },
]

export default function WhatsAppView() {
  const { whatsappStatus, setWhatsappStatus } = useStore()
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  const statusConfig = {
    connected: { label: 'Conectado', icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    connecting: { label: 'Conectando...', icon: RefreshCw, color: 'text-amber-600', bg: 'bg-amber-50' },
    disconnected: { label: 'Desconectado', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  }
  const status = statusConfig[whatsappStatus]

  const handleTest = () => {
    setSendingTest(true)
    setTimeout(() => {
      setSendingTest(false)
      setTestPhone('')
      setTestMessage('')
    }, 1500)
  }

  const stats = {
    sent: MOCK_MESSAGES.filter((m) => m.status === 'sent').length,
    failed: MOCK_MESSAGES.filter((m) => m.status === 'failed').length,
    pending: MOCK_MESSAGES.filter((m) => m.status === 'pending').length,
  }

  return (
    <div className="space-y-5">
      {/* Connection Status */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-700">WhatsApp Cloud API</h3>
              <p className="text-xs text-slate-400">Envío de notificaciones y recordatorios</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${status.bg}`}>
              <status.icon className={`w-4 h-4 ${status.color} ${whatsappStatus === 'connecting' ? 'animate-spin' : ''}`} />
              <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
            </div>
            <button
              onClick={() => setWhatsappStatus(whatsappStatus === 'connected' ? 'disconnected' : 'connected')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                whatsappStatus === 'connected'
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {whatsappStatus === 'connected' ? 'Desconectar' : 'Conectar'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{stats.sent}</p>
          <p className="text-xs text-slate-500 mt-1">Enviados</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          <p className="text-xs text-slate-500 mt-1">Pendientes</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{stats.failed}</p>
          <p className="text-xs text-slate-500 mt-1">Fallidos</p>
        </div>
      </div>

      {/* Test Message */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Envío de Prueba</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="+52 55 ..."
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
          />
          <input
            type="text"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Mensaje de prueba..."
            className="flex-[2] px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
          />
          <button
            onClick={handleTest}
            disabled={sendingTest || !testPhone}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition flex items-center gap-2 disabled:opacity-50"
          >
            {sendingTest ? <Clock className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar
          </button>
        </div>
      </div>

      {/* Message Log */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Registro de Mensajes</h3>
        <div className="space-y-2">
          {MOCK_MESSAGES.map((msg) => (
            <div key={msg.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
              <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-slate-500">{msg.phone}</p>
                <p className="text-sm text-slate-700 mt-0.5 truncate">{msg.message}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    msg.type === 'invoice' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {msg.type === 'invoice' ? 'Factura' : 'Recordatorio'}
                  </span>
                  <span className="text-[10px] text-slate-400">{msg.time}</span>
                </div>
              </div>
              <span className={`flex-shrink-0 ${
                msg.status === 'sent' ? 'text-emerald-500' : msg.status === 'failed' ? 'text-red-500' : 'text-amber-500'
              }`}>
                {msg.status === 'sent' && <CheckCircle className="w-5 h-5" />}
                {msg.status === 'failed' && <XCircle className="w-5 h-5" />}
                {msg.status === 'pending' && <Clock className="w-5 h-5" />}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
