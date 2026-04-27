# Viewer Window Style Contract

Non-VR viewer windows should be assembled from the shared primitives in:

```txt
src/components/viewers/viewer-shell/window-ui/
```

The default path for a new window is:

```tsx
<ViewerWindowStack>
  <ViewerWindowRow>
    <ViewerWindowButton>Action</ViewerWindowButton>
  </ViewerWindowRow>
  <ViewerWindowSelectField label="Mode" value={mode} onChange={handleModeChange}>
    <option value="one">One</option>
  </ViewerWindowSelectField>
  <ViewerWindowSlider
    label="Opacity"
    valueLabel={`${Math.round(opacity * 100)}%`}
    min={0}
    max={1}
    step={0.05}
    value={opacity}
    onChange={handleOpacityChange}
  />
  <ViewerWindowDivider />
  <ViewerWindowManager>
    <ViewerWindowManagerList />
    <ViewerWindowManagerActions />
  </ViewerWindowManager>
</ViewerWindowStack>
```

Shared visual styling for ordinary floating-window controls lives in:

```txt
src/styles/app/viewer-window-primitives.css
```

`theme.css` should provide tokens and theme-specific color values, not broad floating-window button/select/range rules. Feature CSS may define layout that is specific to a window. It must not redefine standard typography, button sizing, select styling, slider track/thumb styling, list item styling, active states, disabled states, padding, or border radius for ordinary controls.

Use `ViewerWindowSelect` or `ViewerWindowSelectField` for native floating-window dropdowns. Use `ViewerWindowSlider` for ordinary single-value sliders, and `ViewerWindowRangeSlider` for two-handle numeric ranges. Window CSS may still decide where those controls sit, how much space a row or grid gets, and whether a control should be compact or full width. It should not style raw `select` elements or `input[type='range']` controls directly.

## Enforcement

`npm run check:architecture` runs:

```txt
scripts/check-viewer-window-style-contract.mjs
```

That check requires every `floating-window--...` class to be registered as one of:

- `primitive`: migrated to the shared viewer-window primitives and guarded against local control styling.
- `exception`: intentional visual exception, with a concrete reason.

There is no `legacy` status. New non-VR viewer windows must use the primitives by default, or be registered as an explicit exception. For primitive windows, the check rejects feature CSS that restyles standard controls with properties such as `font-size`, `font-weight`, `height`, `min-height`, `padding`, `border-radius`, `letter-spacing`, `accent-color`, `appearance`, or `all`. The check also rejects broad selectors such as `.floating-window button`, `.floating-window select`, `.floating-window input[type='range']`, `.floating-window .global-controls button`, and old semantic floating-window control selectors.

## Current Exceptions

The selected-tracks amplitude plot, runtime diagnostics, and warning windows are explicit exceptions because they are chart, diagnostic, or severity-specific surfaces rather than standard control windows.
