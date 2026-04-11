import { Settings, Users, Construction } from 'lucide-react'

const ICON_MAP: Record<string, typeof Settings> = {
  settings: Settings,
  users: Users,
}

export default function PlaceholderView({ view }: { view: string }) {
  const Icon = ICON_MAP[view] || Construction

  return (
    <div className="flex flex-col items-center justify-center h-96 text-slate-400">
      <Icon className="w-16 h-16 mb-4 opacity-30" />
      <h2 className="text-lg font-semibold text-slate-600">Módulo en Desarrollo</h2>
      <p className="text-sm mt-1">La vista de {view.replace(/^\w/, (c) => c.toUpperCase())} estará disponible próximamente.</p>
    </div>
  )
}
