import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-stone-50">
      <aside className="w-48 shrink-0 bg-white border-r border-stone-200 p-4 flex flex-col gap-1">
        <div className="mb-6 px-2">
          <span className="font-bold text-stone-800 text-base">Dinner Ideas</span>
        </div>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/this-week">This week</NavLink>
        <NavLink to="/favorites">Favorites</NavLink>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

function NavLink({ to, children }) {
  const { pathname } = useLocation()
  const active = to === '/' ? pathname === '/' : pathname.startsWith(to)

  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-orange-50 text-orange-700' : 'text-stone-600 hover:bg-stone-100'
      }`}
    >
      {children}
    </Link>
  )
}
