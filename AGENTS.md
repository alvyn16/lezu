# Project direction

- Implement the user's two supplied UI references, including their control placement, proportions, and per-game colors.
- Windows-only distribution. Use Windows window controls. No Couch mode.
- Keep the interface, library data, discovery, and launching in separate modules.
- The first deliverable is a UI prototype. Complete its visual review before adding scanner or launcher code.
- Do not import code or configuration from the previous Lezu implementation.
- Do not present fixture data as the user's installed library. Do not invent metadata or provider capabilities.

# Release safety

- Never push commits, create or push tags, publish GitHub releases, or upload release assets until all relevant automated checks pass and the maintainer has tested the exact candidate locally and explicitly approved publication.
- Treat every change as a local release candidate until that approval is given.
- A critical hotfix may bypass local maintainer testing only when the maintainer explicitly authorizes that specific release.
- Before requesting release approval, report the exact candidate commit, checks run, known limitations, and a short manual test checklist.
