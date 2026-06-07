import os
import json
import re
import urllib.request
import urllib.parse
from datetime import date, timedelta
from dotenv import load_dotenv
from groq import Groq
import resend
from supabase import create_client

load_dotenv()

groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
resend.api_key = os.environ["RESEND_API_KEY"]
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

RECIPIENT_EMAILS = [
    "jamesneff07@gmail.com",
]
SENDER_EMAIL = "onboarding@resend.dev"

MEAL_PREFERENCES = """
- Family of 3, no food allergies
- Prefer weeknight meals that take under 45 minutes
- Enjoy Italian, Mexican, and Asian cuisines
- Mix of simple and slightly more adventurous meals
- Avoid heavy or overly rich dishes
"""


def fetch_recent_feedback():
    four_weeks_ago = (date.today() - timedelta(weeks=4)).isoformat()
    result = (
        supabase.table("meal_plans")
        .select("*, meals(*, feedback(*))")
        .gte("week_start", four_weeks_ago)
        .execute()
    )
    feedback_summary = []
    for plan in result.data:
        for meal in plan.get("meals", []):
            for fb in meal.get("feedback", []):
                feedback_summary.append({
                    "meal": meal["name"],
                    "rating": fb.get("rating"),
                    "made_it": fb.get("made_it"),
                    "notes": fb.get("notes"),
                })
    return feedback_summary


def fetch_db_preferences():
    result = supabase.table("custom_preferences").select("content, general_info").eq("id", 1).execute()
    if not result.data:
        return "", ""
    row = result.data[0]
    return row.get("general_info", "") or "", row.get("content", "") or ""


def lookup_themealdb(meal_name):
    try:
        encoded = urllib.parse.quote(meal_name)
        url = f"https://www.themealdb.com/api/json/v1/1/search.php?s={encoded}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read())

        meal = (data.get("meals") or [None])[0]
        if not meal:
            return None

        ingredients = []
        for i in range(1, 21):
            ingredient = (meal.get(f"strIngredient{i}") or "").strip()
            measure = (meal.get(f"strMeasure{i}") or "").strip()
            if ingredient:
                ingredients.append({"ingredient": ingredient, "measure": measure})

        return {
            "image_url": meal.get("strMealThumb"),
            "recipe_url": meal.get("strSource") or None,
            "ingredients": ingredients,
            "instructions": meal.get("strInstructions") or None,
        }
    except Exception as e:
        print(f"  TheMealDB lookup failed for '{meal_name}': {e}")
        return None


def build_prompt(feedback):
    general_info, weekly_requests = fetch_db_preferences()
    general_section = f"\nFamily info:\n{general_info.strip()}" if general_info.strip() else ""
    weekly_section = f"\nSpecial requests for this week:\n{weekly_requests.strip()}" if weekly_requests.strip() else ""

    feedback_text = ""
    if feedback:
        liked = [f for f in feedback if f["rating"] and f["rating"] >= 4]
        disliked = [f for f in feedback if f["rating"] and f["rating"] <= 2]
        made = [f for f in feedback if f["made_it"]]
        if liked:
            feedback_text += f"\nHighly rated recently: {', '.join(f['meal'] for f in liked[:5])}"
        if disliked:
            feedback_text += f"\nLow rated (avoid similar): {', '.join(f['meal'] for f in disliked[:5])}"
        if made:
            feedback_text += f"\nActually cooked recently (avoid repeating): {', '.join(f['meal'] for f in made[:7])}"
        notes = [f["notes"] for f in feedback if f.get("notes")]
        if notes:
            feedback_text += f"\nFeedback notes: {'; '.join(notes[:3])}"

    return f"""Generate 7 dinner ideas for the week ahead.

Default preferences:
{MEAL_PREFERENCES}
{general_section}
{weekly_section}
{feedback_text}

Return ONLY a JSON array with exactly 7 objects, one per day:
[
  {{
    "day": "Monday",
    "name": "Meal Name",
    "summary": "One punchy sentence for the email — what it is and why it's great.",
    "description": "3-4 sentences — flavors, key ingredients, cooking method, and why the family will love it.",
    "cook_time": "30 minutes"
  }},
  ...
]

Make meals varied, practical, and appealing. No markdown, just the JSON array."""


