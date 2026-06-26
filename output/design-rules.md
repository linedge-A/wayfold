# Design Rules — Wayfold

## Purpose

This document defines the visual system and component rules for the trip-planning MVP so the UI does not drift over time.

The product is a calm, productivity-style travel planning workspace inspired by Any.do-style clarity: light, tidy, neutral, soft, and highly legible. It is not a chat-first app, not a dashboard full of dense analytics, and not a flashy AI product.

The layout assumes a desktop-first workspace with four persistent regions:
- Left: itinerary column
- Center top: map
- Center bottom: pocket lists
- Right: copilot / chat

The itinerary is the primary object. Chat is assistive, not dominant.

---

## Core design principles

1. **Calm over clever**  
   The UI should feel dependable, quiet, and structured.

2. **Itinerary-first**  
   The left column is the operational center. Itinerary chips are the main interactive object.

3. **One component language**  
   Pocket items must reuse the same chip language as itinerary items, so users understand that both belong to the same planning system.

4. **Soft productivity aesthetic**  
   Use neutral surfaces, light borders, restrained shadows, and one primary accent.

5. **No style improvisation**  
   If a color, size, radius, spacing, or component state is not defined here, do not invent a new one. Extend this file first.

---

## Visual direction

### Reference mood
- Inspired by Any.do-style product calm
- Minimal, bright, breathable, friendly
- Organized like a planning workspace
- Premium but not luxurious
- Modern but not futuristic

### Must avoid
- Purple-blue AI gradients
- Neon glows
- Glassmorphism as a base style
- Loud illustration-heavy marketing aesthetics
- Oversized rounded "bubble" UI
- Inconsistent card shapes between panels
- Different chip styles in itinerary vs pocket
- Random accent colors for categories

---

## Design tokens

Use these tokens exactly. Do not hardcode values in components unless explicitly allowed.

### Color palette

#### Base neutrals
- `--bg-app: #F6F7F9` — overall app background
- `--bg-panel: #FFFFFF` — primary panel background
- `--bg-panel-muted: #F9FAFB` — secondary panel background
- `--bg-panel-hover: #F3F5F7` — hover surface
- `--bg-selected: #EEF6FF` — selected but non-destructive state
- `--border-subtle: #E6EAF0` — default border
- `--border-strong: #D6DDE7` — emphasized border
- `--text-primary: #1F2937` — main text
- `--text-secondary: #5B6678` — secondary text
- `--text-tertiary: #8A94A6` — low emphasis text
- `--text-inverse: #FFFFFF` — text on dark/accent fill

#### Brand / primary
- `--accent-primary: #2F80ED` — primary action, selected state, links
- `--accent-primary-hover: #1F6FD6`
- `--accent-primary-soft: #EAF3FF` — soft selected background
- `--accent-primary-line: #CFE2FF`

#### Functional colors
- `--success: #1F9D68` — successful ingestion, confirmed fit, synced
- `--success-soft: #EAF8F1`
- `--warning: #D48A00` — soft conflict, timing risk, overtime warning
- `--warning-soft: #FFF6DF`
- `--danger: #D64545` — destructive action, failed fit, blocking conflict
- `--danger-soft: #FDEEEE`
- `--info: #5C7CFA` — informational system hints
- `--info-soft: #EEF1FF`

#### Pin / constraint colors
- `--pin-soft: #7C8AA5` — movable preference pin
- `--pin-soft-bg: #F1F4F8`
- `--pin-hard: #2F80ED` — fixed item / hard pin / lock
- `--pin-hard-bg: #EAF3FF`
- `--locked: #1F6FD6` — fixed lock state

#### Category accents
Use category color only as a small dot, tag accent, or icon tint. Never use full-card category backgrounds.
- `--cat-sight: #2F80ED`
- `--cat-food: #F2994A`
- `--cat-stay: #9B51E0`
- `--cat-transit: #27AE60`
- `--cat-backup: #8D99AE`
- `--cat-booking: #EB5757`

### Color usage rules
1. Large surfaces stay neutral.
2. Only one strong filled accent should dominate a screen at a time.
3. Category colors are supporting metadata only.
4. Hard-pin state uses blue family only.
5. Warning and danger are reserved for real planning conflicts.
6. Never create a new semantic color without updating this document.

---

## Typography

Typography must meet WCAG-friendly sizing and contrast expectations for productivity tools.

### Font family
- Primary UI font: `"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif` (Edgeland visual language; `--font-sans` in `design-system/tokens.css`)
- Use one UI font family only (IBM Plex Sans) for all product surfaces to prevent drift.
- **Brand wordmark**: the `wayfold` logo wordmark (top header + share card only) uses the brand font **IBM Plex Sans**, exposed as the `--font-brand` token and the `font-brand` Tailwind utility. Style: bold (700), lowercase, tight tracking (`-0.03em`). Under the Edgeland visual language the brand font matches the body family (IBM Plex Sans) — the wordmark is distinguished by weight/case/tracking, not a separate typeface. Do **not** add a second display typeface for product UI text (titles, chips, body, labels).

