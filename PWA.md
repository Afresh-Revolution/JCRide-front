You are a senior PWA engineer, frontend architect, and mobile UX expert.

Convert my existing web application, "JosRide", into a world-class Progressive Web App (PWA) that behaves as close as possible to a native mobile application on Android, Windows, macOS, and iOS.

The goal is for users to install JosRide with the least amount of friction possible.

========================
PRIMARY GOALS
========================

1. Android
- Users should see the browser install prompt automatically.
- If supported, trigger the install prompt after one meaningful interaction.
- If automatic prompt isn't available, display a beautiful in-app install modal.
- Installation should require only one click whenever the browser allows it.

2. Windows
- Ensure installation works in Chrome, Edge, Brave and other Chromium browsers.
- Support desktop shortcuts.
- Support Start Menu integration.
- Open in standalone mode.
- Display proper application icon.

3. iOS
Since Safari doesn't support beforeinstallprompt, implement the best possible iOS installation experience.

Automatically detect iOS devices.

When the app is not installed:

Display a beautiful bottom sheet explaining:

Step 1:
Tap the Share button.

Step 2:
Choose "Add to Home Screen."

Step 3:
Tap Add.

Once installed, never show this message again.

The install instructions should:
- look native
- animate smoothly
- only appear once
- be dismissible
- remember user choice

========================
PWA REQUIREMENTS
========================

Create or improve:

manifest.json

service worker

offline caching

asset caching

runtime caching

background updates

splash screen

application icons

shortcuts

theme colors

display mode

orientation

maskable icons

apple-touch-icons

apple splash screens

favicon set

browserconfig

robots

offline.html

========================
MANIFEST
========================

Generate a complete manifest including:

name

short_name

description

start_url

scope

display: standalone

display_override

background_color

theme_color

orientation

lang

categories

screenshots

icons

maskable icons

shortcuts

share_target (if appropriate)

protocol_handlers (if appropriate)

edge_side_panel (if supported)

launch_handler

id

========================
ICONS
========================

Generate support for:

72x72

96x96

128x128

144x144

152x152

167x167

180x180

192x192

256x256

384x384

512x512

1024x1024

Include:

regular

maskable

apple

monochrome

========================
SERVICE WORKER
========================

Implement production-grade caching.

Cache:

HTML

CSS

JS

Fonts

Images

API responses where appropriate

Implement:

Cache First

Network First

Stale While Revalidate

Offline fallback

Automatic updates

Skip waiting

clients.claim()

Versioning

Cleanup old caches

========================
INSTALL EXPERIENCE
========================

Android

Capture beforeinstallprompt.

Store the event.

Display a custom install card.

When Install is pressed:

Call prompt()

Await userChoice

Handle accepted/dismissed states

Hide permanently after install.

========================
IOS EXPERIENCE
========================

Detect:

iPhone

iPad

Safari

Installed status

If not installed:

Show an elegant native-looking install sheet.

Include:

Share icon

Add to Home Screen icon

Animated arrow

Step indicators

Never annoy the user.

Remember dismissal.

========================
DESKTOP EXPERIENCE
========================

Support:

Windows

Mac

Linux

Standalone launch

Application title

Taskbar icon

Window controls overlay if supported

========================
UI REQUIREMENTS
========================

The install prompt should look premium.

Modern glassmorphism.

Rounded corners.

Subtle shadows.

Blur background.

Responsive.

Animated.

Accessible.

Dark mode.

Light mode.

========================
PERFORMANCE
========================

Target:

100 Lighthouse PWA

100 Accessibility

100 Best Practices

95+ Performance

90+ SEO

Optimize:

lazy loading

preloading

prefetching

compression

image optimization

font loading

critical CSS

========================
OFFLINE EXPERIENCE
========================

Users should still be able to:

Open the app

Navigate cached pages

See offline screen

Retry connection

Automatically sync when internet returns

========================
SECURITY
========================

Use:

HTTPS assumptions

CSP recommendations

Safe service worker registration

No insecure caching

========================
INSTALL DETECTION
========================

Correctly detect whether the app is:

Already installed

Running in standalone mode

Running in browser

Installed via Android

Installed via Windows

Installed via iOS

Hide install prompts once installed.

========================
OUTPUT
========================

Provide complete production-ready code.

Do not use placeholders.

Generate every required file.

Explain where each file belongs.

Include any necessary updates to the HTML <head>.

Ensure the application passes modern PWA audits.

The final implementation should feel indistinguishable from a native app whenever browser capabilities allow.