def generate_meals():
    feedback = fetch_recent_feedback()
    prompt = build_prompt(feedback)
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
    )
    text = re.sub(r"```(?:json)?\n?", "", response.choices[0].message.content.strip()).strip()
    return json.loads(text)


def save_meal_plan(meals):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    plan = supabase.table("meal_plans").insert({"week_start": week_start.isoformat()}).execute()
    plan_id = plan.data[0]["id"]

    meal_rows = [
        {
            "meal_plan_id": plan_id,
            "day_of_week": m["day"],
            "name": m["name"],
            "summary": m.get("summary", ""),
            "description": m.get("description", ""),
            "cook_time": m.get("cook_time", ""),
        }
        for m in meals
    ]
    result = supabase.table("meals").insert(meal_rows).execute()

    # Enrich each meal with recipe data from TheMealDB
    for i, meal_data in enumerate(result.data):
        print(f"  Looking up recipe for: {meals[i]['name']}")
        recipe = lookup_themealdb(meals[i]["name"])
        if recipe:
            supabase.table("meals").update(recipe).eq("id", meal_data["id"]).execute()
            print(f"  Found recipe data for: {meals[i]['name']}")
        else:
            print(f"  No TheMealDB match for: {meals[i]['name']}")

    return plan_id


def build_email_html(meals_with_data, plan_id):
    frontend_url = os.environ["FRONTEND_URL"]
    feedback_url = f"{frontend_url}/this-week"

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    week_label = f"{week_start.strftime('%B %d')} – {week_end.strftime('%B %d, %Y')}"

    meal_rows = ""
    for meal in meals_with_data:
        cook_time = meal.get("cook_time", "")
        time_tag = f'<span style="color:#a8a29e;font-size:12px;"> · {cook_time}</span>' if cook_time else ""
        recipe_url = meal.get("recipe_url")
        recipe_link = (
            f'<br><a href="{recipe_url}" style="color:#ea580c;font-size:12px;text-decoration:none;">View recipe →</a>'
            if recipe_url
            else f'<br><a href="https://www.allrecipes.com/search?q={urllib.parse.quote(meal["name"])}" style="color:#ea580c;font-size:12px;text-decoration:none;">Find recipe →</a>'
        )
        meal_rows += f"""
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0e8dc;font-weight:600;color:#92400e;width:110px;vertical-align:top;">{meal['day_of_week']}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #f0e8dc;">
            <strong style="color:#1c1917;">{meal['name']}</strong>{time_tag}<br>
            <span style="color:#78716c;font-size:14px;">{meal.get('summary', '')}</span>
            {recipe_link}
          </td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#ea580c;padding:32px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;">Dinner Ideas</h1>
      <p style="margin:8px 0 0;color:#fed7aa;font-size:15px;">{week_label}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;">{meal_rows}
      </table>
      <div style="text-align:center;margin-top:28px;">
        <a href="{feedback_url}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">
          View &amp; Give Feedback &rarr;
        </a>
        <p style="color:#a8a29e;font-size:13px;margin-top:12px;">Rate meals, mark what you made, or swap any you don&apos;t like.</p>
      </div>
    </div>
  </div>
</body>
</html>"""


def send_email(meals, plan_id):
    # Fetch saved meals with recipe_url for the email
    result = supabase.table("meals").select("*").eq("meal_plan_id", plan_id).execute()
    meals_with_data = sorted(
        result.data,
        key=lambda m: DAYS.index(m["day_of_week"]) if m["day_of_week"] in DAYS else 99,
    )

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    subject = f"Your dinner ideas for the week of {week_start.strftime('%B %d')}"

    resend.Emails.send({
        "from": SENDER_EMAIL,
        "to": RECIPIENT_EMAILS,
        "subject": subject,
        "html": build_email_html(meals_with_data, plan_id),
    })


def main():
    print("Generating meal plan...")
    meals = generate_meals()
    print(f"Generated {len(meals)} meals")

    print("Saving to database and fetching recipe data...")
    plan_id = save_meal_plan(meals)
    print(f"Saved plan {plan_id}")

    print("Sending email...")
    send_email(meals, plan_id)
    print("Done!")


if __name__ == "__main__":
    main()
