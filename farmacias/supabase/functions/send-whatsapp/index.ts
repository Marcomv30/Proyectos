// ============================================================
// Supabase Edge Function: send-whatsapp
// Envia notificaciones via WhatsApp Cloud API
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_CLOUD_TOKEN')
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')
const WHATSAPP_VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

serve(async (req) => {
  // ── Webhook verification (GET) ──
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      console.log('Webhook verified successfully')
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ── Incoming webhook (status updates) ──
  if (req.method === 'POST') {
    const body = await req.json()

    // Status update callbacks
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
      for (const status of body.entry[0].changes[0].value.statuses) {
        const msgStatus = status.status === 'delivered' || status.status === 'read'
          ? 'sent' : status.status === 'failed' ? 'failed' : 'pending'

        await supabase
          .from('notifications')
          .update({
            status: msgStatus as any,
            whatsapp_message_id: status.id,
            sent_at: new Date().toISOString(),
            error_message: status.errors?.[0]?.message ?? null,
          })
          .eq('whatsapp_message_id', status.id)
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Process pending notifications ──
    const { data: pending } = await supabase
      .from('notifications')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50)

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending notifications', processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let processed = 0
    for (const notification of pending) {
      try {
        const response = await sendWhatsAppMessage(
          notification.phone,
          notification.message,
          notification.notification_type
        )

        if (response.success) {
          await supabase
            .from('notifications')
            .update({
              status: 'sent',
              whatsapp_message_id: response.messageId,
              sent_at: new Date().toISOString(),
            })
            .eq('id', notification.id)
          processed++
        } else {
          await supabase
            .from('notifications')
            .update({
              status: 'failed',
              error_message: response.error,
            })
            .eq('id', notification.id)
        }
      } catch (error) {
        console.error(`Failed to send notification ${notification.id}:`, error)
        await supabase
          .from('notifications')
          .update({ status: 'failed', error_message: String(error) })
          .eq('id', notification.id)
      }
    }

    return new Response(
      JSON.stringify({ message: 'Notifications processed', processed, total: pending.length }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response('Method not allowed', { status: 405 })
})

async function sendWhatsAppMessage(phone: string, message: string, type: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    return { success: false, error: 'WhatsApp credentials not configured' }
  }

  // Send text message via WhatsApp Cloud API
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: {
          body: message,
        },
      }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    return { success: false, error: data.error?.message ?? 'Unknown error' }
  }

  return { success: true, messageId: data.messages?.[0]?.id }
}
