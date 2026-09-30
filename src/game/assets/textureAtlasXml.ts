import type { SpritesheetData, SpritesheetFrameData } from 'pixi.js'

/**
 * Converts a Starling/Sparrow `<TextureAtlas>` XML (the format of the provided ships atlas)
 * into Pixi's spritesheet data. Frame names drop their `.png` extension, so `ship_1.png`
 * becomes `ship_1`.
 *
 * Only untrimmed, unrotated sub-textures are supported, which is all the provided atlas uses.
 */
export function parseTextureAtlasXml(xml: string, scale = 1): SpritesheetData {
  const frames: Record<string, SpritesheetFrameData> = {}
  const subTexture = /<SubTexture\b([^>]*)\/>/g

  for (const match of xml.matchAll(subTexture)) {
    const attrs = readAttributes(match[1] ?? '')
    const name = attrs.get('name')
    if (name === undefined) throw new Error('TextureAtlas: SubTexture without a name')
    if (attrs.has('frameX') || attrs.has('rotated')) {
      throw new Error(`TextureAtlas: trimmed or rotated frame "${name}" is not supported`)
    }
    const w = readNumber(attrs, 'width', name)
    const h = readNumber(attrs, 'height', name)
    frames[name.replace(/\.png$/, '')] = {
      frame: { x: readNumber(attrs, 'x', name), y: readNumber(attrs, 'y', name), w, h },
      sourceSize: { w, h },
      spriteSourceSize: { x: 0, y: 0, w, h },
    }
  }

  if (Object.keys(frames).length === 0) throw new Error('TextureAtlas: no SubTexture entries')
  return { frames, meta: { scale } }
}

function readAttributes(source: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const match of source.matchAll(/(\w+)="([^"]*)"/g)) {
    const key = match[1]
    const value = match[2]
    if (key !== undefined && value !== undefined) attrs.set(key, value)
  }
  return attrs
}

function readNumber(attrs: Map<string, string>, key: string, frame: string): number {
  const value = Number(attrs.get(key))
  if (!Number.isFinite(value)) throw new Error(`TextureAtlas: frame "${frame}" has no numeric ${key}`)
  return value
}
