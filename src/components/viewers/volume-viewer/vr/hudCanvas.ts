export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

type CanvasRoundRectContext = CanvasRenderingContext2D & {
  roundRect?: (x: number, y: number, width: number, height: number, radius: number) => void;
};

export function drawRoundedRectCompat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const roundRect = (ctx as CanvasRoundRectContext).roundRect;
  if (typeof roundRect === 'function') {
    ctx.beginPath();
    roundRect.call(ctx, x, y, width, height, radius);
    return;
  }
  drawRoundedRect(ctx, x, y, width, height, radius);
}
