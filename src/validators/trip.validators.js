const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');
const timeString = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format');

const locationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  address: z.string().trim().max(300).optional(),
});

const recurrenceSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1), // 0=Sun...6=Sat
  until: z.coerce.date().optional(),
});

const createTripSchema = z.object({
  body: z
    .object({
      origin: locationSchema,
      destination: locationSchema,
      departureTime: z.coerce.date(), // the concrete date+time this specific trip departs
      returnTime: z.coerce.date().optional(),
      isRecurring: z.boolean().optional().default(false),
      recurrence: recurrenceSchema.optional(),
      seatsTotal: z.coerce.number().int().min(1).max(10),
      notes: z.string().trim().max(500).optional(),
    })
    .refine((data) => !data.isRecurring || !!data.recurrence, {
      message: 'recurrence is required when isRecurring is true',
      path: ['recurrence'],
    }),
});

const updateTripSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    departureTime: z.coerce.date().optional(),
    returnTime: z.coerce.date().optional(),
    recurrence: recurrenceSchema.optional(),
    seatsTotal: z.coerce.number().int().min(1).max(10).optional(),
    status: z.enum(['active', 'full', 'completed', 'cancelled']).optional(),
    notes: z.string().trim().max(500).optional(),
  }),
});

const tripIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

const searchTripsSchema = z.object({
  query: z.object({
    originLat: z.coerce.number().min(-90).max(90),
    originLng: z.coerce.number().min(-180).max(180),
    destLat: z.coerce.number().min(-90).max(90),
    destLng: z.coerce.number().min(-180).max(180),
    time: timeString.optional(),
    radiusKm: z.coerce.number().positive().max(100).optional(),
    windowMinutes: z.coerce.number().int().positive().max(240).optional(),
  }),
});

module.exports = {
  createTripSchema,
  updateTripSchema,
  tripIdParamSchema,
  searchTripsSchema,
};