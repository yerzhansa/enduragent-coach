# Enduragent Coach

A plugin that lets an AI agent put structured training sessions on an athlete's intervals.icu calendar, checked before saving and confirmed after.

## Language

### People and places

**Athlete**:
The person whose intervals.icu account the plugin acts on, identified by the API key they set.
_Avoid_: user (when the account is meant), customer

**Calendar**:
The athlete's intervals.icu calendar of planned sessions.

**Calendar day**:
A date as the athlete sees it in their own time zone.
_Avoid_: UTC date, server date

### Sessions

**Workout**:
A planned session on the calendar, either cycling or strength.
_Avoid_: event, activity, ride (for a planned session)

**Activity**:
A session the athlete has already done and recorded. The plugin never reads or writes these.
_Avoid_: workout (for a completed session)

**Step**:
One block of a cycling workout, such as a warmup, an interval or a recovery, with a duration and usually a power target.

**Set**:
A step group repeated a fixed number of times, such as 3×15 minutes with 5 minutes of recovery between.
_Avoid_: repeat block, loop

**Power target**:
The intensity of a step, given as a percent of FTP, watts or a power zone, either as one value or as a range.

### Trust

**Read-back**:
Fetching a workout right after saving it, to report what intervals.icu actually stored. The agent never says a workout is saved without one.
_Avoid_: verification, confirmation

**Duplicate**:
A workout with the same name on the same calendar day as one already there, whoever created the first. The plugin adds a duplicate only after the athlete confirms it in chat.
_Avoid_: copy, clash

**Plugin workout**:
A workout this plugin created, marked with the plugin's own tag. The Enduragent desktop app does not treat it as one of its own.
_Avoid_: coach workout
