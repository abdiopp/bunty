import { beforeEach, describe, expect, it } from 'vitest'
import { testApp, type TestApp } from './helpers'

describe('categories', () => {
  let app: TestApp

  beforeEach(() => {
    app = testApp()
  })

  it('creates and lists alphabetically, ignoring case', () => {
    app.categories.create({ name: 'work', color: '#ff0000' })
    app.categories.create({ name: 'Home', color: '#00ff00' })
    expect(app.categories.list().map((category) => category.name)).toEqual(['Home', 'work'])
  })

  it('rejects a duplicate name in any case, on create and on rename', () => {
    const home = app.categories.create({ name: 'Home', color: '#00ff00' })
    const work = app.categories.create({ name: 'Work', color: '#ff0000' })

    expect(() => app.categories.create({ name: 'HOME', color: '#000000' })).toThrowError(
      expect.objectContaining({ code: 'NAME_TAKEN' })
    )
    expect(() => app.categories.update({ id: work.id, patch: { name: 'home' } })).toThrowError(
      expect.objectContaining({ code: 'NAME_TAKEN' })
    )
    expect(app.categories.update({ id: home.id, patch: { color: '#123456' } }).name).toBe('Home')
  })

  it('keeps tasks when their category is deleted', () => {
    const category = app.categories.create({ name: 'Home', color: '#00ff00' })
    const task = app.tasks.create({ title: 'x', categoryId: category.id })

    app.categories.remove(category.id)

    expect(app.tasks.get(task.id).categoryId).toBeNull()
  })
})
