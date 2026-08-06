const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

const pointSchema = z.object({
  coordinates: z.tuple([
    z.coerce.number().min(-180).max(180), // lng
    z.coerce.number().min(-90).max(90), // lat
  ]),
  address: z.string().trim().max(300).optional(),
});

const createRequestSchema = z.object({
  body: z.object({
    tripId: objectId,
    seatsRequested: z.coerce.number().int().min(1).max(8).optional(),
    pickup: pointSchema.optional(),
    dropoff: pointSchema.optional(),
  }),
});

const requestIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

module.exports = { createRequestSchema, requestIdParamSchema };