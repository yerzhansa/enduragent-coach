---
name: power-zones
description: The 7-zone power model based on percent of FTP, with sweet spot, effort levels and when to use each zone. Use when choosing power targets for a cycling workout, turning a zone or effort the athlete names into percent of FTP, or explaining what a zone means.
---

# Power zones

These are the seven FTP-based power zones that intervals.icu uses by default. The edges are a naming convention, not exact physiology. Use them so the zone numbers in chat match what the athlete sees on their head unit.

## The seven zones

| Zone | Name            | % FTP      | Effort 1-10 | What it is                                                             |
| ---- | --------------- | ---------- | ----------- | ---------------------------------------------------------------------- |
| Z1   | Active recovery | up to 55%  | 1-2         | Very light spinning. Warmups, cooldowns, days after hard sessions.     |
| Z2   | Endurance       | 56-75%     | 3-4         | Aerobic base. Conversational pace. Most of the weekly volume.          |
| Z3   | Tempo           | 76-90%     | 5-6         | Comfortably hard. Can be held for 1-2 hours.                           |
| Z4   | Threshold       | 91-105%    | 7-8         | Around the most the athlete can hold for about an hour. FTP sits here. |
| Z5   | VO2max          | 106-120%   | 9           | Hard intervals of 3-8 minutes. Builds top-end aerobic power.           |
| Z6   | Anaerobic       | 121-150%   | 10          | Short, very hard repeats of 30 seconds to 3 minutes.                   |
| Z7   | Neuromuscular   | above 150% | max         | All-out sprints of 5-15 seconds. Not a percent the athlete can hold.   |

## Sweet spot

Sweet spot is 88-94% FTP. It runs from the top of Z3 into the bottom of Z4. It is a named range, not a numbered zone. It gives a lot of aerobic work per minute for a manageable amount of fatigue.

Write it as a percent range, `{ "kind": "percent_ftp", "low": 88, "high": 94 }`, never as a zone number.

## When to use each zone

- Z1: recovery days, warmups and cooldowns, the day after a race or a hard block.
- Z2: base phase, long sessions, most of the weekly time, often 60-80% of it.
- Z3: tempo blocks, group-pace practice, long steady climbs.
- Sweet spot: the main build intensity for athletes short on time, such as 2x20 or 3x15 min.
- Z4: threshold intervals such as 2x20 or 3x10 min, race preparation, raising FTP.
- Z5: VO2max intervals such as 5x4 or 4x5 min, peak phase.
- Z6: short hard repeats such as 8x1 min or 6x90 s, with full recovery.
- Z7: 6-10 sprints of 15-30 s. Prescribe by duration and effort. The tool still needs a target, so give a high floor such as 150% FTP and label the step "all-out".

## Turning zones into targets

- Prefer percent of FTP. Use the zone's band as a range, or a narrower range inside it. For example, a Z2 endurance step can be 65-72%.
- A `zone` target uses the athlete's own zone bands in intervals.icu. If they changed their bands, a zone number may not match this table. Use zones only when the athlete asks for them.
- If the athlete gives watts, use `watts`.
- If the athlete has no FTP set in intervals.icu, percent targets have nothing to convert from. Suggest they set FTP in intervals.icu, or use watts they give you.

## Heart rate

The plugin writes power targets only. Heart rate is a check the athlete can use while riding, not a target in the workout.

As a rough guide, against lactate threshold heart rate:

- Z1: below 80%.
- Z2: 80-89%.
- Z3: 90-94%.
- Z4: 95-105%. Sweet spot sits around 92-97%.
- Z5 and above: heart rate lags too much to pace by. Pace by power.

Heart rate rises 30-60 seconds behind power, so it is a poor guide for short efforts.