### Font tiers
- `Tier 1 / Page title`: 24px / 32px line height / 600 weight
- `Tier 2 / Panel title`: 18px / 24px line height / 600 weight
- `Tier 3 / Section label`: 14px / 20px line height / 600 weight
- `Tier 4 / Body default`: 14px / 20px line height / 400 weight
- `Tier 5 / Support text`: 13px / 18px line height / 400 or 500 weight
- `Tier 6 / Meta / micro label`: 12px / 16px line height / 500 weight

### Typography rules
1. Minimum font size is 12px.
2. Default body text is 14px.
3. Interactive chips and buttons use 13px or 14px only.
4. Use 600 for titles, 500 for labels, 400 for body.
5. Do not introduce extra font weights unless necessary.
6. Text contrast must meet WCAG AA for body text.

---

## Spacing system

Use an 8px base system.

- `4px` — micro spacing inside dense UI only
- `8px` — standard internal gap
- `12px` — compact section gap
- `16px` — standard padding
- `20px` — medium padding
- `24px` — panel padding
- `32px` — large separation

### Spacing rules
- Panel internal padding: 16px or 20px
- Chip internal padding: fixed in component spec below
- Gap between stacked itinerary chips: 8px
- Gap between pocket columns: 12px
- Gap between major layout panels: 12px

---

## Radius system

Use these exact radii.

- `4px` — tiny UI details only
- `8px` — inputs, compact pills, small menus
- `12px` — default cards, panels, dropdowns
- `14px` — itinerary chips and pocket chips
- `16px` — large containers only
- `999px` — pill labels only

### Radius rules
1. Main panels: 16px
2. Internal cards: 12px
3. Itinerary chips: 14px
4. Pocket chips: must reuse itinerary chip radius = 14px
5. Buttons: 10px
6. Do not use any radius larger than 16px except full pills

---

## Borders and shadows

### Borders
- Default border: `1px solid var(--border-subtle)`
- Active border: `1px solid var(--accent-primary-line)`
- Conflict border: `1px solid #F1C27D`
- Error border: `1px solid #F2B8B5`

### Shadows
- `shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.04)`
- `shadow-md: 0 4px 12px rgba(16, 24, 40, 0.08)`
- `shadow-lg: 0 10px 24px rgba(16, 24, 40, 0.10)`

### Shadow rules
- Panels use `shadow-sm` only when floating from app background.
- Chips normally use no shadow.
- Dragged chip can use `shadow-lg`.
- Do not stack multiple dramatic shadows.

---

## Layout rules

### Desktop layout
- App shell padding: 12px
- Column gap: 12px
- Left itinerary column: 320px fixed
- Right copilot column: 360px fixed
- Center area: fluid
- Center area split vertically: map 55%, pocket 45%

### Scroll behavior
- Entire app should fit viewport height.
- Do not scroll the full page.
- Each main panel scrolls internally.

### Panel styling
All four primary panels must share the same base panel style:
- background: `var(--bg-panel)`
- border: `1px solid var(--border-subtle)`
- border-radius: `16px`
- padding: `16px`
- shadow: optional `shadow-sm`

This is mandatory to prevent visual drift.

---

## Core component system

The most important anti-drift rule: itinerary and pocket must reuse the same chip component family.

### Component family
Define one base component:
- `PlanChip`

Variants:
- `PlanChip--itinerary`
- `PlanChip--pocket`
- `PlanChip--selected`
- `PlanChip--dragging`
- `PlanChip--softPinned`
- `PlanChip--hardPinned`
- `PlanChip--conflict`
- `PlanChip--done`
- `PlanChip--dimmed`

All variants must inherit from the same structural base.

---

## PlanChip base spec

This is the canonical object for itinerary events and pocket cards.

### Structure
Each chip must support these zones:
1. Leading status / category marker
2. Main text block
3. Detail row
4. Trailing action zone

### Default size
- Width: full container width
- Min height: 72px
- Padding: 12px
- Radius: 14px
- Background: `#FFFFFF`
- Border: `1px solid var(--border-subtle)`

### Internal layout
- Top row: title + trailing controls
- Second row: metadata
- Optional third row: travel / reservation / fit note
- Internal gap between rows: 6px

### Title style
- 14px / 20px / weight 600
- Color: `var(--text-primary)`
- Maximum: 2 lines

### Metadata style
- 12px / 16px / weight 500
- Color: `var(--text-secondary)`

