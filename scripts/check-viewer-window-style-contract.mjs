import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SOURCE_DIRS = ['src/components', 'src/ui'];
const CSS_DIR = 'src/styles/app';
const PRIMITIVE_CSS_FILE = 'src/styles/app/viewer-window-primitives.css';

const IGNORED_FLOATING_WINDOW_CLASSES = new Set(['floating-window--header-bottom']);

const WINDOW_CONTRACTS = {
  'floating-window--annotate': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.annotate-window'],
  },
  'floating-window--annotate-create': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.annotate-create-window'],
  },
  'floating-window--roi-manager': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: [
      '.roi-manager-window',
      '.roi-manager-list',
      '.roi-manager-list-item',
      '.roi-manager-list-item-label',
      '.roi-manager-selection-badge',
      '.roi-manager-empty-state',
      '.roi-manager-actions',
    ],
  },
  'floating-window--backgrounds': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.backgrounds-window__options'],
  },
  'floating-window--camera': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: [
      '.camera-window',
      '.camera-window-library',
      '.camera-window-view',
      '.camera-window-view-label',
      '.camera-window-empty-state',
      '.camera-window-actions',
    ],
  },
  'floating-window--camera-settings': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.camera-settings-window'],
  },
  'floating-window--channels': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives for standard actions.',
    cssScopes: ['.channel-controls'],
  },
  'floating-window--controls': {
    status: 'primitive',
    reason: 'Navigation help tabs use viewer-window button primitives.',
    cssScopes: ['.controls-help-window'],
  },
  'floating-window--draw-roi': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.draw-roi-window'],
  },
  'floating-window--export-channel': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.export-channel-window'],
  },
  'floating-window--hover-settings': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.hover-settings-window'],
  },
  'floating-window--measurements': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.measurements-window'],
  },
  'floating-window--plot-settings': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.plot-settings-window'],
  },
  'floating-window--props': {
    status: 'primitive',
    reason: 'Dense editor migrated to viewer-shell/window-ui primitives for standard actions.',
    cssScopes: ['.props-window-controls'],
  },
  'floating-window--record': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.record-window'],
  },
  'floating-window--runtime-diagnostics': {
    status: 'exception',
    reason: 'Diagnostic overlay with intentionally distinct layout.',
  },
  'floating-window--selected-tracks': {
    status: 'exception',
    reason: 'Chart and legend visualization surface with bespoke SVG and legend controls.',
  },
  'floating-window--set-measurements': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.set-measurements-window'],
  },
  'floating-window--track-settings': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.track-settings-window'],
  },
  'floating-window--tracks': {
    status: 'primitive',
    reason: 'Tracks panel migrated to viewer-shell/window-ui primitives for standard actions.',
    cssScopes: ['.track-controls'],
  },
  'floating-window--viewer-settings': {
    status: 'primitive',
    reason: 'Migrated to viewer-shell/window-ui primitives.',
    cssScopes: ['.viewer-settings-window'],
  },
  'floating-window--warning': {
    status: 'exception',
    reason: 'Warning windows use severity-specific color treatment.',
  },
};

const BANNED_CONTROL_PROPERTIES = new Set([
  'all',
  'accent-color',
  'appearance',
  'border-radius',
  'font-size',
  'font-weight',
  'height',
  'letter-spacing',
  'min-height',
  'padding',
  'padding-block',
  'padding-inline',
  '-webkit-appearance',
]);

const STANDARD_CONTROL_SELECTOR_FRAGMENTS = [
  ' button',
  ' input[type=\'range\']',
  ' select',
  '.annotate-current-label',
  '.annotate-info-label',
  '.annotate-info-value',
  '.channel-action-button',
  '.controls-help-window__tab',
  '.draw-roi-action-button',
  '.draw-roi-segment-button',
  '.measurements-window-actions button',
  '.props-text-style-button',
  '.props-toggle-button',
  '.roi-manager-empty-state',
  '.roi-manager-list-item',
  '.roi-manager-list-item-label',
  '.roi-manager-selection-badge',
  '.set-measurements-actions button',
  '.track-follow-button',
  '.track-length-apply',
  '.track-order-toggle',
  '.viewer-mode-button',
  '.viewer-window-button',
  '.viewer-window-empty-state',
  '.viewer-window-field-label',
  '.viewer-window-field-value',
  '.viewer-window-icon-button',
  '.viewer-window-manager-list-item',
  '.viewer-window-manager-list-item-label',
  '.viewer-window-manager-selection-badge',
  '.viewer-window-range-slider',
  '.viewer-window-segment-button',
  '.viewer-window-select',
  '.viewer-window-select-field',
  '.viewer-window-select-label',
  '.viewer-window-slider',
  '.viewer-window-slider-input',
  '.viewer-window-slider-label',
  '.viewer-window-slider-value',
];

