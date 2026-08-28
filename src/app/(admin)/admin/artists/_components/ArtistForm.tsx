'use client'

import type { Artist } from '@/lib/db/schema'
import { useFormState } from 'react-dom'
import type { SquareCategoryOption } from './SquareCategoryPicker'

export interface ArtistFormError {
  /** Top-level message displayed at the top of the form. */
  message: string
  /** Per-field errors keyed by the form field name. */
  fields?: Partial<Record<string, string>>
}

export type ArtistFormState = { error?: ArtistFormError } | undefined

export interface ArtistFormProps {
  /** Server action wired to (prev, FormData) -> state. */
  action: (prev: ArtistFormState, form: FormData) => Promise<ArtistFormState>
  /** Square Artist > * sub-category options, pre-fetched server-side. */
  categoryOptions: SquareCategoryOption[]
  /** When editing, the current artist row to pre-populate fields with. */
  initial?: Artist
  /** Form mode — affects button label and a couple of validations. */
  mode: 'create' | 'edit'
}

const PAYMENT_METHODS = ['paypal', 'venmo', 'check', 'zelle', 'other'] as const

/**
 * Shared HTML form for both create and edit flows. Client component
 * so we can wire useFormState for inline server-action errors without
 * a full-page redirect on validation failure.
 *
 * No client-side form library — plain <input>s. HTML attrs handle the
 * obvious cases (required, pattern, min/max, accept); the server
 * action re-validates everything via ArtistInputSchema and any error
 * surfaces back through useFormState's `state` value.
 */
export function ArtistForm({
  action,
  categoryOptions,
  initial,
  mode
}: ArtistFormProps): JSX.Element {
  const [state, formAction] = useFormState(action, undefined)
  const a = initial
  const err = state?.error
  const fieldErr = (name: string) => err?.fields?.[name]

  return (
    <form
      action={formAction}
      method="post"
      encType="multipart/form-data"
      style={{ display: 'grid', gap: '0.75rem', maxWidth: '40rem' }}
    >
      {err?.message && (
        <div role="alert" style={{ background: '#fee', padding: '0.5rem' }}>
          {err.message}
        </div>
      )}

      <Field
        label="Slug"
        hint="Lowercase, digits, dot, hyphen. Used in /artist/<slug>."
        error={fieldErr('slug')}
      >
        <input
          type="text"
          name="slug"
          required
          maxLength={80}
          pattern="^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$"
          defaultValue={a?.slug}
          readOnly={mode === 'edit'} // slug is identity; don't break old URLs
        />
      </Field>

      <Field label="Display name" error={fieldErr('displayName')}>
        <input
          type="text"
          name="displayName"
          required
          maxLength={120}
          defaultValue={a?.displayName}
        />
      </Field>

      <Field
        label="Square sub-category"
        error={fieldErr('squareCategoryId')}
        hint="Choose from existing Artist > * categories in Square. Add new ones in the Square dashboard."
      >
        <select name="squareCategoryId" defaultValue={a?.squareCategoryId ?? ''} required>
          <option value="" disabled>
            Select a sub-category...
          </option>
          {categoryOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
        {categoryOptions.length === 0 && (
          <small style={{ color: '#a33' }}>
            No Artist sub-categories found. Create one in the Square dashboard first.
          </small>
        )}
      </Field>

      <Field label="Status">
        <span>
          <label style={{ marginRight: '1rem' }}>
            <input
              type="radio"
              name="status"
              value="active"
              defaultChecked={(a?.status ?? 'active') === 'active'}
            />{' '}
            Active
          </label>
          <label>
            <input
              type="radio"
              name="status"
              value="inactive"
              defaultChecked={a?.status === 'inactive'}
            />{' '}
            Inactive
          </label>
        </span>
      </Field>

      <Field
        label="Avatar"
        hint={
          a?.avatarUrl
            ? `Currently: ${a.avatarUrl}. Upload a new file to replace.`
            : 'PNG/JPEG/WebP, max 2 MB. Resized to 500x500 webp on save.'
        }
        error={fieldErr('avatarFile')}
      >
        <input type="file" name="avatarFile" accept="image/png,image/jpeg,image/webp" />
      </Field>

      <Field label="Bio" error={fieldErr('bio')}>
        <textarea name="bio" maxLength={2000} rows={4} defaultValue={a?.bio ?? ''} />
      </Field>

      <fieldset style={{ display: 'grid', gap: '0.5rem' }}>
        <legend>Social URLs (optional)</legend>
        <SocialField
          name="instagram"
          label="Instagram"
          defaultValue={a?.instagram}
          error={fieldErr('instagram')}
        />
        <SocialField
          name="twitter"
          label="Twitter / X"
          defaultValue={a?.twitter}
          error={fieldErr('twitter')}
        />
        <SocialField
          name="facebook"
          label="Facebook"
          defaultValue={a?.facebook}
          error={fieldErr('facebook')}
        />
        <SocialField
          name="youtube"
          label="YouTube"
          defaultValue={a?.youtube}
          error={fieldErr('youtube')}
        />
        <SocialField
          name="tiktok"
          label="TikTok"
          defaultValue={a?.tiktok}
          error={fieldErr('tiktok')}
        />
        <SocialField
          name="website"
          label="Website"
          defaultValue={a?.website}
          error={fieldErr('website')}
        />
      </fieldset>

      <Field
        label="Commission rate"
        hint="Decimal between 0 and 1 (e.g., 0.2 = 20%). Reference for the monthly Square dashboard report."
        error={fieldErr('commissionRate')}
      >
        <input
          type="number"
          name="commissionRate"
          step="0.0001"
          min="0"
          max="1"
          defaultValue={a?.commissionRate ?? '0.2000'}
          required
        />
      </Field>

      <Field label="Payment method" error={fieldErr('paymentMethod')}>
        <select name="paymentMethod" defaultValue={a?.paymentMethod ?? ''}>
          <option value="">— None —</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Payment email / handle" error={fieldErr('paymentEmail')}>
        <input
          type="text"
          name="paymentEmail"
          maxLength={200}
          defaultValue={a?.paymentEmail ?? ''}
        />
      </Field>

      <Field label="Account login email (self-serve earnings page)" error={fieldErr('accountEmail')}>
        <input
          type="email"
          name="accountEmail"
          maxLength={200}
          placeholder="the email they log in with"
          defaultValue={a?.accountEmail ?? ''}
        />
      </Field>

      <Field label="Admin notes (private)" error={fieldErr('notes')}>
        <textarea name="notes" maxLength={4000} rows={3} defaultValue={a?.notes ?? ''} />
      </Field>

      <button type="submit" style={{ justifySelf: 'start', padding: '0.5rem 1rem' }}>
        {mode === 'create' ? 'Create artist' : 'Save changes'}
      </button>
    </form>
  )
}

function Field({
  label,
  hint,
  error,
  children
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <small style={{ color: '#666' }}>{hint}</small>}
      {error && (
        <span role="alert" style={{ color: '#a33', fontSize: '0.85em' }}>
          {error}
        </span>
      )}
    </div>
  )
}

function SocialField({
  name,
  label,
  defaultValue,
  error
}: {
  name: string
  label: string
  defaultValue?: string | null
  error?: string
}): JSX.Element {
  const id = `social-${name}`
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="url" name={name} defaultValue={defaultValue ?? ''} />
      {error && (
        <span role="alert" style={{ color: '#a33', fontSize: '0.85em' }}>
          {error}
        </span>
      )}
    </div>
  )
}
