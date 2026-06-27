# WhatsApp Notification Setup - AiSensy Integration

## Overview

This document describes the complete WhatsApp notification backend for the FMS App using **AiSensy WhatsApp Business API**.

## Architecture

```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│  Mobile/Web App │────▶│  saas_mobileApp_server   │────▶│  whatsapp_queue │
│                 │     │  (Next.js API routes)   │     │  (DB table)    │
└─────────────────┘     └──────────────────────────┘     └────────┬────────┘
                                                                    │
                        ┌──────────────────────────┐              │
                        │   Vercel Cron Job        │◀─────────────┘
                        │  /api/whatsapp/process-queue
                        └────────────┬─────────────┘
                                     │
                                     ▼
                        ┌──────────────────────────┐
                        │      AiSensy API          │
                        │   (Template messages)    │
                        └────────────┬─────────────┘
                                     │
                                     ▼
                        ┌──────────────────────────┐
                        │    WhatsApp Users        │
                        └──────────────────────────┘
```

## Files Created

### API Routes (Next.js)

| File | Description |
|------|-------------|
| `saas_mobileApp_server/app/api/whatsapp/aisensy/route.ts` | Direct AiSensy API send |
| `saas_mobileApp_server/app/api/whatsapp/enqueue/route.ts` | Add message to queue |
| `saas_mobileApp_server/app/api/whatsapp/process-queue/route.ts` | Process queued messages |
| `saas_mobileApp_server/app/api/whatsapp/queue-status/route.ts` | Get queue statistics |
| `saas_mobileApp_server/app/api/whatsapp/templates/route.ts` | List available templates |
| `saas_mobileApp_server/app/api/whatsapp/test/route.ts` | Test AiSensy integration |

### Configuration

| File | Description |
|------|-------------|
| `saas_mobileApp_server/vercel.json` | Vercel cron configuration |
| `saas_mobileApp_server/.env.example` | Environment variables template |
| `saas_mobileApp_server/lib/whatsapp/aiSensyService.ts` | AiSensy service (existing) |

## Environment Variables

Add these to your `.env` file:

```bash
# ── Cron Job Security ──────────────────────────────────────────────────────
CRON_SECRET=your-random-secret-token

# ── AiSensy WhatsApp Business Integration ─────────────────────────────────
AISENSY_API_KEY=your-aisensy-api-key
AISENSY_SOURCE="FMS App"
AISENSY_ENABLED=true

# ── Legacy Wasender WhatsApp (if still in use) ────────────────────────────
WHATSAPP_API_URL=https://wasenderapi.com/api
WHATSAPP_API_KEY=your-wasender-api-key
WHATSAPP_SENDER_ID=your-sender-id
WHATSAPP_ENABLED=false
```

## Setup Steps

### 1. Create AiSensy Templates in Meta Business Manager

Create the following 21 templates in your WhatsApp Business Manager:

#### Ticket Templates (7)
| Campaign Name | Header | Body |
|--------------|--------|------|
| `fms_ticket_created` | Ticket Raised | `{{1}}` - Ticket Number<br>`{{2}}` - User's First Name<br>`{{3}}` - Property Name<br>`{{4}}` - Issue<br>`{{5}}` - Date & Time |
| `fms_ticket_assigned` | Ticket Assigned | `{{1}}` - Ticket Number<br>`{{2}}` - Assignee Name<br>`{{3}}` - Property Name<br>`{{4}}` - Issue<br>`{{5}}` - Priority<br>`{{6}}` - Raised By |
| `fms_ticket_resolved` | Ticket Resolved | `{{1}}` - Ticket Number<br>`{{2}}` - Raiser's Name<br>`{{3}}` - Property Name<br>`{{4}}` - Issue<br>`{{5}}` - Resolved By<br>`{{6}}` - Resolved At |
| `fms_ticket_sla_breached` | SLA Breached | `{{1}}` - Ticket Number<br>`{{2}}` - Admin's Name<br>`{{3}}` - Property Name<br>`{{4}}` - Issue<br>`{{5}}` - Breached By<br>`{{6}}` - Assigned To |
| `fms_ticket_commented` | New Comment | `{{1}}` - Ticket Number<br>`{{2}}` - Recipient Name<br>`{{3}}` - Commenter Name<br>`{{4}}` - Property Name<br>`{{5}}` - Ticket Title<br>`{{6}}` - Comment |
| `fms_ticket_updated` | Status Updated | `{{1}}` - Ticket Number<br>`{{2}}` - Raiser's Name<br>`{{3}}` - Property Name<br>`{{4}}` - Issue<br>`{{5}}` - New Status |
| `fms_ticket_closed` | Ticket Closed | `{{1}}` - Ticket Number<br>`{{2}}` - Raiser's Name<br>`{{3}}` - Property Name<br>`{{4}}` - Issue |

