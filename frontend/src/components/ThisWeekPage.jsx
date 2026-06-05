import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MealCard from './MealCard'

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function ThisWeekPage() {
  const [plan, setPlan] = useState(null)
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, week_start, meals(*, feedback(*))')
        .order('week_start', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        setError('No meal plan found yet.')
      } else {
        setPlan(data)
        setMeals(
          data.meals.sort(
            (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
          )
        )
      }
      setLoading(false)
    }
    load()
  }, [])

  function handleMealUpdate(updatedMeal) {
    setMeals(prev => prev.map(m => (m.id === updatedMeal.id ? { ...m, ...updatedMeal } : m)))
  }

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

  const weekLabel = plan?.week_start
    ? new Date(plan.week_start + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800">This week</h1>
        <p className="text-stone-400 text-sm mt-1">Week of {weekLabel}</p>
      </div>

      <div className="space-y-4">
        {meals.map(meal => (
          <MealCard key={meal.id} meal={meal} planId={plan.id} onUpdate={handleMealUpdate} />
        ))}
      </div>
    </div>
  )
}
