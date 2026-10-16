---
name: intervals-icu-workouts
description: Design a structured cycling workout and put it on the athlete's intervals.icu calendar with create_cycling_workout, then read it back with get_workout. Use when the athlete asks to plan, build, schedule or add a cycling or indoor trainer workout, or asks what was stored on their calendar. Also holds the save and read-back protocol that every create follows, strength included.
---

# intervals.icu workouts

This skill covers cycling workouts from design to read-back. The protocol section applies to every create, cycling and strength alike. For gym sessions, also use the `strength-workouts` skill. For zone bands, use the `power-zones` skill.

## What the plugin can do

- `create_cycling_workout` puts a structured cycling workout on the athlete's calendar.
- `create_strength_workout` puts a strength or gym session on the calendar.
- `get_workout` reads one workout back by its `eventId`.

The plugin only creates workouts. It never edits, moves or deletes them. It never reads activities, fitness, fatigue or form.

If the athlete asks for a running, swimming or any other workout, say that this plugin creates only cycling and strength workouts. Stop there. Do not save it as a cycling or strength workout.

## Protocol for every create

### 1. Confirm the date first

Work out the calendar day in the athlete's own time zone. Say it back in their terms before you write anything: "tomorrow, Thursday 18 March". Wait for the athlete to agree. If they say "next week" or "after my race", ask which day.

The tools refuse days before today in the athlete's time zone. Write the date as `YYYY-MM-DD`.

### 2. Create

Call `create_cycling_workout` or `create_strength_workout` once. Every reply is JSON with `status`, `saved` and `next`. `saved` is `yes`, `no` or `unknown`. Do what `next` says.

### 3. Handle the reply

**`created`**: the workout is on the calendar. Go to the read-back. Do not tell the athlete anything is saved yet.

**`duplicate_found`**: a workout with the same name is already on that day. Nothing was saved. `existing` lists what is there. Tell the athlete and ask whether to add a second one. Only after a clear yes, call the same tool again with the same arguments and `confirmDuplicate: true`.

The plugin cannot replace or delete the old workout. If the athlete wants to replace it, tell them to remove the old one in intervals.icu first, then call again without `confirmDuplicate`. Another fix is a different name.

**`uncertain`**: intervals.icu may or may not have stored the workout. Follow the reply's `next`. Call the same tool again with the same arguments and without `confirmDuplicate`.

- If that returns `duplicate_found` and `existing` lists the same `externalId` as the uncertain reply, the first call saved it. Read it back with `get_workout` using that entry's `eventId`.
- If that returns `created`, the first call did not save it and this one did. Read it back.
- If the uncertain reply has `confirmDuplicate: true` and the retry returns `duplicate_found` without that `externalId`, the first call did not save it. The athlete's earlier yes still stands, so call once more with the same arguments and `confirmDuplicate: true`.

Set `confirmDuplicate: true` after an uncertain reply only in that last case. Anywhere else it can put two workouts on the day.

**`refused`**: nothing was saved. `code` says why and `next` says what to do. The common codes:

| code                        | What to do                                                                   |
| --------------------------- | ---------------------------------------------------------------------------- |
| `invalid_workout`           | Fix the steps named in `details` and call again.                             |
| `invalid_date`              | Use a real date written `YYYY-MM-DD`.                                        |
| `past_date_refused`         | Pick today or a later day with the athlete.                                  |
| `timezone_missing`          | Ask the athlete to set their time zone in intervals.icu settings.            |
| `not_configured`            | Ask the athlete to add their intervals.icu API key in the plugin settings.   |
| `unauthorized`, `forbidden` | Ask the athlete to check their API key.                                      |
| `rate_limited`              | Wait `retryAfterSeconds`, then try again.                                    |
| `intervals_unavailable`     | Try again shortly.                                                           |
| `rejected`                  | intervals.icu refused the workout. Tell the athlete the reason in `details`. |

### 4. Read back

After every `created` reply, call `get_workout` with the `eventId`. Then report what intervals.icu stored, in this order:

1. A one-line summary: name, day, type, duration, and load when there is one.
2. For cycling: whether the chart will render, from `chartWillRender`.
3. The stored description in a code block.

Example report:

> Sweet Spot 3x15 is on your calendar for Thursday 18 March: type Ride, 1h22m, load 85.
> The power chart will render.
>
> ```
> Warmup
> - 15m 50-65%
>
> Main set 3x
> - 15m 88-94% 85-95rpm
> - 4m 50%
>
> Cooldown
> - 10m 50%
> ```

