# Still Field

Interactive ripple artwork for a Mac mini and a 16:9 Samsung Frame display. A warm, softer rendering of the original image carries a slow central ripple, while camera positions add breathing ripples and distinct alternating footsteps. Optional microphone loudness changes the field's energy.

The central ripple runs on its own slow clock, with roughly a 20-second cycle and restrained amplitude. The material's contrast is reduced by 32%, with lifted shadows and a subtle warm tint. **View original** still shows the ungraded source. Existing camera, microphone and display settings are preserved when updating.

Footsteps begin as distinct impressions, expand into rings, and soften into broader swells as fine detail dissipates. Slow movement produces wider, gentler steps; brisk movement produces tighter, stronger steps, with capped strength and reduced intensity in a crowd. This follows smoothed movement in the camera image, not measured physical walking speed.

After a person stops for about three seconds, gentle rings start spreading outward from their detected position about every four seconds. These rings travel through the same wave field as footsteps and meet other people's ripples, with slightly different rhythms per person. A broad nine-second breathing ripple remains underneath. New standing rings stop when the person moves, jumps or disappears; existing rings fade naturally. With camera tracking active and nobody detected, the central ripple approaches stillness over roughly 30–45 seconds, then gently wakes when someone returns. Without an active camera or tracking demo, the autonomous artwork continues its usual quiet motion. Damping still adjusts how long input ripples remain; fine detail softens even at low damping.

The artwork, JavaScript detector and model weights are included in this repository. After cloning, the player builds and runs offline with Python's standard library. There is no npm install, pip install, cloud inference or runtime CDN download.

## Install on the Mac mini

You need **Google Chrome**, **Python 3.9 or newer**, and access to this private GitHub repository. A recent Apple-silicon Mac mini is the intended installation machine; the physical Mac/TV/camera combination still needs an in-room performance and alignment check.

If Homebrew is already installed:

```sh
brew install python gh
brew install --cask google-chrome
gh auth login
gh repo clone ninkle/still-field
cd still-field
./start.command
```

