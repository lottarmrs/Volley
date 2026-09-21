import React from 'react';

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  error,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <label className="form-control">
      <span className="label-text">{label}</span>
      <input
        type={type}
        className="input input-bordered"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      {error && <span className="label-text-alt text-error">{error}</span>}
    </label>
  );
}
