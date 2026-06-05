import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage() {
  const [generalInfo, setGeneralInfo] = useState('')
  const [weeklyRequests, setWeeklyRequests] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('custom_preferences')
        .select('general_info, content')
        .eq('id', 1)
        .single()

      if (data) {
        setGeneralInfo(data.general_info || '')
        setWeeklyRequests(data.content || '')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    await supabase.from('custom_preferences').upsert({
      id: 1,
      general_info: generalInfo,
      content: weeklyRequests,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Home</h1>
        <p className="text-stone-400 text-sm mt-1">
          These are read by the AI every Sunday when it generates the week&apos;s meals.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
        <h2 className="font-bold text-stone-800 mb-1">About our family</h2>
        <p className="text-stone-400 text-sm mb-3">
          Permanent info — dietary needs, who&apos;s in the family, cooking skill level, cuisines you love or hate.
        </p>
        <textarea
          value={generalInfo}
          onChange={e => setGeneralInfo(e.target.value)}
          placeholder="e.g. Family of 4 — two adults, kids aged 8 and 11. No shellfish allergies. Dad doesn't like spicy food. We love Italian and Mexican. Usually cook on a weeknight so nothing that takes over an hour."
          rows={5}
          className="w-full text-sm text-stone-600 placeholder-stone-300 border border-stone-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-orange-300 transition-colors"
        />
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
        <h2 className="font-bold text-stone-800 mb-1">This week&apos;s requests</h2>
        <p className="text-stone-400 text-sm mb-3">
          Anything specific for next week — ingredients to use up, who&apos;s visiting, what you&apos;re craving.
        </p>
        <textarea
          value={weeklyRequests}
          onChange={e => setWeeklyRequests(e.target.value)}
          placeholder="e.g. We have a lot of chicken to use up. Grandma is visiting Thursday so make something impressive that night. Avoid pasta this week."
          rows={4}
          className="w-full text-sm text-stone-600 placeholder-stone-300 border border-stone-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-orange-300 transition-colors"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-orange-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className="text-green-500 text-sm">Saved!</span>}
      </div>
    </div>
  )
}