const BANNED_BROAD_FLOATING_CONTROL_SELECTOR_FRAGMENTS = [
  '.viewer-mode-button',
  '.channel-controls .channel-action-button',
  '.track-controls .track-order-toggle',
  '.track-controls .track-follow-button',
  '.controls-help-window__tab',
  '.props-toggle-button',
  '.props-text-style-button',
  '.draw-roi-action-button',
  '.draw-roi-segment-button',
  '.double-range-input',
  '.measurements-window-actions button',
  '.selected-tracks-slider',
  '.set-measurements-actions button',
  '.channel-controls .slider-control input[type=\'range\']',
  '.track-controls .slider-control input[type=\'range\']',
  '.track-length-row input[type=\'range\']',
  '.floating-window button',
  '.floating-window select',
  '.floating-window input[type=\'range\']',
  '.floating-window .global-controls button',
  '.floating-window .global-controls select',
  '.floating-window .global-controls input[type=\'range\']',
  '.floating-window .viewer-mode-button',
  '.floating-window .playback-button',
  '.floating-window .channel-controls .channel-action-button',
  '.floating-window .track-length-apply',
  '.floating-window .track-controls .track-order-toggle',
  '.floating-window .track-controls .track-follow-button',
  '.floating-window .controls-help-window__tab',
  '.global-controls button',
];

function walkFiles(root, extensions) {
  const absoluteRoot = join(REPO_ROOT, root);
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (extensions.some((extension) => path.endsWith(extension))) {
        files.push(path);
      }
    }
  };
  visit(absoluteRoot);
  return files;
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function collectUsedFloatingWindowClasses() {
  const used = new Set();
  for (const sourceDir of SOURCE_DIRS) {
    for (const file of walkFiles(sourceDir, ['.ts', '.tsx'])) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/floating-window--[A-Za-z0-9_-]+/g)) {
        if (!IGNORED_FLOATING_WINDOW_CLASSES.has(match[0])) {
          used.add(match[0]);
        }
      }
    }
  }
  return used;
}

function selectorTargetsStandardControl(selector) {
  return STANDARD_CONTROL_SELECTOR_FRAGMENTS.some((fragment) => selector.includes(fragment));
}

function selectorUsesBannedBroadFloatingControl(selector) {
  return BANNED_BROAD_FLOATING_CONTROL_SELECTOR_FRAGMENTS.some((fragment) => selector.includes(fragment));
}

function collectPrimitiveCssScopes() {
  return Object.values(WINDOW_CONTRACTS)
    .filter((contract) => contract.status === 'primitive')
    .flatMap((contract) => contract.cssScopes ?? []);
}

function parseCssViolations() {
  const cssScopes = collectPrimitiveCssScopes();
  const violations = [];
  const cssFiles = walkFiles(CSS_DIR, ['.css']);

  for (const file of cssFiles) {
    const relativePath = relative(REPO_ROOT, file);
    if (relativePath === PRIMITIVE_CSS_FILE) {
      continue;
    }

    const source = stripCssComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = match[2];
      const selectors = match[1]
        .split(',')
        .map((selector) => selector.trim().replace(/\s+/g, ' '))
        .filter(Boolean);

      for (const selector of selectors) {
        const isBroadFloatingControlSelector = selectorUsesBannedBroadFloatingControl(selector);
        const isPrimitiveScopedStandardControl = (
          cssScopes.some((scope) => selector.includes(scope)) &&
          selectorTargetsStandardControl(selector)
        );

        if (!isBroadFloatingControlSelector && !isPrimitiveScopedStandardControl) {
          continue;
        }

        for (const declaration of body.split(';')) {
          const [rawProperty] = declaration.split(':');
          const property = rawProperty?.trim();
          if (property && BANNED_CONTROL_PROPERTIES.has(property)) {
            const reason = isBroadFloatingControlSelector
              ? 'broad floating-window control selector'
              : 'primitive window control override';
            violations.push(`${relativePath}: ${selector} defines ${property} (${reason})`);
          }
        }
      }
    }
  }

  return violations;
}

const errors = [];
const usedWindowClasses = collectUsedFloatingWindowClasses();

for (const className of usedWindowClasses) {
  if (!WINDOW_CONTRACTS[className]) {
    errors.push(
      `${className} is used but is not registered in scripts/check-viewer-window-style-contract.mjs. ` +
        'Register it as primitive or exception with a reason.',
    );
  }
}

for (const [className, contract] of Object.entries(WINDOW_CONTRACTS)) {
  if (!['primitive', 'exception'].includes(contract.status)) {
    errors.push(`${className} has invalid style-contract status "${contract.status}".`);
  }
  if (!contract.reason || contract.reason.trim().length < 12) {
    errors.push(`${className} must include a concrete style-contract reason.`);
  }
  if (contract.status === 'primitive' && (!contract.cssScopes || contract.cssScopes.length === 0)) {
    errors.push(`${className} is primitive but has no cssScopes to enforce.`);
  }
}

errors.push(...parseCssViolations());

if (errors.length > 0) {
  console.error('Viewer window style contract failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Viewer window style contract passed');