### Supporting note style
- 12px / 16px / weight 400
- Color: `var(--text-tertiary)`

### Trailing actions
Allowed icons only:
- pin
- lock
- more
- remove

Do not add extra icon actions unless documented.

---

## Itinerary chip spec

### Purpose
Represents one scheduled itinerary item in the left calendar column.

### Required fields shown
- Time range
- Place name
- Category
- Duration
- Area or transit note

### Optional fields shown
- Reservation badge
- Travel time from previous stop
- Constraint note
- status note such as “tight fit” or “buffer”

### Visual behavior
- Selected chip: blue soft background + accent border
- Dragging chip: lifted shadow + 96% scale hold effect is not allowed; keep scale at 100% and use shadow only
- Drop target: show soft blue insertion indicator
- Conflict chip: warning soft background + warning border
- Completed / archived: muted text, muted border

### Height behavior
- Default chip height should be content-based, never compressed below 72px
- Dense mode is not allowed in MVP

### Pin behavior
Two fixed constraint controls are allowed on itinerary chips only:
- **Soft pin**: pin icon, indicates preferred placement
- **Hard fix**: lock icon, indicates fixed placement

Rules:
1. Unpinned = no icon fill
2. Soft pin = pin icon visible, chip remains mostly neutral
3. Hard fix = lock icon visible, blue-toned state cue
4. Hard-fixed items should visually read as less movable
5. Never use red to indicate fixed state

### Drag behavior
- Entire chip is draggable except text-selection zones if implemented
- While dragging, show floating preview with same component styling
- Dragged state must not morph into another card style

---

## Pocket chip spec

### Purpose
Represents a candidate item in the pocket board that can be promoted into itinerary.

### Reuse requirement
Pocket chips must reuse the exact `PlanChip` structure, radius, text tiers, metadata layout, and action zone as itinerary chips.

### Allowed differences from itinerary chips
Pocket chips may differ only in:
- No fixed time by default
- May show source label, e.g. blog / email / saved
- May show category column context
- Can show “Add” affordance instead of scheduled-time emphasis

### Required fields shown
- Place name
- Category
- Area
- Estimated stay length
- Source type or short tag

### Optional fields shown
- Reservation required
- indoor / outdoor
- must-see / backup

### Visual rule
Pocket chips are not a separate card system. They are unscheduled `PlanChip`s.

---

## Chip sub-elements

To prevent drift, define these reusable sub-elements.

### TimeBadge
- 12px text
- 6px vertical padding, 8px horizontal padding
- pill radius 999px
- background `var(--bg-panel-muted)`
- text `var(--text-secondary)`

### CategoryDot
- 8px circle
- color from category token
- placed before category text or title group

### StatusBadge
Allowed styles only:
- Neutral badge
- Reservation badge
- Warning badge
- Locked badge

Badge rules:
- height: 22px
- horizontal padding: 8px
- font: 12px / 16px / 500
- radius: 999px

### PinControl
- icon button size: 28px
- touch size: minimum 32px in desktop, 40px in touch contexts
- neutral default background
- active soft pin uses `var(--pin-soft-bg)`
- active hard fix uses `var(--pin-hard-bg)`

---

## Calendar column rules

### Day group
Each day section in the itinerary column must include:
- Day title
- Date
- Area summary or daily theme
- List of itinerary chips
- Add-slot affordance

### Day card styling
- Background: `var(--bg-panel-muted)` or transparent section container
- No separate visual language from the main app
- Day headers use Tier 3 and Tier 5 typography only

### Insertion behavior
When dragging into a day:
- show insertion line or ghost slot
- do not redesign the chip into a ghost card style
- keep the same component family visual language

---

## Pocket board rules

### Pocket layout
Pocket board uses columns for categories such as:
- Must see
- Maybe
- Food
- Reservations
- Backup

### Column style
- Column background: `var(--bg-panel-muted)`
- Radius: 12px
- Padding: 12px
- Title: Tier 3
- Card gap: 8px

### Column rules
- Columns should not introduce different card shapes
- Only the column container changes, not the chip style

---

## Buttons

### Primary button
- Height: 40px
- Padding: 0 14px
- Radius: 10px
- Fill: `var(--accent-primary)`
- Text: 14px / 20px / 600 / white

### Secondary button
- Height: 40px
- Padding: 0 14px
- Radius: 10px
- Background: white
- Border: `1px solid var(--border-subtle)`
- Text: `var(--text-primary)`

### Ghost button
- Height: 36px
- Padding: 0 10px
- Radius: 10px
- Background: transparent

### Rule
No other button sizes should be added in MVP.

---

## Inputs

