# Workflow — Coach cross-platform wayfinding (BG entrance)

Applies when the TV display pin is on **Platform 1** and the featured train is on **Platform 2 or 3**.

```mermaid
flowchart TD
  A[Featured_train_PF] --> B{Train_PF_equals_display_PF}
  B -->|Yes PF1| C[Same_platform_deck]
  C --> D[PF1_amenities_pin_walk]
  C --> E[FOB_may_use_pin_plus_walkMeters_anchor]
  B -->|No PF2_or_PF3| F{fob-pf1_links_train_PF}
  F -->|No| G[No_cross_platform_FOB_context]
  F -->|Yes| H[crossPlatformFobContext]
  H --> I[Deck_platform_equals_PF1]
  I --> J[Show_PF1_amenities_only]
  I --> K[Walk_labels_from_PF1_pin_slot]
  I --> L[FOB_graphic_at_survey_markers_14_15]
  I --> M[Banner_walk_178m_then_cross]
  D --> N[Render]
  E --> N
  J --> N
  K --> N
  L --> N
  M --> N
  G --> N
```

Parent: [06 — Business Logic](../06-business-logic.md)
