# Still Life

A stealth game in the browser. You steal real paintings from the Art Institute of Chicago while a security guard watches you through your webcam and listens through your microphone. When his footsteps stop, he's turning around, and you have to hold perfectly still.

## How to play

1. Give the guard his senses: turn on your camera, your microphone, both, or neither.
2. The game picks a public-domain painting that's on view at the museum right now and tells you which gallery it hangs in.
3. Hold **Space** (or the sneak button) to creep toward it while his back is turned.
4. When the footsteps stop, let go. While he looks, any sneaking gets you caught immediately, and movement or noise fills his suspicion meter.
5. Get caught and you get a booking photo. Get away and the painting goes to your hideout.



## APIs

| API | Type | What it does here | Where |
| --- | --- | --- | --- |
| [Art Institute of Chicago API](https://api.artic.edu/docs/) | Data | Finds public-domain paintings that are on view, with titles, artists, gallery numbers, alt text, and IIIF images | `js/museum.js` |
| Media Capture (`getUserMedia`) | Browser | The guard's eyes (webcam) and ears (microphone) | `js/sensors.js` |
| Canvas | Browser | Compares webcam frames to detect motion, and draws the mugshot | `js/sensors.js`, `js/mugshot.js` |
| Web Audio | Browser | Measures microphone loudness, and synthesizes footsteps, the alarm, and the shutter | `js/sensors.js`, `js/sound.js` |
| Page Visibility | Browser | Catches you if you switch tabs mid-heist | `js/main.js`, `js/heist.js` |
| Speech Synthesis | Browser | The guard's voice, with matching on-screen captions | `js/voice.js` |
| Web Storage | Browser | Saves your hideout, arrest record, and sound setting | `js/storage.js` |

## Handling failures

- **Camera or microphone denied:** the game adapts instead of stopping. With no camera, the guard only listens. With no microphone, he only watches. With neither, it becomes a keyboard-only game: any key press or click while he's looking gets you caught, and moving the mouse raises his suspicion. Each case shows a specific message (blocked, not found, in use by another app, or unsupported).
- **Museum API down or slow:** requests time out after 10 seconds, and the briefing screen explains what happened with a Try again button. If the on-view search fails, the game falls back to any public-domain painting.
- **Images that don't load:** every painting has the museum's own alt text, and the frame shows a blurred placeholder while the image loads.
- **Sound:** every guard line also appears as a caption, so the game is playable muted.

## Running it

The JavaScript uses ES modules, and browsers only allow camera and microphone access on `https://` pages or `localhost`, so the page needs a server:

- **Locally:** open the folder in VS Code and use the Live Server extension, or run `python3 -m http.server` and visit `http://localhost:8000`.
- **Online:** GitHub Pages works as is.

Opening `index.html` directly from your file system won't work.

## Files

```
index.html          All screens: title, senses, briefing, heist, busted, getaway, hideout
css/styles.css      Styles, organized by screen
js/main.js          Entry point: connects the screens
js/museum.js        Art Institute of Chicago API
js/sensors.js       Webcam motion and microphone loudness
js/heist.js         Game rules: the guard's patrol, suspicion, getting caught
js/heist-view.js    Draws the heist from the game state
js/input.js         Keyboard, pointer, and touch controls
js/mugshot.js       The booking photo
js/sound.js         Synthesized sound effects
js/voice.js         The guard's voice and lines
js/storage.js       localStorage
js/ui.js            Shared helpers: screens, wall labels, framed images, meters
```

## Privacy

Webcam frames and microphone audio are analyzed in the browser tab and thrown away. Nothing is recorded or uploaded. The mugshot exists only on your device unless you download it.

## Credits

Artwork data and images: Art Institute of Chicago, via its public API. Collection data is CC0; images used are public domain. Fonts: Spectral and Archivo, from Google Fonts.
