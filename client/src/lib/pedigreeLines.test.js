import { describe, expect, test } from 'vitest'
import { householdPath, laneConnector, placeLaneGroups, RAIL_DROP, unionPaths } from './pedigreeLines.js'

const box = (cx, bottom = 50) => ({ cx, bottom })

describe('householdPath', () => {
  test('draws one bracket under all members with a stub for each', () => {
    const { d, icon } = householdPath([box(300), box(100), box(500)])
    const rail = 50 + RAIL_DROP
    expect(d.startsWith('M100,50 ')).toBe(true)
    expect(d).toContain(`H${500 - 8}`)
    expect(d).toContain(`M300,50 V${rail}`)
    expect(icon).toEqual({ x: 200, y: rail })
  })

  test('two members: the house sits in the middle of the rail', () => {
    const { icon } = householdPath([box(100), box(340, 46)])
    expect(icon).toEqual({ x: 220, y: 50 + RAIL_DROP })
  })

  test('the rail hangs below the lowest card', () => {
    const { icon } = householdPath([box(100, 40), box(300, 70)])
    expect(icon.y).toBe(70 + RAIL_DROP)
  })
})

describe('placeLaneGroups', () => {
  const anchorAt = (cx) => ({ cx, left: cx - 120, right: cx + 120, bottom: 100 })

  test('a group hangs centered below its housemate, like a submenu', () => {
    const placed = placeLaneGroups([{ anchorId: 1 }], { anchors: new Map([[1, anchorAt(300)]]), widths: new Map([[1, 200]]) })
    expect(placed.get(1)).toEqual({ x: 200, width: 200, stemX: 300 })
  })

  test('if the housemate has puppies, the group moves aside and leaves their line free', () => {
    const placed = placeLaneGroups([{ anchorId: 1 }], {
      anchors: new Map([[1, anchorAt(300)]]),
      widths: new Map([[1, 200]]),
      stems: [300]
    })
    expect(placed.get(1)).toEqual({ x: 336, width: 200, stemX: 340 })
  })

  test('lines of neighbouring parents are avoided', () => {
    const placed = placeLaneGroups([{ anchorId: 1 }], {
      anchors: new Map([[1, anchorAt(300)]]),
      widths: new Map([[1, 200]]),
      stems: [380]
    })
    expect(placed.get(1).x).toBe(64)
  })

  test('groups never overlap and never reach into the generation column', () => {
    const placed = placeLaneGroups([{ anchorId: 1 }, { anchorId: 2 }], {
      anchors: new Map([
        [1, anchorAt(50)],
        [2, anchorAt(150)]
      ]),
      widths: new Map([
        [1, 200],
        [2, 200]
      ]),
      minX: 0,
      gap: 16
    })
    expect(placed.get(1).x).toBe(0)
    expect(placed.get(2).x).toBe(216)
  })
})

test('groups stay inside the tree on the right, too', () => {
  const placed = placeLaneGroups([{ anchorId: 1 }], {
    anchors: new Map([[1, { cx: 900, left: 780, right: 1020, bottom: 100 }]]),
    widths: new Map([[1, 400]]),
    maxX: 1000
  })
  expect(placed.get(1).x).toBe(600)
})

describe('laneConnector', () => {
  test('a stem from the housemate down to a rail, with a drop into every card', () => {
    const { d, icon } = laneConnector({ cx: 300, bottom: 100 }, 300, [
      { cx: 470, top: 180 },
      { cx: 250, top: 180 }
    ])
    expect(d.startsWith('M300,100 V164')).toBe(true)
    expect(d).toContain('M250,164 H470')
    expect(d).toContain('M250,164 V180')
    expect(d).toContain('M470,164 V180')
    expect(icon).toEqual({ x: 300, y: 132 })
  })
})

describe('unionPaths', () => {
  const boxes = new Map([
    [1, { cx: 100, bottom: 100 }],
    [2, { cx: 300, bottom: 100 }],
    [3, { cx: 200, top: 400 }]
  ])
  const union = { parents: [1, 2], children: [3] }

  test('parents connect through a joint to their children', () => {
    const { joint } = unionPaths(union, boxes)
    expect(joint.x).toBe(200)
    expect(joint.y).toBeCloseTo(100 + 300 * 0.45)
  })

  test('with a housemate lane in between, the joint moves below it', () => {
    const { joint, paths } = unionPaths(union, boxes, { floor: 250 })
    expect(joint.y).toBeGreaterThan(250)
    expect(paths[0]).toContain('M100,100 V250')
  })
})
