// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  updateProfileEvent: vi.fn(),
  pop: vi.fn(),
  error: vi.fn()
}))
vi.mock('@/providers/NostrProvider', () => {
  const profile = { username: 'Alice', original_username: 'Alice', sp: 'sp1original' }
  return {
    useNostr: () => ({
      account: { pubkey: 'test' },
      profile,
      profileEvent: {
        content: JSON.stringify({ name: 'Alice', sp: 'sp1original', custom: 'preserved' }),
        tags: []
      },
      publish: mocks.publish,
      updateProfileEvent: mocks.updateProfileEvent
    })
  }
})
vi.mock('@/PageManager', () => ({ useSecondaryPage: () => ({ pop: mocks.pop }) }))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (s: string) => s }) }))
vi.mock('@/lib/pubkey', () => ({ generateImageByPubkey: () => '' }))
vi.mock('@/lib/utils', () => ({ isEmail: () => true }))
vi.mock('@/lib/draft-event', () => ({
  createProfileDraftEvent: (content: string, tags: string[][]) => ({ content, tags })
}))
vi.mock('@/layouts/SecondaryPageLayout', () => ({
  default: ({ children, controls }: { children: ReactNode; controls: ReactNode }) =>
    createElement('div', null, controls, children)
}))
vi.mock('@/components/PostEditor/Uploader', () => ({ default: () => null }))
vi.mock('@/components/ProfileBanner', () => ({ default: () => null }))
vi.mock('@/components/ui/avatar', () => ({
  Avatar: () => null,
  AvatarFallback: () => null,
  AvatarImage: () => null
}))
vi.mock('@/components/ui/button', () => ({
  Button: (props: object) => createElement('button', props)
}))
vi.mock('@/components/ui/input', () => ({
  Input: (props: object) => createElement('input', props)
}))
vi.mock('@/components/ui/label', () => ({
  Label: (props: object) => createElement('label', props)
}))
vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: object) => createElement('textarea', props)
}))
import ProfileEditorPage from '@/pages/secondary/ProfileEditorPage'

let root: Root
let container: HTMLDivElement
beforeEach(async () => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.updateProfileEvent.mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(ProfileEditorPage)))
  const input = container.querySelector('#profile-sp-address-input') as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'sp1edited'
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
it('preserves edits and permits retry after a rejected save', async () => {
  mocks.publish
    .mockRejectedValueOnce(new Error('Signer rejected'))
    .mockResolvedValueOnce({ id: 'saved' })
  const save = container.querySelector('button')!
  expect(save.disabled).toBe(false)
  await act(async () => save.click())
  expect(mocks.error).toHaveBeenCalledWith('Failed to save profile: Signer rejected', {
    duration: 10_000
  })
  expect(save.disabled).toBe(false)
  expect(save.textContent).toBe('Save')
  expect(mocks.pop).not.toHaveBeenCalled()
  expect((container.querySelector('#profile-sp-address-input') as HTMLInputElement).value).toBe(
    'sp1edited'
  )
  await act(async () => save.click())
  expect(mocks.publish).toHaveBeenCalledTimes(2)
  expect(JSON.parse(mocks.publish.mock.lastCall![0].content)).toMatchObject({
    sp: 'sp1edited',
    custom: 'preserved'
  })
  expect(mocks.pop).toHaveBeenCalledOnce()
})
it('allows retry when updating the local profile fails', async () => {
  mocks.publish.mockResolvedValue({ id: 'saved' })
  mocks.updateProfileEvent.mockRejectedValueOnce(new Error('Storage failed'))
  const save = container.querySelector('button')!
  await act(async () => save.click())
  expect(save.disabled).toBe(false)
  expect(save.textContent).toBe('Save')
  expect(mocks.pop).not.toHaveBeenCalled()
})
