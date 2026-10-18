# Attaya Night

A dark, playful VS Code theme with a little attaya teapot that keeps you company while you code.

## The teapot

Attaya lives in its own sidebar (the teapot icon in the activity bar) and reacts to what you're doing:

| Mood | When |
|---|---|
| **Brewing** | You're typing. Mint steam rises and the round timer runs. |
| **Dozing** | No activity for 5 minutes. The lid slips and the round pauses itself. |
| **Boiling over** | 3 or more errors in your workspace, a test command just failed in the terminal, or a training loss spiked or went NaN. The pot jiggles and bubbles. |
| **Nervous** | The training run you're watching has stopped improving. |
| **Reheating** | The break between rounds. The pot rests on a charcoal stove while the water heats back up. |
| **Prayer time** | An optional pause at prayer times, under a crescent moon. |
| **Fasting** | Optional Ramadan mode: the teapot rests from Fajr until iftar. |
| **Pouring** | You fixed an error, a task finished cleanly, a test command passed in the terminal, a commit landed, or a round ended. If your tests were failing and now pass, Attaya notices. |

### Three rounds

Like real attaya, a pot is three rounds: **strong, steady, sweet**. Each round is 25 minutes of focus, and the timer only runs while you're active. After the third round, Attaya tells you to take a real break. Your pot is remembered through a window reload, separately for each workspace, and a new day starts a fresh pot.

### Breaks between rounds

Between rounds the water reheats for 5 minutes. The break only counts down while you're **away** from the editor: keep typing and Attaya reminds you that water won't boil if you watch it. When the break is over, the next round waits until you come back. You can always **Skip the break**.

### Sweetness

Every pot starts bitter and sweetens as good things happen: errors sipped, tests passing, commits landing, tasks finishing clean. Errors piling up and failing tests make it a little more bitter. The tea in each glass takes the colour of the sweetness that round ended on.

### Foam

The best attaya has thick foam, and it takes patience. Each glass builds foam while you focus without interruption, faster the longer the stretch lasts. Leaving VS Code for more than a few seconds, or dozing off, flattens it. An unbroken round ends with thick foam; a round full of interruptions ends flat. It shows how deep your focus was, not just how long. VS Code can't see other apps, so "interruption" means leaving the editor, whatever you went to do.

### Today's pot

When the third round is poured, the sidebar shows a summary card for the pot: focus time, errors sipped, commits, test runs passed, how sweet it ended, the best foam and your streak. **Save as image** saves it as a PNG.

### Weekly glass report

Every Friday, Attaya offers a small card for the week: glasses poured, errors sipped, your longest uninterrupted focus, your best round, and how many days you were at the pot. Open it any day with **Attaya: Weekly Glass Report**, and **Save as image** to share it.

### Last 13 weeks

A grid of the last 13 weeks, one square per day, fuller on days you poured more glasses. Hover a square for the count. The sidebar also shows your **coding streak**, **errors sipped today** and **glasses poured today**.

### Teapots

Streaks unlock new teapots: Indigo enamel (3 days), Wonjo enamel (5), Nana mint enamel (7), Tie-dye (14) and a Gold Tabaski pot (30). They unlock by your best-ever streak, so you never lose one. Pick yours in the sidebar or with **Attaya: Choose a Teapot**.

### Training runs

Point Attaya at a training log with **Attaya: Watch a Training Run…** and it watches the loss. It brews calmly while the loss goes down, gets nervous when it plateaus, and boils over if it spikes or turns NaN. When the run finishes, it pours. The sidebar shows a small loss chart, and the status bar shows the latest value.

It reads any text log where lines look like `loss: 0.42`, `loss=0.42`, `'loss': 0.42` (Hugging Face) or `train_loss=0.42` (Lightning). Validation loss is ignored. A run counts as finished on a line like "Training complete"; set `attaya.training.finishPattern` if yours says something else.

### Prayer-time breaks

Optional. Set `attaya.prayer.enabled` and your latitude and longitude. Prayer times are calculated offline with [adhan](https://github.com/batoulapps/adhan-js). At each prayer time Attaya gives a gentle reminder and pauses the round for 15 minutes, or until you resume. Pick the calculation method your local mosque uses with `attaya.prayer.method`.

During Ramadan the teapot rests from Fajr until iftar, and pours at Maghrib. Ramadan is detected with the Umm al-Qura calendar. Local moon sighting can differ by a day, so `attaya.prayer.ramadanMode` can also be set to `on` or `off` by hand.

### Sounds

Off by default. Turn on `attaya.sounds` for a soft pour and a glass clink when Attaya pours, and a lid rattle when it boils over. They play while the Attaya sidebar has been opened in the window.

### Wolof phrases

Set `attaya.language` to `wolof` and the teapot adds a short Wolof phrase above its mood, with the English on hover: *Nanga def?* when you come back, *Jàmm rekk* when you're deep in focus, *Waaw!* on a big pour, *Ndank ndank* while the water reheats, *Ba beneen yoon* when the pot is done.

## The theme

Attaya Night uses an indigo-night background with:

- **Sunset** `#E8833A` for keywords
- **Sugar** `#F2C14E` for functions
- **Nana mint** `#8FC9A3` for strings
- **Wonjo** `#E86A92` for numbers and constants
- **Indigo dye** `#7FA7E8` for types and classes

Switch to it with **Ctrl+K Ctrl+T** (Cmd+K Cmd+T on Mac) and pick *Attaya Night*.

## Commands

- **Attaya: Pause / Resume the Round** (during a break, this skips it)
- **Attaya: Skip the Break**
- **Attaya: Brew a Fresh Pot**
- **Attaya: Choose a Teapot**
- **Attaya: Weekly Glass Report**
- **Attaya: Watch a Training Run…** / **Stop Watching the Training Run**
- **Attaya: Show the Teapot**

## Settings

| Setting | Default | |
|---|---|---|
| `attaya.roundMinutes` | 25 | Length of each round |
| `attaya.breakMinutes` | 5 | Length of the break between rounds |
| `attaya.idleMinutes` | 5 | Idle time before Attaya dozes |
| `attaya.boilingThreshold` | 3 | Errors that make the pot boil over |
| `attaya.showStatusBar` | true | Show the round timer in the status bar |
| `attaya.language` | english | `wolof` adds a short Wolof phrase above the mood |
| `attaya.sounds` | false | Pour, clink and rattle sounds |
| `attaya.training.finishPattern` | | Regular expression for the line that ends a training run |
| `attaya.prayer.enabled` | false | Prayer-time pauses |
| `attaya.prayer.latitude`, `attaya.prayer.longitude` | | Your location, for prayer times |
| `attaya.prayer.method` | MuslimWorldLeague | Calculation method |
| `attaya.prayer.madhab` | shafi | `hanafi` for the later Asr |
| `attaya.prayer.pauseMinutes` | 15 | How long the round pauses at a prayer time |
| `attaya.prayer.ramadanMode` | auto | `auto`, `on` or `off` |

Test runs in the terminal are detected through shell integration (VS Code 1.93 or newer).

---

Brewed in The Gambia.