### Text input
- Height: 40px
- Radius: 10px
- Padding: 0 12px
- Border: `1px solid var(--border-subtle)`
- Background: white
- Text: Tier 4
- Placeholder: `var(--text-tertiary)`

### Input focus
- Border becomes `var(--accent-primary)`
- Optional soft ring: `0 0 0 3px rgba(47,128,237,0.10)`

---

## Icon system

- Use one icon family only, e.g. Lucide
- Stroke width should remain consistent across the app
- Default icon size: 16px
- Dense action icon size: 14px only where necessary
- Panel header actions: 18px

Do not mix icon families.

---

## Motion rules

- Default transition: 160ms ease
- Drag state shadow transition: 120ms ease-out
- Panel hover effects must be subtle
- Do not animate layout excessively
- Do not use bounce animations
- Do not scale chips on hover

The product should feel stable, not playful.

---

## Accessibility rules

1. Body text must meet WCAG AA contrast.
2. Minimum type size is 12px.
3. Interactive controls should have visible focus states.
4. Pin and lock controls must have text labels or accessible labels.
5. Color must not be the only signal for pin state or conflict state.
6. Drag affordances must also have menu fallback if possible.

---

## Anti-drift rules

These rules are mandatory.

### 1. No new chip types
Do not create separate visual systems for:
- itinerary cards
- pocket cards
- saved place cards
- suggestion cards

All must derive from `PlanChip`.

### 2. No random radii
Do not introduce 18px, 20px, 24px, or arbitrary radii in MVP.
Use only the radius tokens defined above.

### 3. No random text sizes
Do not use 11px, 15px, 17px, 22px, or improvised type sizes.
Use only the defined font tiers.

### 4. No category-colored cards
Category is metadata, not surface fill.

### 5. No duplicate panel styles
Map, itinerary, pocket, and chat must all use the same panel shell.

### 6. No alternate pin styles
A fixed item is always represented by pin or lock controls in the same place and same visual logic.

### 7. No “special case” component forks
If a use case needs a new shape or style, update the base component spec first.

---

## Engineering mapping

Recommended CSS token names:

```css
:root {
  --bg-app: #F6F7F9;
  --bg-panel: #FFFFFF;
  --bg-panel-muted: #F9FAFB;
  --bg-panel-hover: #F3F5F7;
  --bg-selected: #EEF6FF;
  --border-subtle: #E6EAF0;
  --border-strong: #D6DDE7;
  --text-primary: #1F2937;
  --text-secondary: #5B6678;
  --text-tertiary: #8A94A6;
  --text-inverse: #FFFFFF;
  --accent-primary: #2F80ED;
  --accent-primary-hover: #1F6FD6;
  --accent-primary-soft: #EAF3FF;
  --accent-primary-line: #CFE2FF;
  --success: #1F9D68;
  --success-soft: #EAF8F1;
  --warning: #D48A00;
  --warning-soft: #FFF6DF;
  --danger: #D64545;
  --danger-soft: #FDEEEE;
  --info: #5C7CFA;
  --info-soft: #EEF1FF;
  --pin-soft: #7C8AA5;
  --pin-soft-bg: #F1F4F8;
  --pin-hard: #2F80ED;
  --pin-hard-bg: #EAF3FF;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-card: 12px;
  --radius-chip: 14px;
  --radius-panel: 16px;
}
```

Recommended component class structure:

```css
.plan-chip {}
.plan-chip--itinerary {}
.plan-chip--pocket {}
.plan-chip--selected {}
.plan-chip--dragging {}
.plan-chip--soft-pinned {}
.plan-chip--hard-pinned {}
.plan-chip--conflict {}
.plan-chip__title {}
.plan-chip__meta {}
.plan-chip__note {}
.plan-chip__actions {}
.plan-chip__time {}
.plan-chip__badge {}
.plan-chip__pin {}
```

---

## Acceptance checklist

The implementation is acceptable only if all are true:

- Itinerary chips and pocket chips clearly belong to the same component family.
- The left column is visually dominant but not heavy.
- Pin and lock states are clear without changing the whole component language.
- The map, pocket, itinerary, and chat panels share one shell style.
- No new colors, radii, or type sizes appear outside this spec.
- Functional colors are used consistently for warning, conflict, success, and fixed states.
- The UI still looks coherent after adding new pocket categories or itinerary items.

---

## Default summary

If a designer or engineer is unsure what to do, default to this:
- calm neutral surface
- blue primary accent
- IBM Plex Sans only (Edgeland visual language); the `wayfold` brand wordmark uses the same family via `font-brand`, set apart by weight/case/tracking
- 14px body
- 16px panels
- 14px chip radius
- one shared `PlanChip` system
- category color only as metadata accent
- hard fix = lock, soft preference = pin

If something is missing, do not invent it silently. Add it to this document first.
