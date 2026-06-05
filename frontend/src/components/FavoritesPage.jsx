import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('meals')
        .select('*, meal_plans(week_start)')
        .eq('favorited', true)
        .order('created_at', { ascending: false })

      setFavorites(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function unfavorite(mealId) {
    await supabase.from('meals').update({ favorited: false }).eq('id', mealId)
    setFavorites(prev => prev.filter(m => m.id !== mealId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-stone-800 mb-6">Favorites</h1>

      {favorites.length === 0 ? (
        <div className="text-stone-400 text-center py-16">
          No favorites yet — star a meal to save it here.
        </div>
      ) : (
        <div className="space-y-3">
          {favorites.map(meal => (
            <div key={meal.id} className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <span className="text-xs text-stone-400">
                    {meal.day_of_week}
                    {meal.cook_time && <> · {meal.cook_time}</>}
                    {meal.meal_plans?.week_start && (
                      <> &middot; {new Date(meal.meal_plans.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                    )}
                  </span>
                  <h3 className="text-lg font-bold text-stone-800 mt-0.5">{meal.name}</h3>
                  <p className="text-stone-500 text-sm mt-1 leading-relaxed">{meal.description}</p>
                  <a
                    href={`https://www.allrecipes.com/search?q=${encodeURIComponent(meal.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-600 text-sm hover:underline mt-2 inline-block"
                  >
                    Find recipe →
                  </a>
                </div>
                <button
                  onClick={() => unfavorite(meal.id)}
                  title="Remove from favorites"
                  className="text-yellow-400 text-2xl hover:text-stone-300 transition-colors leading-none shrink-0"
                >
                  ★
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
