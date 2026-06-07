import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MealCard({ meal, planId, onUpdate }) {
  const existing = meal.feedback?.[0]
  const [feedbackId, setFeedbackId] = useState(existing?.id ?? null)
  const [rating, setRating] = useState(existing?.rating ?? null)
  const [madeIt, setMadeIt] = useState(existing?.made_it ?? false)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [favorited, setFavorited] = useState(meal.favorited ?? false)
  const [swapping, setSwapping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [checkedIngredients, setCheckedIngredients] = useState([])

  const ingredients = meal.ingredients || []
  const steps = meal.instructions
    ? meal.instructions.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : []
  const recipeUrl =
    meal.recipe_url ||
    `https://www.allrecipes.com/search?q=${encodeURIComponent(meal.name)}`
  const recipeLabel = meal.recipe_url ? 'View recipe →' : 'Find recipe →'

  function toggleIngredient(i) {
    setCheckedIngredients(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
    )
  }

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
    if (notes !== (existing?.notes ?? '')) {
      await saveFeedback({ rating, made_it: madeIt, notes })
    }
  }

  async function handleFavorite() {
    const next = !favorited
    setFavorited(next)
    await supabase.from('meals').update({ favorited: next }).eq('id', meal.id)
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
    setExpanded(false)
    setCheckedIngredients([])
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      {meal.image_url && (
        <img src={meal.image_url} alt={meal.name} className="w-full h-48 object-cover" />
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <span className="text-xs font-semibold text-orange-600 uppercase tracking-wide">
              {meal.day_of_week}
              {meal.cook_time && (
                <span className="text-stone-400 font-normal normal-case tracking-normal ml-2">
                  · {meal.cook_time}
                </span>
              )}
            </span>
            <h3 className="text-lg font-bold text-stone-800 mt-0.5">{meal.name}</h3>
            <p className="text-stone-500 text-sm mt-1 leading-relaxed">{meal.description}</p>
            <a
              href={recipeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 text-sm hover:underline mt-2 inline-block"
            >
              {recipeLabel}
            </a>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleFavorite}
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
              className={`text-2xl transition-colors leading-none ${
                favorited ? 'text-yellow-400' : 'text-stone-200 hover:text-yellow-300'
              }`}
            >
              ★
            </button>
            <button
              onClick={handleSwap}
              disabled={swapping}
              className="text-xs text-stone-400 hover:text-orange-600 border border-stone-200 hover:border-orange-300 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {swapping ? 'Swapping...' : '↺ Swap'}
            </button>
          </div>
        </div>

        {(ingredients.length > 0 || steps.length > 0) && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
            >
              {expanded ? '▲ Hide ingredients & steps' : '▼ Ingredients & steps'}
            </button>

            {expanded && (
              <div className="mt-3 space-y-4">
                {ingredients.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                      Ingredients
                    </h4>
                    <ul className="space-y-1">
                      {ingredients.map((ing, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checkedIngredients.includes(i)}
                            onChange={() => toggleIngredient(i)}
                            className="w-4 h-4 accent-orange-500 rounded"
                          />
                          <span
                            className={`text-sm transition-colors ${
                              checkedIngredients.includes(i)
                                ? 'line-through text-stone-300'
                                : 'text-stone-600'
                            }`}
                          >
                            {ing.measure && (
                              <span className="text-stone-400">{ing.measure} </span>
                            )}
                            {ing.ingredient}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {steps.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">
                      Steps
                    </h4>
                    <ol className="space-y-2">
                      {steps.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm text-stone-600">
                          <span className="text-orange-400 font-bold shrink-0">{i + 1}.</span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
    </div>
  )
}
