import type { VolumeViewerVrMenuAction } from '../../VolumeViewer.types';
import {
  VR_WRIST_MENU_FONT_SIZES,
  VR_WRIST_MENU_PANEL_HEIGHT,
  VR_WRIST_MENU_PANEL_WIDTH,
  vrWristMenuFont,
} from './constants';
import type {
  VrWristMenuHud,
  VrWristMenuInteractiveRegion,
} from './types';

const GROUP_COLUMNS: Array<Array<VolumeViewerVrMenuAction['group']>> = [
  ['File', 'Help'],
  ['View'],
  ['Edit', 'Tracks'],
];

const GROUP_ORDER: VolumeViewerVrMenuAction['group'][] = ['File', 'View', 'Edit', 'Tracks', 'Help'];

const ACTION_BUTTON_HEIGHT = 56;
const ACTION_BUTTON_GAP = 10;
const GROUP_LABEL_HEIGHT = 34;
const GROUP_GAP = 24;
const OUTER_PADDING_X = 28;
const OUTER_PADDING_TOP = 30;
const HEADER_HEIGHT = 62;
const COLUMN_GAP = 18;

export function createWristMenuActionsSignature(actions: readonly VolumeViewerVrMenuAction[]): string {
  return actions
    .map((action) => `${action.id}:${action.group}:${action.label}:${action.disabled === true ? '1' : '0'}`)
    .join('|');
}

function localBoundsFromCanvasRect(
  x: number,
  y: number,
  width: number,
  height: number,
  displayWidth: number,
  displayHeight: number,
): VrWristMenuInteractiveRegion['bounds'] {
  const minX = (x / displayWidth) * VR_WRIST_MENU_PANEL_WIDTH - VR_WRIST_MENU_PANEL_WIDTH / 2;
  const maxX =
    ((x + width) / displayWidth) * VR_WRIST_MENU_PANEL_WIDTH - VR_WRIST_MENU_PANEL_WIDTH / 2;
  const maxY = VR_WRIST_MENU_PANEL_HEIGHT / 2 - (y / displayHeight) * VR_WRIST_MENU_PANEL_HEIGHT;
  const minY =
    VR_WRIST_MENU_PANEL_HEIGHT / 2 -
    ((y + height) / displayHeight) * VR_WRIST_MENU_PANEL_HEIGHT;
  return { minX, maxX, minY, maxY };
}

function setFittingButtonFont(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  for (let size = VR_WRIST_MENU_FONT_SIZES.button; size >= VR_WRIST_MENU_FONT_SIZES.smallButton; size -= 1) {
    context.font = vrWristMenuFont('600', size);
    if (context.measureText(text).width <= maxWidth) {
      return;
    }
  }
  context.font = vrWristMenuFont('600', VR_WRIST_MENU_FONT_SIZES.smallButton);
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const resolvedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}

export function renderVrWristMenuHud(
  hud: VrWristMenuHud,
  actions: readonly VolumeViewerVrMenuAction[],
): void {
  const canvas = hud.panelCanvas;
  const context = hud.panelContext;
  if (!canvas || !context) {
    return;
  }

  const pixelRatio = hud.pixelRatio || 1;
  const displayWidth = hud.panelDisplayWidth;
  const displayHeight = hud.panelDisplayHeight;
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, displayWidth, displayHeight);
  context.fillStyle = '#10161d';
  context.fillRect(0, 0, displayWidth, displayHeight);

  context.fillStyle = '#f7fbff';
  context.font = vrWristMenuFont('700', VR_WRIST_MENU_FONT_SIZES.heading);
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText('Menu', OUTER_PADDING_X, OUTER_PADDING_TOP + HEADER_HEIGHT / 2);

  context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(OUTER_PADDING_X, OUTER_PADDING_TOP + HEADER_HEIGHT);
  context.lineTo(displayWidth - OUTER_PADDING_X, OUTER_PADDING_TOP + HEADER_HEIGHT);
  context.stroke();

  const groupedActions = new Map<VolumeViewerVrMenuAction['group'], VolumeViewerVrMenuAction[]>();
  for (const group of GROUP_ORDER) {
    groupedActions.set(group, []);
  }
  for (const action of actions) {
    groupedActions.get(action.group)?.push(action);
  }

  const contentTop = OUTER_PADDING_TOP + HEADER_HEIGHT + 24;
  const contentWidth = displayWidth - OUTER_PADDING_X * 2;
  const columnWidth = (contentWidth - COLUMN_GAP * (GROUP_COLUMNS.length - 1)) / GROUP_COLUMNS.length;
  const nextRegions: VrWristMenuInteractiveRegion[] = [];

  for (let columnIndex = 0; columnIndex < GROUP_COLUMNS.length; columnIndex += 1) {
    const columnGroups = GROUP_COLUMNS[columnIndex] ?? [];
    const columnX = OUTER_PADDING_X + columnIndex * (columnWidth + COLUMN_GAP);
    let y = contentTop;

    for (const group of columnGroups) {
      const groupActions = groupedActions.get(group) ?? [];
      if (groupActions.length === 0) {
        continue;
      }

      context.fillStyle = '#95a5b8';
      context.font = vrWristMenuFont('700', VR_WRIST_MENU_FONT_SIZES.group);
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(group, columnX + 4, y + GROUP_LABEL_HEIGHT / 2);
      y += GROUP_LABEL_HEIGHT + 8;

      for (const action of groupActions) {
        const disabled = action.disabled === true || !action.onSelect;
        const isHovered = hud.hoverRegion?.actionId === action.id && !disabled;
        drawRoundedRect(context, columnX, y, columnWidth, ACTION_BUTTON_HEIGHT, 8);
        context.fillStyle = disabled
          ? '#252c36'
          : isHovered
            ? '#315f95'
            : '#202936';
        context.fill();
        context.strokeStyle = isHovered ? '#9dccff' : 'rgba(255, 255, 255, 0.12)';
        context.lineWidth = isHovered ? 3 : 2;
        context.stroke();

        context.fillStyle = disabled ? '#718092' : '#f4f8ff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        setFittingButtonFont(context, action.label, columnWidth - 24);
        context.fillText(action.label, columnX + columnWidth / 2, y + ACTION_BUTTON_HEIGHT / 2 + 1);

        nextRegions.push({
          targetType: 'wrist-menu-action',
          actionId: action.id,
          disabled,
          bounds: localBoundsFromCanvasRect(
            columnX,
            y,
            columnWidth,
            ACTION_BUTTON_HEIGHT,
            displayWidth,
            displayHeight,
          ),
        });
        y += ACTION_BUTTON_HEIGHT + ACTION_BUTTON_GAP;
      }

      y += GROUP_GAP;
    }
  }

  if (actions.length === 0) {
    context.fillStyle = '#d5deea';
    context.font = vrWristMenuFont('600', VR_WRIST_MENU_FONT_SIZES.emptyState);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('No menu commands', displayWidth / 2, Math.max(contentTop + 60, displayHeight / 2));
  }

  context.restore();
  hud.regions = nextRegions;
  hud.actions = [...actions];
  hud.actionsSignature = createWristMenuActionsSignature(actions);
  hud.panelTexture.needsUpdate = true;
}
