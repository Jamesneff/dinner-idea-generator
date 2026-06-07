import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function lookupSpoonacular(mealName) {
  const apiKey = process.env.SPOONACULAR_API_KEY
  if (!apiKey) return null
  try {
    const params = new URLSearchParams({
      query: mealName,
      number: '1',
      addRecipeInformation: 'true',
      instructionsRequired: 'true',
      apiKey,
    })
    const res = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`)
    const data = await res.json()
    const recipe = data.results?.[0]
    if (!recipe) return null

    const ingredients = (recipe.extendedIngredients || [])
      .filter(ing => ing.name)
      .map(ing => ({
        measure: [ing.amount, ing.unit].filter(Boolean).join(' ').trim(),
        ingredient: ing.name,
      }))

    const steps = recipe.analyzedInstructions?.[0]?.steps || []
    const instructions = steps.map(s => `${s.number}. ${s.step}`).join('\n') || null

    return {
      image_url: recipe.image || null,
      recipe_url: recipe.sourceUrl || null,
      ingredients: ingredients.length ? ingredients : null,
      instructions,
    }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { mealId, planId } = req.body

  const [{ data: mealData }, { data: planData }] = await Promise.all([
    supabase.from('meals').select('day_of_week, name').eq('id', mealId).single(),
    supabase.from('meal_plans').select('meals(name)').eq('id', planId).single(),
  ])

  const otherMeals = planData?.meals
    ?.filter(m => m.name !== mealData.name)
    .map(m => m.name)
    .join(', ')

  const prompt = `Suggest ONE alternative dinner for ${mealData.day_of_week} to replace "${mealData.name}".
Other meals this week: ${otherMeals}.
Use a common recipe name that would be found on cooking websites (e.g. "Chicken Tikka Masala", "Beef Tacos").
Return ONLY a JSON object:
{"name": "Meal Name", "summary": "One punchy sentence.", "description": "3-4 sentences with detail.", "cook_time": "X minutes"}`

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = result.choices[0].message.content.trim().replace(/```(?:json)?\n?/g, '').trim()
  const suggestion = JSON.parse(text)

  const recipeData = await lookupSpoonacular(suggestion.name)

  const { data: updated } = await supabase
    .from('meals')
    .update({
      name: suggestion.name,
      summary: suggestion.summary,
      description: suggestion.description,
      cook_time: suggestion.cook_time,
      swapped: true,
      image_url: recipeData?.image_url || null,
      recipe_url: recipeData?.recipe_url || null,
      ingredients: recipeData?.ingredients || null,
      instructions: recipeData?.instructions || null,
    })
    .eq('id', mealId)
    .select()
    .single()

  res.json({ meal: updated })
}
