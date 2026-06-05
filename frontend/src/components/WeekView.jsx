import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import MealCard from './MealCard'

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function WeekView() {
  const { planId } = useParams()
  const [meals, setMeals] = useState([])
  const [weekStart, setWeekStart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('week_start, meals(*, feedback(*))')
        .eq('id', planId)
        .single()

      if (error) {
        setError('Meal plan not found.')
      } else {
        setWeekStart(data.week_start)
        setMeals(
          data.meals.sort(
            (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
          )
        )
      }
      setLoading(false)
    }
    load()
  }, [planId])

  function handleMealUpdate(updatedMeal) {
    setMeals(prev => prev.map(m => (m.id === updatedMeal.id ? { ...m, ...updatedMeal } : m)))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-400 text-lg">Loading your meal plan...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-400 text-lg">{error}</div>
      </div>
    )
  }

  const weekLabel = weekStart
    ? new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-stone-800">Dinner Ideas</h1>
        <p className="text-stone-500 mt-1">Week of {weekLabel}</p>
        <p className="text-stone-400 text-sm mt-2">
          Rate meals, mark what you made, or swap ones you don&apos;t like.
        </p>
      </div>

      <div className="space-y-4">
        {meals.map(meal => (
          <MealCard key={meal.id} meal={meal} planId={planId} onUpdate={handleMealUpdate} />
        ))}
      </div>
    </div>
  )
}