Skip installation commands for tools you already have. Alternatively, install [Python for macOS](https://www.python.org/downloads/macos/) and [Chrome](https://www.google.com/chrome/) directly, then clone with your usual Git client. The equivalent HTTPS clone URL is `https://github.com/ninkle/still-field.git`; private repository access requires GitHub authentication.

You can also double-click `start.command` in Finder. It opens a dedicated Chrome profile and serves the player at **http://localhost:8765/**. Keep its Terminal window open while it runs; Control-C stops the server. The launcher uses macOS `caffeinate` to prevent idle Mac/display sleep while it is running. It does not change the TV's own sleep settings.

## Connect and align

1. Connect **Mac mini HDMI → Frame/One Connect HDMI**. Select that input on the TV. This application runs in TV/HDMI mode, not Samsung's still-photo Art Mode.
2. Connect the **Logitech camera to the Mac by USB**. On Mac minis without USB-A, use a USB-A-to-USB-C adapter or suitable hub. Leave the computer ventilated.
3. Click **Use camera**. Allow access in Chrome and, if prompted, macOS **System Settings → Privacy & Security → Camera**. Expand **Installation settings** to choose the Logitech device. Device labels may appear only after permission; click **Refresh devices** if needed. Stop and start the camera after changing the selection.
4. In **Camera alignment**, keep **Mirror left / right** enabled for a mirror-like response. Choose **Feet / full body** when feet are visible, or **Body center / cropped view** for seated/cropped people. Fix the camera's position and disable any vendor automatic framing/zoom.
5. Adjust wave speed, damping and ripple relief. Settings save in this Chrome profile. The defaults preserve the latest preview: speed 58%, damping 4%, relief 75%.
6. Use **Full screen** or **F**, or select **Show only the artwork**. Press **S** or **Escape** to leave the artwork-only layout; Escape also exits browser fullscreen where supported. **Space** pauses/plays unless a form control has focus.

For the 55-inch Frame, select a **3840 × 2160, 16:9** Mac display output if available. Begin with **1440p · balanced** internal render detail, which is scaled to the TV, then try **4K · highest detail** while the camera is running. The renderer targets roughly 30 frames/second. The original image is 2400 × 1350, so native 4K output does not create new photographic detail. Tune TV brightness and its own auto-off settings for the office.

The current player uses **one camera**, accepting up to eight short-lived person tracks. A 1,000 sq ft room may have occluded areas; test the intended walking area before choosing a permanent mount. Detection targets ten updates/second when jump detection is enabled in full-body mode, and four otherwise; actual speed depends on the Mac and render quality. Footsteps are artistic impacts derived from movement, not measured individual foot contacts. Crossing/occluded people can change track IDs.

## Jumping in place

Use **Feet / full body** and leave **Detect jumps · full body** checked in Camera alignment. Keep the camera fixed and the person's head and feet fully visible, with enough image detail to track the whole body. Stand briefly (about a second) before jumping in place. A clear rise produces a small takeoff disturbance; returning to the same standing height produces one broader, stronger landing ripple. Walking footsteps and standing breaths are suppressed during the jump. Repeated landings remain distinct and their strength is capped.

This is a conservative detector of whole-body bounding-box motion, not a pose or foot-contact model. It checks for multiple raised samples followed by a descent and return. It rejects cropped or overlapping people, low confidence, long sample gaps, and incomplete jumps. Arm raises and crouches with the feet remaining grounded do not qualify in the synthetic tests. Real detection can still miss jumps or misinterpret motion; validate it with the installation camera. Jump detection is disabled in **Body center / cropped view**. Uncheck it to return to the lighter four-update/second tracking rate.

**Try jump demo** runs three synthetic jumps through the same tracking and jump-detection code without opening the camera. It loops every 14 seconds. A landing status appears below the artwork controls. Pause stops the visual impacts; missed events are not replayed on resume.

## Optional sound

Use a microphone **connected to the Mac**. The Frame's TV/remote microphone should not be treated as a Mac audio input over an ordinary HDMI connection. Samsung describes its microphone for [TV voice features](https://www.samsung.com/us/support/answer/ANS10005259/) and [ARC/eARC for TV audio to receivers/soundbars](https://www.samsung.com/us/support/answer/ANS10006962/); this project has no TV-microphone integration.

Many Logitech webcams include a microphone; for example, the [C930e has two integrated microphones](https://www.logitech.com/en-us/products/webcams/c930e-business-webcam.html). Select the camera's microphone in **Installation settings**, then click **Use microphone** and allow Chrome/macOS microphone access. A separate USB microphone is also supported. Use **Sound sensitivity** to tune the response to the room.

Sound measures only a local amplitude envelope. It does not locate footsteps or understand speech. Camera video and audio are never recorded, uploaded or transmitted by this application. The application stores only display preferences and selected device IDs locally in the browser.

Microphone input requires a click each launch so Web Audio can start under normal browser autoplay rules. No microphone is enabled automatically. Camera input is off initially; **Start camera when this player opens** is an explicit, saved opt-in. Browser/macOS permission is still required. Unplugging a microphone stops its input; reconnect and press its start button again. A missing saved device will not silently switch to a different camera or microphone.

### If the camera freezes

The player checks that decoded video frames keep arriving, independently of whether people move. It does not keep analyzing the same frame. After two seconds without fresh frames it clears the old person positions and preview; after five seconds it releases and reconnects the same camera. A disconnected track also triggers recovery. Recovery attempts are capped at three until playback has been healthy for 30 seconds, and **Stop camera** / **Cancel camera** cancels recovery. The initial camera permission prompt remains under your control.

Switching away from the player pauses tracking and returning waits for a fresh frame. If the person detector itself stops responding for ten seconds, the player releases the camera and asks you to reload, rather than starting overlapping detector jobs. If reconnection fails, check the USB cable/hub and click **Use camera**. The freeze recovery is tested with simulated stalls and disconnections; the installation camera still needs an in-room check. Browser freshness uses the [decoded-frame counter](https://developer.mozilla.org/en-US/docs/Web/API/VideoPlaybackQuality/totalVideoFrames) (media time on older browsers), not a comparison of image contents.

## Daily display and login startup

After completing device permissions and alignment, close the setup player window and run:

```sh
./start.command --kiosk
```

This uses the same dedicated Chrome profile and opens only the artwork. **S** reveals settings inside the kiosk window; **Command-Q** quits Chrome. If a Still Field Chrome window is already open, quit it before switching between setup and kiosk modes. Enable the saved camera-start setting if camera tracking should resume after login.

For optional automatic startup **after macOS login**, stop the manually started server first, then install the login item on the Mac mini:

```sh
python3 scripts/login_item.py install
```

It starts at the next login and restarts the server if that process fails. It does not independently monitor a closed Chrome window, bypass FileVault, configure automatic Mac login, control the TV's power, or turn on the microphone. To remove it:

```sh
python3 scripts/login_item.py remove
```

Logs are in `~/Library/Logs/Still Field/`. The dedicated browser profile is in `~/Library/Application Support/Still Field/Chrome/`. Neither is part of the repository. A different port or browser profile has separate permissions/settings.

## Update

Stop the manual server with Control-C, or remove the login item while updating. Quit the Still Field Chrome window, then:

```sh
git pull --ff-only
./start.command
```

The launcher rebuilds from the checked-in files each time and verifies detector checksums. Reinstall the login item afterward if you use it. No machine-specific source paths are required. A port conflict produces an explanatory error instead of terminating another program; `./start.command --port 8766` is an optional temporary alternative.

## If startup stops with “Killed: 9”

This means a process received SIGKILL; it does not establish whether the cause was a security check, memory pressure, or another process. The launcher prints the selected Python path and startup stages, and keeps an interactive Terminal open on a reported failure. If the launcher itself is killed, it cannot print a diagnosis.

From the repository folder in Terminal, test Python and the server directly:

```sh
python3 --version
python3 -u scripts/run.py --no-open
```

If it prints `Art player: http://localhost:8765/`, keep Terminal open and open that URL in Chrome. This isolates the server from the launcher and automatic Chrome opening; it does not keep the Mac awake. If the launcher's printed Python path differs from `command -v python3`, also run that exact Python executable with `--version`. Save the last printed stage and the complete error when reporting a failure. A failed Python version check happens before the artwork or detector runs.

If macOS instead displays an explicit security alert, use [Apple's guidance for opening apps safely](https://support.apple.com/102445); a generic `Killed: 9` message alone is not evidence of a Gatekeeper block.

## Development

Canonical source is in `src/`, the original artwork and extracted ring seed are in `assets/`, and pinned detector assets/licenses are in `vendor/camera/`. `dist/index.html` is generated and intentionally ignored by Git. The generated page embeds everything and is about 31 MB. No Git LFS is needed.

```sh
python3 scripts/build.py
python3 scripts/run.py --no-open
python3 scripts/check.py
```

Checks additionally require **Node 18+** but no npm packages. They cover wave propagation/interference/stability, tracking and footstep cadence, saved settings, selected devices, cancellation and input cleanup, server origin/host validation, and packaged JavaScript syntax. Live camera accuracy, sustained FPS, HDMI behavior and login startup must be verified on the installation Mac.

For a synthetic test, use **Try tracking demo**. Its 66-second cycle shows slow and brisk walking, people settling, departure, and an empty room becoming still; no camera stream is obtained. **Walk past** previews a short footstep trail, and **View original** compares with the starting image.

The optional loopback sensor bridge can be enabled by opening `/?sensors=1`. Send normalized values with a local adapter:

```sh
curl -X POST http://localhost:8765/api/input \
  -H 'Content-Type: application/json' \
  -d '{"presence":0.8,"x":0.3,"y":0.5,"activity":0.25}'
```

The server binds only to `127.0.0.1` and serves the player, health check and bounded sensor API. It does not expose repository files or accept remote sensor connections.

Third-party TensorFlow.js / COCO-SSD notices are in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt). The original artwork is included for this private installation; those notices do not grant rights to the artwork.
