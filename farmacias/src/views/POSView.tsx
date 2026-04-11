import { useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { Search, Minus, Plus, CreditCard, DollarSign, Receipt, Phone, User, CheckCircle, X } from 'lucide-react'

export default function POSView() {
  const { cart, products, addToCart, removeFromCart, clearCart, searchTerm, setSearchTerm, processSale, terminals } = useStore()
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentProcessing, setPaymentProcessing] = useState(false)
  const [saleSuccess, setSaleSuccess] = useState(false)
  const [saleError, setSaleError] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerInfo, setCustomerInfo] = useState(false)

  const filteredProducts = products.filter((p) => {
    const term = searchTerm.toLowerCase()
    return p.name.toLowerCase().includes(term) || p.barcode.includes(searchTerm)
  })

  const subtotal = cart.reduce((sum, item) => sum + item.product.unit_price * item.quantity, 0)
  const tax = subtotal * 0.16
  const total = subtotal + tax

  const onlineTerminal = terminals.find(t => t.status === 'online')

  const handleCheckout = async () => {
    if (!customerPhone) {
      setCustomerInfo(false)
    }
    setPaymentProcessing(true)
    setSaleError('')

    const result = await processSale(
      cart,
      'both',
      customerPhone || '',
      customerName || '',
    )
    setPaymentProcessing(false)

    if (result.success) {
      setSaleSuccess(true)
      setTimeout(() => {
        setSaleSuccess(false)
        setShowCheckout(false)
        setCustomerPhone('')
        setCustomerName('')
      }, 3000)
    } else {
      setSaleError(result.error || 'Error al procesar la venta')
    }
  }

  if (saleSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Venta Completada</h2>
        <p className="text-slate-500">Se ha registrado la venta correctamente</p>
        {customerPhone && <p className="text-xs text-emerald-600 mt-2">Factura pendiente de envío al {customerPhone}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-9rem)]">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar medicamento..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
            />
          </div>
          <div className="flex gap-2 mt-2 text-xs text-slate-400">
            <span>{products.length} productos cargados</span>
            {onlineTerminal && <span className="text-emerald-600">· Terminal: {onlineTerminal.name}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Search className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {filteredProducts.map((product) => {
                const totalStock = product.inventory.reduce((s, inv) => s + inv.quantity, 0)
                const inCart = cart.find((c) => c.product.id === product.id)
                return (
                  <button
                    key={product.id}
                    onClick={() => totalStock > 0 && addToCart(product)}
                    disabled={totalStock === 0}
                    className={`bg-white rounded-xl border p-3.5 text-left transition group ${
                      totalStock === 0
                        ? 'border-slate-100 opacity-50 cursor-not-allowed'
                        : 'border-slate-100 hover:border-emerald-200 hover:shadow-sm'
                    } ${inCart ? 'ring-2 ring-emerald-300' : ''}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-[10px] text-slate-400 font-mono">{product.barcode}</span>
                      {product.requires_prescription && (
                        <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">Rx</span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700 mb-1 line-clamp-2">{product.name}</p>
                    <p className="text-[11px] text-slate-400 mb-2">{product.category?.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-600">${product.unit_price.toFixed(2)}</span>
                      {totalStock === 0 ? (
                        <span className="text-xs text-red-500 font-medium">Agotado</span>
                      ) : totalStock < 20 ? (
                        <span className="text-xs text-amber-500">{totalStock} uds</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">{totalStock} uds</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-96 bg-white rounded-2xl border border-slate-100 flex flex-col shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">Carrito de Venta</h3>
          <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg font-medium">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} items
          </span>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Receipt className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs">Carrito vacío</p>
            </div>
          ) : (
            cart.map((item) => {
              const totalStock = item.product.inventory.reduce((s, inv) => s + inv.quantity, 0)
              return (
                <div key={item.product.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-400">${item.product.unit_price.toFixed(2)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => removeFromCart(item.product.id)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100">
                      <Minus className="w-3 h-3 text-slate-500" />
                    </button>
                    <span className="w-7 text-center text-sm font-medium">{item.quantity}</span>
                    <button onClick={() => addToCart(item.product)} disabled={item.quantity >= totalStock} className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center hover:bg-emerald-700 disabled:opacity-30">
                      <Plus className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 w-16 text-right">
                    ${(item.product.unit_price * item.quantity).toFixed(2)}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-4 border-t border-slate-100 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>IVA (16%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-800 pt-1 border-t border-slate-100">
                <span>Total</span>
                <span className="text-emerald-600">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Customer info toggle */}
            {customerInfo && (
              <div className="space-y-2 p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <User className="w-3.5 h-3.5" /> Cliente
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nombre"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs focus:border-emerald-500 outline-none"
                  />
                  <div className="flex-1 relative">
                    <Phone className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+52 55..."
                      className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 text-xs focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>
                <button onClick={() => setCustomerInfo(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
              </div>
            )}

            <div className="flex gap-2">
              {!customerInfo && !customerPhone && (
                <button onClick={() => setCustomerInfo(true)} className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition" title="Agregar cliente">
                  <User className="w-4 h-4 text-slate-500" />
                </button>
              )}
              <button
                onClick={() => setShowCheckout(true)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" /> Cobrar
              </button>
              <button className="p-2.5 bg-slate-100 rounded-xl hover:bg-slate-200 transition" title="Efectivo">
                <DollarSign className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}

        {/* Checkout Modal */}
        {showCheckout && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-700">Confirmar Cobro</h3>
                <button onClick={() => { setShowCheckout(false); setSaleError('') }} className="p-1 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-slate-500">Total a cobrar</p>
                <p className="text-3xl font-bold text-emerald-600">${total.toFixed(2)}</p>
                <p className="text-xs text-slate-400 mt-1">{cart.length} productos</p>
              </div>
              {saleError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-3">{saleError}</div>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setShowCheckout(false); setSaleError('') }} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={paymentProcessing}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {paymentProcessing ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando...</>
                  ) : (
                    <><CheckCircle className="w-4 h-4" /> Confirmar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
