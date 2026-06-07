import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const CUISINE_TO_CATEGORY = {
  chicken: 'Chicken', beef: 'Beef', pork: 'Pork', lamb: 'Lamb',
  fish: 'Seafood', shrimp: 'Seafood', prawn: 'Seafood',
  salmon: 'Seafood', tuna: 'Seafood', pasta: 'Pasta',
  noodle: 'Pasta', vegetarian: 'Vegetarian', vegan: 'Vegetarian',
}

async function categoryImage(mealName) {
  const lower = mealName.toLowerCase()
  const category = Object.entries(CUISINE_TO_CATEGORY).find(([kw]) => lower.includes(kw))?.[1] ?? 'Miscellaneous'
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`)
    const data = await res.json()
    const meals = data.meals || []
    if (meals.length) return meals[Math.floor(Math.random() * Math.min(meals.length, 20))].strMealThumb
  } catch {}
  return null
}

async function lookupTheMealDb(mealName) {
  try {
    const res = await fetch(
      `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(mealName)}`
    )
    const data = await res.json()
    const meal = data.meals?.[0]
    if (meal) {
      return { image_url: meal.strMealThumb || null, recipe_url: meal.strSource || null }
    }
  } catch {}
  return { image_url: await categoryImage(mealName), recipe_url: null }
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
Return ONLY a JSON object:
{
  "name": "Meal Name",
  "summary": "One punchy sentence.",
  "description": "3-4 sentences with detail.",
  "cook_time": "X minutes",
  "ingredients": [{"measure": "1 lb", "ingredient": "chicken breast"}],
  "instructions": "1. Step one.\\n2. Step two.\\n3. Step three."
}`

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = result.choices[0].message.content.trim().replace(/```(?:json)?\n?/g, '').trim()
  const suggestion = JSON.parse(text)

  const recipeData = await lookupTheMealDb(suggestion.name)

  const { data: updated } = await supabase
    .from('meals')
    .update({
      name: suggestion.name,
      summary: suggestion.summary,
      description: suggestion.description,
      cook_time: suggestion.cook_time,
      swapped: true,
      ingredients: suggestion.ingredients || null,
      instructions: suggestion.instructions || null,
      image_url: recipeData?.image_url || null,
      recipe_url: recipeData?.recipe_url || null,
    })
    .eq('id', mealId)
    .select()
    .single()

  res.json({ meal: updated })
}