If `chartWillRender` is false for a cycling workout, say so plainly. intervals.icu stored the text but did not turn it into steps, so the head unit may show it as a plain note. Suggest the athlete opens it in intervals.icu.

Never say "saved" or "added" without this read-back. A failed `get_workout` says nothing about whether the workout is on the calendar. Follow its `next`. If it still fails, say that intervals.icu accepted the workout but reading it back failed, give the reason, and ask the athlete to check the calendar.

## Writing a cycling workout

### Input

`create_cycling_workout` takes a flat object:

- `date`: the calendar day, `YYYY-MM-DD`, today or later.
- `name`: the calendar card title, one line, up to 120 characters.
- `steps`: 1 to 40 ordered steps.
- `confirmDuplicate`: leave it out, except as described in the protocol.

### Steps

A simple step has a `type`, a `duration` and usually a `power` target:

- `type`: `warmup`, `steady`, `interval`, `ramp`, `recovery`, `rest`, `cooldown` or `freeride`.
- `duration`: `{ "value": 15, "unit": "minutes" }` or `{ "value": 30, "unit": "seconds" }`.
- `power`: one value `{ "kind": "percent_ftp", "value": 75 }` or a range `{ "kind": "percent_ftp", "low": 88, "high": 94 }`. `kind` is `percent_ftp`, `watts` or `zone`.
- `cadence` (optional): `{ "target": 90 }` or `{ "low": 85, "high": 95 }`.
- `label` (optional): a short cue on one line in plain words, such as "seated" or "high cadence". intervals.icu reads numbers and target keywords anywhere on a step line, so a label must not contain digits or the words HR, LTHR, pace, MMP, ramp, freeride, rpm, w, watts, km, mi, mtr or "press lap". "hold 95%", "Z4 effort" or "HR check" would change the stored target. Put targets in `power` and `cadence`.

A set repeats one interval and one recovery a fixed number of times:

```json
{
  "type": "set",
  "repeat": 5,
  "interval": {
    "type": "interval",
    "duration": { "value": 4, "unit": "minutes" },
    "power": { "kind": "percent_ftp", "low": 110, "high": 115 }
  },
  "recovery": {
    "type": "recovery",
    "duration": { "value": 4, "unit": "minutes" },
    "power": { "kind": "percent_ftp", "value": 50 }
  }
}
```

`repeat` is 1 to 20.

### Rules the tool enforces

- Every step needs a power target, except `freeride` and `rest`.
- A ramp needs `low` and `high`. On a ramp, `low` is the start and `high` is the end, so a ramp from 60% down to 40% has `low` 60 and `high` 40.
- Any other range needs `low` at or below `high`.
- Zone values are whole numbers 1 to 7.
- Percent of FTP goes up to 200. Watts go up to 1500.
- A cadence range needs both ends.
- Names and labels are one line.
- Labels have no digits and no workout keywords.

A broken rule returns `invalid_workout` with every problem listed in `details`. Fix them all and call again.

### Power targets

- Prefer `percent_ftp`. The head unit turns a percent into watts from the athlete's FTP with no guesswork.
- A `zone` target resolves against the zone bands the athlete set in intervals.icu. If their bands differ from the 7-zone model, `Z4` can land one band off. Use zones only when the athlete asks for them.
- Sweet spot is a named range, not a numbered zone. Write it as `percent_ftp` 88 to 94.
- A ramp with zone bounds is written as the percent centres of those zones, so the chart still renders. Use `percent_ftp` bounds when exact endpoints matter.
- Use `watts` only when the athlete gives watts.
- The plugin writes power targets only. It has no heart rate targets.

### What intervals.icu stores

The tool turns steps into intervals.icu workout text. Warmup and cooldown steps get their own headings. Every other step falls under "Main set". This text is what the read-back shows.

### Narrative goes in chat

The workout holds steps only. Put the purpose, feel cues, fuelling and any coaching notes in your chat reply. The athlete reads coaching in chat. The head unit reads steps from intervals.icu.

### Example: Sweet Spot 3x15

