import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MealCard({ meal, planId, onUpdate }) {
  const existing = meal.feedback?.[0]
  const [feedbackId, setFeedbackId] = useState(existing?.id ?? null)
  const [rating, setRating] = useState(existing?.rating ?? null)
  const [madeIt, setMadeIt] = useState(existing?.made_it ?? false)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [swapping, setSwapping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function saveFeedback(updates) {
    setSaving(true)
    const payload = { meal_id: meal.id, ...updates }

    if (feedbackId) {
      await supabase.from('feedback').update(payload).eq('id', feedbackId)
    } else {
      const { data } = await supabase.from('feedback').insert(payload).select().single()
      if (data) setFeedbackId(data.id)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleRating(value) {
    setRating(value)
    await saveFeedback({ rating: value, made_it: madeIt, notes })
  }

  async function handleMadeIt() {
    const next = !madeIt
    setMadeIt(next)
    await saveFeedback({ rating, made_it: next, notes })
  }

  async function handleNotesBlur() {
    const original = existing?.notes ?? ''
    if (notes !== original) {
      await saveFeedback({ rating, made_it: madeIt, notes })
    }
  }

  async function handleSwap() {
    setSwapping(true)
    const res = await fetch('/api/swap-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mealId: meal.id, planId }),
    })
    const data = await res.json()
    if (data.meal) onUpdate(data.meal)
    setSwapping(false)
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">
            {meal.day_of_week}
          </span>
          <h3 className="text-lg font-bold text-stone-800 mt-0.5">{meal.name}</h3>
          <p className="text-stone-500 text-sm mt-1">{meal.description}</p>
        </div>
        <button
          onClick={handleSwap}
          disabled={swapping}
          className="shrink-0 text-xs text-stone-400 hover:text-orange-600 border border-stone-200 hover:border-orange-300 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {swapping ? 'Swapping...' : '↺ Swap'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map(r => (
            <button
              key={r}
              onClick={() => handleRating(r)}
              className={`text-2xl transition-transform hover:scale-110 ${
                r <= (rating ?? 0) ? 'text-orange-400' : 'text-stone-200'
              }`}
            >
              ★
            </button>
          ))}
        </div>

        <button
          onClick={handleMadeIt}
          className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full border transition-colors ${
            madeIt
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'border-stone-200 text-stone-400 hover:border-green-300 hover:text-green-600'
          }`}
        >
          {madeIt ? '✓ Made this!' : 'Made this?'}
        </button>

        {saving && <span className="text-xs text-stone-400">Saving...</span>}
        {saved && <span className="text-xs text-green-500">Saved!</span>}
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
        placeholder="Notes (optional)..."
        rows={2}
        className="mt-3 w-full text-sm text-stone-600 placeholder-stone-300 border border-stone-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-orange-300 transition-colors"
      />
    </div>
  )
}