#### PPM Templates (3)
| Campaign Name | Header | Body |
|--------------|--------|------|
| `fms_ppm_due` | PPM Due Today | `{{1}}` - Staff Name<br>`{{2}}` - Property Name<br>`{{3}}` - Task Name<br>`{{4}}` - Due Date<br>`{{5}}` - Location |
| `fms_ppm_overdue` | PPM Overdue | `{{1}}` - Admin Name<br>`{{2}}` - Property Name<br>`{{3}}` - Task Name<br>`{{4}}` - Was Due<br>`{{5}}` - Assigned To |
| `fms_ppm_completed` | PPM Completed | `{{1}}` - Admin Name<br>`{{2}}` - Property Name<br>`{{3}}` - Task Name<br>`{{4}}` - Completed By<br>`{{5}}` - Completed At |

#### Visitor Templates (3)
| Campaign Name | Header | Body |
|--------------|--------|------|
| `fms_visitor_checkin` | Visitor Arrived | `{{1}}` - Host Name<br>`{{2}}` - Property Name<br>`{{3}}` - Visitor Name<br>`{{4}}` - Arrival Time<br>`{{5}}` - Purpose |
| `fms_visitor_checkout` | Visitor Checked Out | `{{1}}` - Visitor Name<br>`{{2}}` - Property Name<br>`{{3}}` - Check-out Time<br>`{{4}}` - Duration |
| `fms_visitor_expected` | Visitor Expected | `{{1}}` - Staff Name<br>`{{2}}` - Property Name<br>`{{3}}` - Visitor Name<br>`{{4}}` - Expected Time<br>`{{5}}` - Meeting<br>`{{6}}` - Purpose |

#### Meeting Room Templates (3)
| Campaign Name | Header | Body |
|--------------|--------|------|
| `fms_meeting_room_booked` | Room Confirmed | `{{1}}` - User Name<br>`{{2}}` - Property Name<br>`{{3}}` - Room Name<br>`{{4}}` - Date<br>`{{5}}` - Start Time<br>`{{6}}` - Duration |
| `fms_meeting_room_reminder` | Room Reminder | `{{1}}` - User Name<br>`{{2}}` - Property Name<br>`{{3}}` - Room Name<br>`{{4}}` - Start Time |
| `fms_meeting_room_cancelled` | Room Cancelled | `{{1}}` - User Name<br>`{{2}}` - Property Name<br>`{{3}}` - Room Name<br>`{{4}}` - Was Scheduled<br>`{{5}}` - Reason |

#### Material Request Templates (2)
| Campaign Name | Header | Body |
|--------------|--------|------|
| `fms_material_request_created` | New Request | `{{1}}` - Request ID<br>`{{2}}` - Recipient Name<br>`{{3}}` - Property Name<br>`{{4}}` - Item<br>`{{5}}` - Quantity<br>`{{6}}` - Priority<br>`{{7}}` - Requested By |
| `fms_material_request_approved` | Request Approved | `{{1}}` - Request ID<br>`{{2}}` - Requester's Name<br>`{{3}}` - Property Name<br>`{{4}}` - Item<br>`{{5}}` - Quantity<br>`{{6}}` - Approved By |

#### Checklist Templates (2)
| Campaign Name | Header | Body |
|--------------|--------|------|
| `fms_checklist_due` | Checklist Due | `{{1}}` - Checklist ID<br>`{{2}}` - Staff Name<br>`{{3}}` - Property Name<br>`{{4}}` - Checklist Name<br>`{{5}}` - Due Time |
| `fms_checklist_missed` | Checklist Missed | `{{1}}` - Checklist ID<br>`{{2}}` - Admin Name<br>`{{3}}` - Property Name<br>`{{4}}` - Checklist Name<br>`{{5}}` - Was Due<br>`{{6}}` - Assigned To |

