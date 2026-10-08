// Thin vertical separator between groups of controls (toolbar, status bar, selection bar).
import { colors } from '../theme.js';

// Optional props are only added to the style when given, so each bar keeps its exact inline
// style. `colorProperty` picks the CSS property that carries the colour ('backgroundColor' or the
// 'background' shorthand).
export function Divider({
  width = 1,
  height,
  color = colors.border,
  colorProperty = 'backgroundColor',
  margin,
  flexShrink,
}) {
  const style = { width, height, [colorProperty]: color };
  if (margin !== undefined) style.margin = margin;
  if (flexShrink !== undefined) style.flexShrink = flexShrink;
  return <div style={style} />;
}
