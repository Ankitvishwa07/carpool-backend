const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

const createRatingSchema = z.object({
  body: z.object({
    tripId: objectId,
    rateeId: objectId,
    stars: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
  }),
});

const userIdParamSchema = z.object({
  params: z.object({ userId: objectId }),
});

module.exports = { createRatingSchema, userIdParamSchema };