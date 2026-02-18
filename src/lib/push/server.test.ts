import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock web-push before importing
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

import webpush from 'web-push'
import { sendPushNotification } from './server'

describe('sendPushNotification', () => {
  const mockTarget = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
    keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
  }

  const mockPayload = {
    title: 'Test',
    body: 'Test notification',
    url: '/study',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Set env vars for VAPID config
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public-key'
    process.env.VAPID_PRIVATE_KEY = 'test-private-key'
    process.env.VAPID_SUBJECT = 'mailto:test@example.com'
  })

  it('should configure VAPID and send notification successfully', async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({
      statusCode: 201,
      headers: {},
      body: '',
    })

    const result = await sendPushNotification(mockTarget, mockPayload)

    expect(result.success).toBe(true)
    expect(result.statusCode).toBe(201)
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      'test-public-key',
      'test-private-key'
    )
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: mockTarget.endpoint, keys: mockTarget.keys },
      JSON.stringify(mockPayload)
    )
  })

  it('should handle 410 Gone (expired subscription)', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({
      statusCode: 410,
      message: 'Gone',
    })

    const result = await sendPushNotification(mockTarget, mockPayload)

    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(410)
    expect(result.error).toBe('Gone')
  })

  it('should handle network errors', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      new Error('Network error')
    )

    const result = await sendPushNotification(mockTarget, mockPayload)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Network error')
  })

  it('should handle 403 Forbidden', async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({
      statusCode: 403,
      message: 'Forbidden',
    })

    const result = await sendPushNotification(mockTarget, mockPayload)

    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(403)
  })
})
