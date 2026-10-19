# Third-party attribution

The mobile scanner adapts the public detection-rule approach of Blackbird by Lucas Antoniaci:
https://github.com/antoniaci/blackbird
https://github.com/garrettmclain96-prog/blackbird

`lib/email-data.json` is from the user's Blackbird fork at commit c8329b2e83f20e3f74b218e68200389d838a6832. The original GPL-3.0 license is included in `LICENSE`.

`lib/catalog-data.json` is derived from WhatsMyName's `wmn-data.json`, retrieved 2026-10-19:
https://github.com/WebBreacher/WhatsMyName

Copyright (C) 2015–2026 Micah Hoffman and contributors.
Licensed under Creative Commons Attribution-ShareAlike 4.0 International:
https://creativecommons.org/licenses/by-sa/4.0/

Changes to that dataset: added deterministic local IDs; removed known-example handles to reduce the shipped data; retained detection markers, URLs, categories and protection metadata. The derivative catalog remains licensed CC BY-SA 4.0. Its authors and license statements are also retained inside the JSON file.
