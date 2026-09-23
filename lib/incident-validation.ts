import { ApiError } from './ticket-store.ts';
import { categoryLabel } from './lab.ts';
import { priorityLabel } from './incidents.ts';
export function keys(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    throw new ApiError(400, 'Unexpected request field.');
}
export function validDetails(body: Record<string, unknown>) {
  if (
    typeof body.category !== 'string' ||
    !Object.hasOwn(categoryLabel, body.category) ||
    typeof body.priority !== 'string' ||
    !Object.hasOwn(priorityLabel, body.priority) ||
    typeof body.asset !== 'string' ||
    body.asset.length > 120
  )
    throw new ApiError(
      400,
      'Choose a valid category and priority; asset names must be under 120 characters.',
    );
}
