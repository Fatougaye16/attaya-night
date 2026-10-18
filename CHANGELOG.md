# Changelog

## 0.2.0

- Foam: each glass builds foam during uninterrupted focus; leaving the editor flattens it.
- Training-run watcher: brews while the loss goes down, gets nervous on a plateau, boils over on a spike or NaN, pours when the run finishes. Includes a loss sparkline.
- Prayer-time breaks, calculated offline with adhan, and a Ramadan mode that rests the teapot until iftar. Off by default.
- Unlockable teapots: Indigo, Wonjo and Nana mint enamel, Tie-dye and a Gold Tabaski pot.
- Weekly glass report, offered on Fridays, with Save as image.
- Optional sounds: pour, clink and lid rattle.
- *Waaw!* on big pours and *Jàmm rekk* in deep focus, with the Wolof phrases on.
- Breaks between rounds: the water reheats for 5 minutes (`attaya.breakMinutes`), counting down only while you're away. New **Skip the Break** command.
- Sweetness: each pot starts bitter and sweetens with fixes, passing tests and commits. The tea colour follows it.
- Summary card when the pot is done, with **Save as image**.
- Failing test runs make the pot boil; tests going from failing to passing get their own pour.
- A 13-week history grid of glasses poured per day.
- Optional Wolof phrases (`attaya.language`).
- Your round survives a window reload. Each workspace keeps its own pot, and a pot from an earlier day starts fresh.
- The round now pauses when you're idle even if the pot is boiling over.
- Errors only count as sipped if they disappear within 30 seconds of an edit, so closing a file or restarting a language server no longer counts.

## 0.1.0

- Attaya Night color theme.
- Attaya sidebar with four moods: brewing, dozing, boiling over and pouring.
- Three-round focus timer, coding streak, errors sipped and glasses poured.
