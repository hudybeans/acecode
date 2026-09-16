## Why

ACECode remote control binds one existing session to an external channel. WhatsApp users need incoming conversations to create and resume independent ACECode sessions in daemon/Desktop runtimes. Configuration must be separate from running the service and must not launch a background daemon.

## What Changes

- Add C++ channel routing, persistence, account ownership, control and WhatsApp adaptation under `src/channels/`.
- Connect a personal WhatsApp account using QR pairing and a small Node/Baileys bridge. Keep protocol encryption and device authentication in Baileys.
- Create independent no-workspace sessions automatically; isolate DMs by contact and groups by group plus sender. Require pairing or allowlists, and mentions in groups.
- Reuse SessionRegistry, SessionClient, RC question handling, permission prompters, output delivery and lifecycle helpers.
- Provide standalone CLI setup and management of already running daemon/Desktop channels. Do not register `/channels` or a channel surface in the main TUI.
- Make `acecode channels` a guided configuration flow: personal self-chat or selected contacts, dependency preparation and temporary QR pairing. Save verified access and close the pairing bridge; connect for service only when the user starts daemon/Desktop. Retain explicit diagnostic commands without auto-starting a host.
- Support text, images, documents, quoted replies, status and reconnection. Persist account credentials and conversation bindings across restarts.
- Preserve existing `/rc` behavior. Matrix encryption, Yuanbao, Signal, BlueBubbles and Photon are excluded; other platforms, voice and scheduled/cross-channel delivery are outside phase one.

## Capabilities

### New Capabilities
- `whatsapp-channels`: personal-account pairing, isolated sessions, shared runtime ownership, controls and media delivery.

### Modified Capabilities
None. Existing RC remains compatible.

## Impact

New C++ channel module, standalone terminal wizard and daemon integration, bridge assets and packaging, focused C++ and Node integration tests, and channel documentation. Existing session storage and question/permission engines remain authoritative. No provider credentials or runtime account data are committed.
