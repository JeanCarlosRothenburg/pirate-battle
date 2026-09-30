import { readFileSync } from 'node:fs'
import { parseTextureAtlasXml } from './textureAtlasXml'

describe('parseTextureAtlasXml', () => {
  it('converts every frame of the provided ships atlas', () => {
    const xml = readFileSync('assets/spritesheet/ships_miscellaneous_sheet.xml', 'utf8')
    const data = parseTextureAtlasXml(xml)
    const names = Object.keys(data.frames)

    expect(names).toHaveLength((xml.match(/<SubTexture/g) ?? []).length)
    expect(names).toContain('ship_24')
    expect(names).toContain('cannon_ball')
    expect(data.frames['cannon_ball']?.frame).toEqual({ x: 120, y: 29, w: 10, h: 10 })
  })

  it('rejects trimmed frames it cannot represent', () => {
    const xml = '<TextureAtlas><SubTexture name="a.png" x="0" y="0" width="4" height="4" frameX="1"/></TextureAtlas>'
    expect(() => parseTextureAtlasXml(xml)).toThrow(/not supported/)
  })

  it('rejects an atlas with no frames', () => {
    expect(() => parseTextureAtlasXml('<TextureAtlas></TextureAtlas>')).toThrow(/no SubTexture/)
  })
})
