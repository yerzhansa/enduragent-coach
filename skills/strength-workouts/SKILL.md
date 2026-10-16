---
name: strength-workouts
description: Plan a gym or strength session for a cyclist and put it on the athlete's intervals.icu calendar with create_strength_workout, then read it back with get_workout. Use when the athlete asks for strength training, gym work, weights, core or mobility sessions alongside their cycling.
---

# Strength workouts

This skill covers gym sessions for cyclists. The save and read-back protocol is the same as for cycling workouts and lives in the `intervals-icu-workouts` skill. Follow it for every strength workout too.

## Protocol in short

1. Confirm the calendar day with the athlete in their terms, such as "tomorrow, Thursday 18 March", before you write.
2. Call `create_strength_workout` once and do what the reply's `next` says.
3. On `duplicate_found`, ask the athlete. Only after a yes, call again with `confirmDuplicate: true`.
4. After `created`, call `get_workout` with the `eventId`. Report a one-line summary, then the stored description in a code block. Strength workouts have no power chart, so skip the chart line.
5. Never say "saved" without that read-back.

On `refused`, nothing was saved. Do what `next` says. These codes come from your own arguments. The `intervals-icu-workouts` skill lists the others.

| code                | What to do                                             |
| ------------------- | ------------------------------------------------------ |
| `invalid_input`     | Fix the field at the path in `details` and call again. |
| `invalid_date`      | Use a real date written `YYYY-MM-DD`.                  |
| `past_date_refused` | Pick today or a later day with the athlete.            |

## Input

`create_strength_workout` takes a flat object:

- `date`: the calendar day, `YYYY-MM-DD`, today or later.
- `name`: the calendar card title, one line, up to 120 characters.
- `description`: the whole session as plain text, up to 4000 characters. Line breaks are fine.
- `durationMinutes`: the planned length in whole minutes, 1 to 600.
- `confirmDuplicate`: leave it out, except after the athlete says yes to a second workout with the same name that day.

intervals.icu stores it as a `WeightTraining` workout.

## Writing the session text

Write one line per exercise. Each line has:

- the exercise,
- sets x reps, or sets x time for holds,
- the load: a weight such as 60 kg, or an effort from 1 to 10,
- the rest between sets.

Effort 1-10 means how hard the last rep feels. 7 means about three more reps were possible. 9 means about one more. Use effort when you do not know the athlete's weights.

Group the session into warmup, main work and finish. Use a letter and number to pair exercises done back to back, such as A1 and A2.

Keep the text to the session itself. Put the reasons, technique cues and coaching notes in your chat reply.

Example description:

```
Warmup: 8 min easy bike or rower, then hip and ankle mobility

A1 Back squat: 4 x 5 @ effort 7/10, rest 2-3 min
A2 Dead bug: 3 x 8 each side, rest 30 s
B1 Romanian deadlift: 3 x 8 @ effort 7/10, rest 2 min
B2 Bulgarian split squat: 3 x 8 each leg @ effort 7/10, rest 90 s
C1 Side plank: 3 x 30 s each side, rest 30 s

Finish: 5 min easy stretching
```

## Estimating durationMinutes

Add up the parts and round up to a whole minute:

- warmup and finish as written,
- for each exercise: sets x (time per set + rest), where a set takes about 30-60 seconds,
- about 1 minute per exercise to set up and move between stations.

For the example: warmup 8, squat 4 x (0.5 + 2.5) = 12, dead bug 3 x 1 = 3, Romanian deadlift 3 x 2.5 = 8, split squat 3 x 2.5 = 8, side plank 3 x 1.5 = 5, setup 5, finish 5. That is about 54, so send `"durationMinutes": 55`.

```json
{
  "date": "2027-03-17",
  "name": "Gym: lower body strength",
  "description": "Warmup: 8 min easy bike or rower, then hip and ankle mobility\n\nA1 Back squat: 4 x 5 @ effort 7/10, rest 2-3 min\nA2 Dead bug: 3 x 8 each side, rest 30 s\nB1 Romanian deadlift: 3 x 8 @ effort 7/10, rest 2 min\nB2 Bulgarian split squat: 3 x 8 each leg @ effort 7/10, rest 90 s\nC1 Side plank: 3 x 30 s each side, rest 30 s\n\nFinish: 5 min easy stretching",
  "durationMinutes": 55
}
```

## Gym work for cyclists

### What to include

- A squat or leg press pattern, such as back squat, goblet squat or leg press.
- A hinge, such as Romanian deadlift, trap bar deadlift or hip thrust.
- Single-leg work, such as split squats, step-ups or lunges.
- Core and trunk work, such as planks, side planks, dead bugs or bird dogs.
- Some upper-body pulling, such as rows, to balance time on the bike.

Two to four main exercises and two or three smaller ones are enough for most sessions.

### Through the season

| Phase       | Sessions per week | Focus                                                              |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| Off-season  | 2-3               | Learn the lifts, then build strength with heavier sets of 4-6 reps |
| Base        | 2                 | Strength, sets of 4-8 reps at effort 7-8                           |
| Build       | 1-2               | Keep strength with fewer sets, effort 7                            |
| Race season | 0-1               | Short, light sessions to keep the habit                            |

Start a new athlete with lighter loads, around effort 5-6, and add load over a few weeks.

### Placing it in the week

- Put heavy gym work on the same day as a hard cycling workout, after the cycling. This keeps easy days easy. Light sessions can go on easy days.
- Avoid heavy leg work the day before key intervals or a race.
- Leave at least one easy day between a heavy leg session and a long or hard cycling workout when you can.
- Fit it around the athlete's cycling plan. Ask what matters most to them this week.

### What to avoid

- Do not give medical, rehabilitation or injury advice. If the athlete mentions pain or an injury, do not plan around it. Suggest they speak with a qualified professional before training.
- Do not promise outcomes such as injury prevention or specific gains.
- Do not program maximal lifts or one-rep max tests. Keep most sets at effort 8 or below.
