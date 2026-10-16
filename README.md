<p align="center"><img src="assets/logo.svg" alt="Enduragent Coach logo" width="96" height="96"></p>

# Enduragent Coach

Plan cycling and strength workouts with your AI agent and put them on your intervals.icu calendar. Works with intervals.icu.

## What it does

Enduragent Coach lets your AI agent create planned workouts on your intervals.icu calendar. Cycling workouts are built from structured steps with power targets, so intervals.icu draws the power chart and sends the steps to your head unit. Strength workouts carry the whole gym session as text with a planned duration. Before saving, the plugin checks the steps, checks the date against today in your time zone, and looks for a workout with the same name on that day. After saving, the agent reads the workout back and shows you exactly what intervals.icu stored.

The plugin has three tools:

| Tool                      | What it does                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `create_cycling_workout`  | Creates a structured cycling workout from steps with power targets.                  |
| `create_strength_workout` | Creates a strength or gym session from a text description and a duration in minutes. |
| `get_workout`             | Reads one workout back from your calendar.                                           |

It also has three skills that teach the agent how to use them: `intervals-icu-workouts`, `power-zones` and `strength-workouts`.

## Requirements

- An intervals.icu account.
- An intervals.icu API key.
- A time zone set in your intervals.icu profile. The plugin needs it to know what "today" is.
- An FTP set in intervals.icu, if you want percent-of-FTP targets to turn into watts.
- Node.js 20 or later and git, both on your PATH. The server starts with `npx -y github:yerzhansa/enduragent-coach#v0.1.0`, which fetches the pinned release from GitHub on each start.
- Optional: Garmin Connect or Wahoo connected to intervals.icu, so planned workouts reach your head unit.

## Install

1. Install `enduragent-coach` from your agent's plugin marketplace.
2. Get your intervals.icu API key. In intervals.icu, open Settings and scroll to the Developer Settings section near the bottom of the page. Generate an API key there if you do not have one, then copy it.
3. Open the plugin's settings and paste the key into `INTERVALS_API_KEY`.
4. Start a new chat and ask for a workout.

If the key is missing, the server still starts, and every tool answers that the key is not configured.

## Example prompts

- "Put a sweet spot 3x15 on my calendar for tomorrow."
- "Plan a 2-hour endurance workout for Saturday at 65-72% of FTP."
- "Add a VO2max session next Tuesday: 5x4 minutes with 4 minutes easy between."
- "Make a 45-minute lower-body gym session for Wednesday. I don't know my weights, so use effort levels."
- "What did you just put on my calendar? Show me the stored text."

## What it will and won't do

It will:

- Create cycling workouts with power targets: percent of FTP, watts or power zones.
- Create strength workouts as text with a duration from 1 to 600 minutes.
- Confirm the date with you before saving.
- Read every workout back after saving and show you the stored text, and for cycling, whether the power chart will render.
- Ask you before adding a second workout with the same name on the same day.

It won't:

- Edit, move or delete any workout. To change or replace one, remove it in intervals.icu and ask for a new one.
- Create workouts on past dates.
- Create running, swimming or other sports. It says so and stops.
- Write heart rate targets.
- Read your activities, fitness, fatigue, form or wellness data.

Every workout it creates carries the tag `enduragent-coach`, so you can tell plugin workouts apart in intervals.icu.

## Privacy

- Your API key stays in your plugin settings. The server reads it from the environment when it starts.
- At start, `npx` fetches the server from GitHub. After that, the server talks only to intervals.icu.
- The plugin sends no analytics and keeps no data of its own.

## Limits

- Cycling and strength only.
- Cycling workouts: up to 40 steps, sets repeat up to 20 times, power up to 200% of FTP or 1500 watts.
- Workout names: one line, up to 120 characters. Strength descriptions: up to 4000 characters.
- Every server start needs network access to GitHub and git on your PATH.
- intervals.icu limits how many API requests a key can make. If you hit the limit, the agent waits and tries again.
- Activities synced from Strava are not visible through the intervals.icu API. This does not affect creating workouts.

## Support

Report problems and ideas in the repository's [GitHub Issues](https://github.com/yerzhansa/enduragent-coach/issues). Homepage: [enduragent.icu](https://enduragent.icu).

## Not affiliated

Enduragent Coach is an independent project. It is not affiliated with, endorsed by or supported by intervals.icu.

## License

MIT. See [LICENSE](LICENSE).