```json
{
  "date": "2027-03-18",
  "name": "Sweet Spot 3x15",
  "steps": [
    {
      "type": "warmup",
      "duration": { "value": 15, "unit": "minutes" },
      "power": { "kind": "percent_ftp", "low": 50, "high": 65 }
    },
    {
      "type": "set",
      "repeat": 3,
      "interval": {
        "type": "interval",
        "duration": { "value": 15, "unit": "minutes" },
        "power": { "kind": "percent_ftp", "low": 88, "high": 94 },
        "cadence": { "low": 85, "high": 95 }
      },
      "recovery": {
        "type": "recovery",
        "duration": { "value": 4, "unit": "minutes" },
        "power": { "kind": "percent_ftp", "value": 50 }
      }
    },
    {
      "type": "cooldown",
      "duration": { "value": 10, "unit": "minutes" },
      "power": { "kind": "percent_ftp", "value": 50 }
    }
  ]
}
```

### Example: endurance with a free section

```json
{
  "date": "2027-03-20",
  "name": "Endurance 2h",
  "steps": [
    {
      "type": "warmup",
      "duration": { "value": 10, "unit": "minutes" },
      "power": { "kind": "percent_ftp", "low": 45, "high": 60 }
    },
    {
      "type": "steady",
      "duration": { "value": 90, "unit": "minutes" },
      "power": { "kind": "percent_ftp", "low": 65, "high": 72 },
      "cadence": { "low": 85, "high": 95 }
    },
    { "type": "freeride", "duration": { "value": 10, "unit": "minutes" } },
    {
      "type": "cooldown",
      "duration": { "value": 10, "unit": "minutes" },
      "power": { "kind": "percent_ftp", "value": 50 }
    }
  ]
}
```

## Designing the workout

Zone bands live in the `power-zones` skill. This section names the zone for each workout type and gives its usual shape.

### Workout types

| Type       | Zone       | Main set                             | Cadence             | When                                              |
| ---------- | ---------- | ------------------------------------ | ------------------- | ------------------------------------------------- |
| Recovery   | Z1         | 30-45 min easy spinning              | 90+ rpm, light gear | Day after a hard effort, between hard blocks      |
| Endurance  | Z2         | 45 min to 3 h steady                 | 85-95 rpm           | Base phase, recovery weeks, long weekend sessions |
| Tempo      | Z3         | 2x20 or 3x15 min, 45-90 min of work  | 85-95 rpm           | Build phase, group-pace practice                  |
| Sweet spot | 88-94% FTP | 2x20, 3x15 or 4x10 min               | 85-95 rpm           | Main build intensity for athletes short on time   |
| Threshold  | Z4         | 2x20, 3x10 or 2x15 min               | 90-100 rpm          | Build and peak phases, race preparation           |
| VO2max     | Z5         | 5x4, 4x5 or 6x3 min                  | 95-105 rpm          | Peak phase, top-end power                         |
| Anaerobic  | Z6         | 8x1 min or 6x90 s, 10-20 min of work | high                | Attacks, surges, criterium preparation            |
| Sprint     | Z7         | 6-10 efforts of 15-30 s              | high                | Race preparation, criterium preparation           |

Notes:

- VO2max recovery is equal to the interval or half of it. Keep VO2max to two sessions a week at most.
- Anaerobic recovery is as long as the effort or longer.
- Sprints are all-out efforts, not a percent the athlete can hold. The tool still needs a power target, so give a high floor such as 150 to 200% FTP, label the step "all-out", and give the recovery 3-5 min of `rest` or easy `recovery`.
- Indoors, endurance cadence can sit lower, around 80-90 rpm, in ERG mode.

### Structure

Every workout follows warmup, main set, cooldown.

1. Warmup, 10-15 min: build from Z1 to Z2. Add 2-3 openers of 30 s at the main set's target.
2. Main set: the prescribed intervals.
3. Cooldown, 5-10 min: easy spinning in Z1.

### Progression

- Duration: add 2-5 min per interval every 1-2 weeks, such as 2x15, then 2x18, then 2x20.
- Sets: add a set every 2-3 weeks, such as 3x10, then 4x10.
- Intensity: raise the target 2-3% FTP per phase.
- Recovery: shorten the rest between intervals, such as 5 min, then 4, then 3.

### Indoor or outdoor

- Indoors suits structured intervals in ERG mode and short weekday sessions.
- Outdoors suits long endurance sessions, group riding and race practice.

## Sync to head units

intervals.icu sends planned workouts on to Garmin Connect and Wahoo when the athlete has connected them. A new workout usually reaches the head unit within minutes. The plugin does not control this sync.
