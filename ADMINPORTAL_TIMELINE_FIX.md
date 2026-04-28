# AdminPortal timeline physical-fields fix

This repository (`MindPulseEUserW`) does not contain the Admin Portal code that renders the multi-lane physical timeline.

The requested fix ("show all physical fields, do not hide lanes by variance") was implemented locally in:

- `AdminPortal/mindpulse-analyzer/src/components/AdvancedCaseAnalysisSection.tsx`

The exact patch is preserved in:

- `patches/adminportal-show-all-physical-fields.patch`

## Intended behavior after applying patch in AdminPortal

- Show canonical physical lanes each run (`HRV`, `HR`, `focus`, `SpO2`, `BP`, `temperature`, etc.) when session data exists.
- Include additional unknown physical keys as extra lanes.
- Stop dropping lanes based on variance-only filtering.