#### Announcement Template (1)
| Campaign Name | Header | Body |
|--------------|--------|------|
| `fms_announcement` | Announcement | `{{1}}` - Title<br>`{{2}}` - Recipient Name<br>`{{3}}` - Property Name<br>`{{4}}` - Body |

### 2. Create API Campaigns in AiSensy Dashboard

1. Go to AiSensy Dashboard → Campaigns
2. Create new "API Campaign" for each template
3. Select the template from WhatsApp Business Manager
4. Set campaign to **"Live"** status
5. Copy the campaign name exactly as shown above

### 3. Deploy to Vercel

The cron job is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/whatsapp/process-queue",
      "schedule": "* * * * *"
    }
  ]
}
```

On Vercel, this runs automatically every minute.

## API Endpoints

### WhatsApp Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/whatsapp/aisensy` | Send direct message via AiSensy |
| `GET` | `/api/whatsapp/templates` | List all 21 available campaigns |
| `GET` | `/api/whatsapp/queue-status` | Queue stats (pending/sent/failed) |
| `POST` | `/api/whatsapp/enqueue` | Add message to WhatsApp queue |
| `POST` | `/api/whatsapp/process-queue` | Process pending messages (cron) |
| `POST` | `/api/whatsapp/test` | Test AiSensy with sample message |

### Example: Test AiSensy

```bash
curl -X POST http://localhost:3000/api/whatsapp/test \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "919876543210",
    "campaignName": "fms_ticket_created",
    "templateParams": ["TKT-0001", "John", "ABC Property", "AC Repair", "27 Jun 2026, 10:30 AM"]
  }'
```

### Example: Check Queue Status

```bash
curl http://localhost:3000/api/whatsapp/queue-status
```

### Example: Enqueue a Message

```bash
curl -X POST http://localhost:3000/api/whatsapp/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid-here",
    "eventType": "ticket_created",
    "message": "Ticket TKT-0001 has been created"
  }'
```

## Notification Functions

Import from `lib/whatsapp/aiSensyService.ts`:

### Available Functions

```typescript
// Tickets
notifyTicketCreated_AiSensy(userId, ticketNumber, title, propertyName)
notifyTicketAssigned_AiSensy(userId, ticketNumber, title, priority, propertyName)
notifyTicketResolved_AiSensy(userId, ticketNumber, title, propertyName)

// Visitors
notifyVisitorCheckIn_AiSensy({ hostUserId, visitorName, checkInTime, purpose })

// Meeting Rooms
notifyMeetingRoomBooked_AiSensy(userId, roomName, date, time, propertyName)

// PPM
notifyPPMDue_AiSensy(userId, scheduleName, dueDate, propertyName)

// Checklists
notifyChecklistDue_AiSensy(userId, checklistTitle, propertyName, dueTime)
```

## Database Table

The `whatsapp_queue` table stores messages:

```sql
CREATE TABLE IF NOT EXISTS whatsapp_queue (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID REFERENCES tickets(id) ON DELETE SET NULL,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone        TEXT NOT NULL,
    message      TEXT NOT NULL,
    media_url    TEXT,
    media_type   TEXT CHECK (media_type IN ('image', 'video')),
    event_type   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    retry_count  INT NOT NULL DEFAULT 0,
    error        TEXT,
    sent_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Troubleshooting

### Messages not sending
1. Verify `AISENSY_API_KEY` is set in environment
2. Check if campaigns are set to "Live" in AiSensy dashboard
3. Check queue status at `/api/whatsapp/queue-status`

### Template not found
1. Ensure campaign name matches exactly (case-sensitive)
2. Verify template is approved by Meta
3. Verify campaign is set to "Live" in AiSensy

### Phone number issues
1. Phone must be in format: `91XXXXXXXXXX` (Indian numbers)
2. No leading `+` sign
3. 10-digit Indian numbers are auto-converted

## Local Development

For local testing, call the process-queue endpoint manually:

```bash
curl -X POST http://localhost:3000/api/whatsapp/process-queue
```

## Production Deployment

1. Deploy to Vercel
2. Cron jobs run automatically every minute
3. Monitor via Vercel dashboard → Functions → Cron Jobs
