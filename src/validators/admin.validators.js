const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format');

const userIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

const flagUserSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    reason: z.string().trim().max(500).optional(),
  }),
});

const listUsersQuerySchema = z.object({
  query: z.object({
    flagged: z.enum(['true', 'false']).optional(),
    disabled: z.enum(['true', 'false']).optional(),
  }),
});

module.exports = { userIdParamSchema, flagUserSchema, listUsersQuerySchema };