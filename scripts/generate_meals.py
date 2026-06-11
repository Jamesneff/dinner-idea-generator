import os
import json
import re
import urllib.request
import urllib.parse
from datetime import date, timedelta
from dotenv import load_dotenv
from groq import Groq
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from supabase import create_client

load_dotenv()

groq_client = Groq(api_key=os.environ["GROQ_API_KEY"])
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

RECIPIENT_EMAILS = [
    "jamesneff07@gmail.com",
    "janiceneff@yahoo.com",
]
SENDER_EMAIL = os.environ.get("GMAIL_SENDER", "jamesneff07@gmail.com")

MEAL_PREFERENCES = """
- Family of 4, no food allergies
- Avoid beef
- Dislike Indian food
- Enjoy fish and chicken primarily as meats
- Prefer weeknight meals that take under an hour
- Enjoy Italian, Mediterranean, American, Mexican, and Asian cuisines
- Mix of simple and slightly more adventurous meals
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


def hi_res_image(url):
    """Spoonacular images come in fixed sizes; upgrade to the largest (636x393)."""
    if not url:
        return None
    return re.sub(r"-\d+x\d+(\.\w+)$", r"-636x393\1", url)


def plain_instructions(info):
    """Fall back to the plain `instructions` field when analyzedInstructions is empty."""
    raw = (info.get("instructions") or "").strip()
    if not raw:
        return None
    # Strip HTML tags (some recipes return <ol><li> markup) and split into steps
    text = re.sub(r"<[^>]+>", "\n", raw)
    text = re.sub(r"&[a-z]+;", " ", text)
    parts = [p.strip() for p in re.split(r"\r?\n|(?<=[.!?])\s+(?=[A-Z])", text) if p.strip()]
    return "\n".join(parts) or None


def lookup_spoonacular(search_query, display_name=None):
    api_key = os.environ.get("SPOONACULAR_API_KEY", "")
    label = display_name or search_query
    if not api_key:
        print(f"  No Spoonacular API key set")
        return None
    try:
        # Step 1: find the recipe ID and image
        params = urllib.parse.urlencode({"query": search_query, "number": 1, "apiKey": api_key})
        req = urllib.request.Request(
            f"https://api.spoonacular.com/recipes/complexSearch?{params}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            results = json.loads(r.read()).get("results") or []

        if not results:
            print(f"  No Spoonacular match for '{label}' (query: '{search_query}')")
            return None

        recipe_id = results[0]["id"]
        image_url = results[0].get("image")

        # Step 2: fetch full recipe info (ingredients + instructions)
        req2 = urllib.request.Request(
            f"https://api.spoonacular.com/recipes/{recipe_id}/information?includeNutrition=false&apiKey={api_key}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req2, timeout=10) as r2:
            info = json.loads(r2.read())

        print(f"  Matched '{info.get('title')}' for: {label}")

        ingredients = []
        for ing in info.get("extendedIngredients") or []:
            name = (ing.get("name") or "").strip()
            amount = ing.get("amount", "")
            unit = (ing.get("unit") or "").strip()
            measure = f"{amount} {unit}".strip() if amount else unit
            if name:
                ingredients.append({"measure": measure, "ingredient": name})

        steps = (info.get("analyzedInstructions") or [{}])[0].get("steps") or []
        # Store plain step text — MealCard handles numbering in the UI
        instructions = "\n".join(s["step"] for s in steps) or plain_instructions(info)

        return {
            "image_url": hi_res_image(image_url or info.get("image")),
            "recipe_url": info.get("sourceUrl") or None,
            "ingredients": ingredients or None,
            "instructions": instructions,
        }
    except Exception as e:
        print(f"  Spoonacular lookup failed for '{label}': {e}")
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
    "name": "Creative Meal Name",
    "search_query": "Simple Dish Name",
    "summary": "One punchy sentence for the email — what it is and why it's great.",
    "description": "3-4 sentences — flavors, key ingredients, cooking method, and why the family will love it.",
    "cook_time": "30 minutes"
  }},
  ...
]

"name" can be creative/descriptive. "search_query" MUST be a simple, common 1-3 word recipe name that exists on cooking websites — the core dish only, no side dishes or extra adjectives. Examples:
- name "Baked Cod with Mediterranean Quinoa" -> search_query "Baked Cod"
- name "Shrimp and Chicken Jambalaya" -> search_query "Jambalaya"
- name "Chicken and Vegetable Stir-Fry" -> search_query "Chicken Stir Fry"
- name "Grilled Chicken Skewers with Pasta Salad" -> search_query "Grilled Chicken Skewers"

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

    for i, meal_data in enumerate(result.data):
        m = meals[i]
        query = m.get("search_query") or m["name"]
        print(f"  Looking up recipe for: {m['name']}")
        # Try the simple search query first, fall back to the full name
        recipe = lookup_spoonacular(query, m["name"])
        if not recipe and query != m["name"]:
            recipe = lookup_spoonacular(m["name"], m["name"])
        if recipe:
            supabase.table("meals").update(recipe).eq("id", meal_data["id"]).execute()
        else:
            print(f"  No recipe data found for: {m['name']}")

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
    result = supabase.table("meals").select("*").eq("meal_plan_id", plan_id).execute()
    meals_with_data = sorted(
        result.data,
        key=lambda m: DAYS.index(m["day_of_week"]) if m["day_of_week"] in DAYS else 99,
    )

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    subject = f"Your dinner ideas for the week of {week_start.strftime('%B %d')}"

    html_body = build_email_html(meals_with_data, plan_id)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = ", ".join(RECIPIENT_EMAILS)
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(SENDER_EMAIL, os.environ["GMAIL_APP_PASSWORD"])
        smtp.sendmail(SENDER_EMAIL, RECIPIENT_EMAILS, msg.as_string())


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
