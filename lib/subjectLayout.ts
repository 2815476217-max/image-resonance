/** 按主体真实边界等比适配黑底画面，优先满足高度，超宽时限制宽度。 */
export function subjectFit(sourceWidth: number, sourceHeight: number, stageWidth: number, stageHeight: number): number {
  return Math.min(stageHeight * 0.65 / sourceHeight, stageWidth * 0.75 / sourceWidth);
}
