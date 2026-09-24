import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../lib/household'

function buildGroceryList(meals) {
  const groups = new Map()
  for (const meal of meals) {
    for (const ing of meal.ingredients || []) {
      const name = (ing.ingredient || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!groups.has(key)) groups.set(key, { ingredient: name, measures: [] })
      const measure = (ing.measure || '').trim()
      if (measure) groups.get(key).measures.push(measure)
    }
  }
  return [...groups.values()].sort((a, b) => a.ingredient.localeCompare(b.ingredient))
}

export default function GroceryListPage() {
  const { householdId } = useHousehold()
  const [planId, setPlanId] = useState(null)
  const [items, setItems] = useState([])
  const [checked, setChecked] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, meals(ingredients)')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        setError('No meal plan found yet.')
      } else {
        setPlanId(data.id)
        setItems(buildGroceryList(data.meals))
        const stored = localStorage.getItem(`grocery_checked_${data.id}`)
        setChecked(stored ? JSON.parse(stored) : [])
      }
      setLoading(false)
    }
    load()
  }, [householdId])

  function toggle(ingredient) {
    setChecked(prev => {
      const next = prev.includes(ingredient)
        ? prev.filter(i => i !== ingredient)
        : [...prev, ingredient]
      if (planId) localStorage.setItem(`grocery_checked_${planId}`, JSON.stringify(next))
      return next
    })
  }

  const remaining = useMemo(
    () => items.filter(i => !checked.includes(i.ingredient)).length,
    [items, checked]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-400">{error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800">Grocery list</h1>
        <p className="text-stone-400 text-sm mt-1">
          {items.length === 0
            ? 'No ingredients found for this week yet.'
            : `${remaining} item${remaining === 1 ? '' : 's'} left`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm divide-y divide-stone-100">
        {items.map(item => {
          const isChecked = checked.includes(item.ingredient)
          return (
            <label
              key={item.ingredient}
              className="flex items-center gap-3 px-5 py-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(item.ingredient)}
                className="w-4 h-4 accent-orange-500 rounded shrink-0"
              />
              <span className={`text-sm ${isChecked ? 'line-through text-stone-300' : 'text-stone-700'}`}>
                {item.measures.length > 0 && (
                  <span className="text-stone-400">{item.measures.join(' + ')} </span>
                )}
                {item.ingredient}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
