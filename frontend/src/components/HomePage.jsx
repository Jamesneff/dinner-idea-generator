import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MealCard from './MealCard'

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function HomePage() {
  const [latestPlan, setLatestPlan] = useState(null)
  const [meals, setMeals] = useState([])
  const [preferences, setPreferences] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: prefData }, { data: planData }] = await Promise.all([
        supabase.from('custom_preferences').select('content').eq('id', 1).single(),
        supabase
          .from('meal_plans')
          .select('id, week_start, meals(*, feedback(*))')
          .order('week_start', { ascending: false })
          .limit(1)
          .single(),
      ])

      if (prefData) setPreferences(prefData.content || '')

      if (planData) {
        setLatestPlan(planData)
        setMeals(
          planData.meals.sort(
            (a, b) => DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
          )
        )
      }
      setLoading(false)
    }
    load()
  }, [])

  async function savePreferences() {
    setSaving(true)
    await supabase
      .from('custom_preferences')
      .upsert({ id: 1, content: preferences, updated_at: new Date().toISOString() })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

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

  const weekLabel = latestPlan?.week_start
    ? new Date(latestPlan.week_start + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm mb-8">
        <h2 className="font-bold text-stone-800 mb-1">Requests for next week</h2>
        <p className="text-stone-400 text-sm mb-3">
          Tell the AI anything specific — ingredients you have, who&apos;s eating, dietary needs, anything you&apos;re craving.
        </p>
        <textarea
          value={preferences}
          onChange={e => setPreferences(e.target.value)}
          placeholder="e.g. We have chicken to use up. Dad is visiting so make something impressive. Avoid seafood this week."
          rows={4}
          className="w-full text-sm text-stone-600 placeholder-stone-300 border border-stone-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-orange-300 transition-colors"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={savePreferences}
            disabled={saving}
            className="bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save for next week'}
          </button>
          {saved && <span className="text-green-500 text-sm">Saved!</span>}
        </div>
      </div>

      {latestPlan && (
        <>
          <h2 className="font-bold text-stone-800 text-lg mb-4">This week · {weekLabel}</h2>
          <div className="space-y-4">
            {meals.map(meal => (
              <MealCard
                key={meal.id}
                meal={meal}
                planId={latestPlan.id}
                onUpdate={handleMealUpdate}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
