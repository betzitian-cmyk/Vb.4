export const VIEW_MODES = {
  UI: "ui",
  PARSED: "parsed",
  RAW: "raw"
} as const;

export type ViewMode = typeof VIEW_MODES[keyof typeof VIEW_MODES];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  [VIEW_MODES.UI]: "UI",
  [VIEW_MODES.PARSED]: "Parsed",
  [VIEW_MODES.RAW]: "Raw"
};
