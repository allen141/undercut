import { z } from 'zod';

export const negotiationOutcomeSchema = z.enum(['acceptOffer', 'holdPrice', 'decline']);
export const pricePresetSchema = z.union([z.literal(80), z.literal(100), z.literal(120)]);

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chooseTown'), townId: z.string().max(40) }),
  z.object({ type: z.literal('visitVendor'), vendorId: z.string().max(40) }),
  z.object({ type: z.literal('leaveVendor') }),
  z.object({ type: z.literal('finishBuying') }),
  z.object({ type: z.literal('buy'), offerId: z.string().max(100), quantity: z.number().int().min(1).max(99) }),
  z.object({
    type: z.literal('shelf'),
    slot: z.number().int().min(0).max(3),
    goodId: z.string().max(40).nullable(),
    price: z.number().int().min(1).max(10000),
  }),
  z.object({
    type: z.literal('configureDisplays'),
    displays: z.array(z.object({
      slot: z.number().int().min(0).max(3),
      goodId: z.string().max(40).nullable(),
      pricePreset: pricePresetSchema,
    })).length(4),
  }),
  z.object({ type: z.literal('restockDisplay'), slot: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('resolveRestockWait') }),
  z.object({ type: z.literal('open') }),
  z.object({ type: z.literal('serve') }),
  z.object({ type: z.literal('negotiate'), outcome: negotiationOutcomeSchema }),
  z.object({ type: z.literal('close') }),
  z.object({ type: z.literal('nextDay') }),
]);

export const commandRequestSchema = z.object({
  actionId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  command: commandSchema,
});
export const campaignInputSchema = z.object({ name: z.string().trim().min(1).max(60) });

export type Command = z.infer<typeof commandSchema>;
export type CommandRequest = z.infer<typeof commandRequestSchema>;
export type NegotiationOutcome = z.infer<typeof negotiationOutcomeSchema>;
