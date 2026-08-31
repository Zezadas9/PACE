/** Form controls. */

import type { ReactElement, ReactNode } from 'react';

export function Field({
  label, hint, error, children, htmlFor,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}): ReactElement {
  return (
    <div className="field">
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {error ? <span className="error">{error}</span> : null}
      {!error && hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Controlled when given `value` + `onChange`; uncontrolled when given
 * `defaultValue` + `onBlur`.
 *
 * The uncontrolled form exists for fields that commit on blur. A controlled
 * input whose onChange does not write back is unusable — React reverts every
 * keystroke to the model value, so the user cannot type at all.
 */
export interface InputProps {
  id?: string;
  type?: 'text' | 'number' | 'date';
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  placeholder?: string;
  unit?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  min?: number | string;
  max?: number | string;
  step?: number;
  maxLength?: number;
  invalid?: boolean;
  autoComplete?: string;
}

export function Input({
  id, type = 'text', value, defaultValue, onChange, onBlur, placeholder, unit,
  inputMode, min, max, step, maxLength, invalid, autoComplete = 'off',
}: InputProps): ReactElement {
  const controlled = value !== undefined;

  const field = (
    <input
      id={id}
      className="input"
      type={type}
      {...(controlled
        ? { value, onChange: (event) => onChange?.(event.target.value) }
        : { defaultValue })}
      placeholder={placeholder}
      inputMode={inputMode}
      min={min}
      max={max}
      step={step}
      maxLength={maxLength}
      autoComplete={autoComplete}
      aria-invalid={invalid || undefined}
      onBlur={onBlur ? (event) => onBlur(event.target.value) : undefined}
    />
  );

  if (!unit) return field;
  return (
    <div className="input-unit">
      {field}
      <span className="unit">{unit}</span>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
}

export function Segmented<T extends string>({
  options, value, onChange, ariaLabel,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}): ReactElement {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

