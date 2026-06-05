import os
import json
import re
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

# Edit these to change who gets the email and what address it comes from
RECIPIENT_EMAILS = [
    "jamesneff07@gmail.com",
]
SENDER_EMAIL = "onboarding@resend.dev"

# Edit this to change what kinds of meals get suggested
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
                feedback_summary.append(
                    {
                        "meal": meal["name"],
                        "rating": fb.get("rating"),
                        "made_it": fb.get("made_it"),
                        "notes": fb.get("notes"),
                    }
                )
    return feedback_summary


def fetch_custom_preferences():
    result = supabase.table("custom_preferences").select("content").eq("id", 1).execute()
    if result.data and result.data[0].get("content"):
        return result.data[0]["content"].strip()
    return ""


def build_prompt(feedback):
    custom = fetch_custom_preferences()
    custom_section = f"\nSpecial requests for this week:\n{custom}" if custom else ""

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

Preferences:
{MEAL_PREFERENCES}
{custom_section}
{feedback_text}

Return ONLY a JSON array with exactly 7 objects, one per day:
[
  {{"day": "Monday", "name": "Meal Name", "description": "3-4 sentences describing the dish — what it tastes like, key ingredients, cooking method, and why the family will enjoy it."}},
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

    plan = (
        supabase.table("meal_plans")
        .insert({"week_start": week_start.isoformat()})
        .execute()
    )
    plan_id = plan.data[0]["id"]

    meal_rows = [
        {
            "meal_plan_id": plan_id,
            "day_of_week": m["day"],
            "name": m["name"],
            "description": m["description"],
        }
        for m in meals
    ]
    supabase.table("meals").insert(meal_rows).execute()
    return plan_id


def build_email_html(meals, plan_id):
    frontend_url = os.environ["FRONTEND_URL"]
    feedback_url = f"{frontend_url}/week/{plan_id}"

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    week_label = f"{week_start.strftime('%B %d')} – {week_end.strftime('%B %d, %Y')}"

    meal_rows = ""
    for meal in meals:
        meal_rows += f"""
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #f0e8dc;font-weight:600;color:#92400e;width:110px;vertical-align:top;">{meal['day']}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #f0e8dc;">
            <strong style="color:#1c1917;">{meal['name']}</strong><br>
            <span style="color:#78716c;font-size:14px;">{meal['description']}</span>
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
          Rate &amp; Give Feedback &rarr;
        </a>
        <p style="color:#a8a29e;font-size:13px;margin-top:12px;">Rate meals, mark what you made, or swap any you don&apos;t like.</p>
      </div>
    </div>
  </div>
</body>
</html>"""


def send_email(meals, plan_id):
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    subject = f"Your dinner ideas for the week of {week_start.strftime('%B %d')}"

    resend.Emails.send(
        {
            "from": SENDER_EMAIL,
            "to": RECIPIENT_EMAILS,
            "subject": subject,
            "html": build_email_html(meals, plan_id),
        }
    )


def main():
    print("Generating meal plan...")
    meals = generate_meals()
    print(f"Generated {len(meals)} meals")

    print("Saving to database...")
    plan_id = save_meal_plan(meals)
    print(f"Saved plan {plan_id}")

    print("Sending email...")
    send_email(meals, plan_id)
    print("Done!")


if __name__ == "__main__":
    main()
