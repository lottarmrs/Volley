import React, { useRef } from 'react';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  id?: string;
}

export function OtpInput({ value, onChange, length = 6, disabled = false, id }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const digits = Array.from({ length }, (_, i) => value[i] || '');

  const handleChange = (index: number, val: string) => {
    const numericVal = val.replace(/\D/g, '');
    if (!numericVal) {
      // Clear digit
      const nextDigits = [...digits];
      nextDigits[index] = '';
      onChange(nextDigits.join(''));
      return;
    }

    // If pasted multiple digits or typed single digit
    const nextDigits = [...digits];
    if (numericVal.length > 1) {
      // Paste handling
      for (let i = 0; i < numericVal.length && index + i < length; i++) {
        nextDigits[index + i] = numericVal[i];
      }
      onChange(nextDigits.join(''));
      const nextFocus = Math.min(index + numericVal.length, length - 1);
      inputRefs.current[nextFocus]?.focus();
    } else {
      nextDigits[index] = numericVal;
      onChange(nextDigits.join(''));
      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move back and clear previous
        const nextDigits = [...digits];
        nextDigits[index - 1] = '';
        onChange(nextDigits.join(''));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      const nextFocus = Math.min(pastedData.length, length - 1);
      inputRefs.current[nextFocus]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 my-2">
      {Array.from({ length }).map((_, index) => {
        const hasValue = Boolean(digits[index]);
        return (
          <input
            key={index}
            id={index === 0 ? id : undefined}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digits[index]}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={disabled}
            className={`w-11 h-13 sm:w-13 sm:h-14 text-center font-mono text-xl sm:text-2xl font-bold rounded-2xl border transition-all duration-200 shadow-inner ${
              hasValue
                ? 'bg-primary/10 border-primary text-primary shadow-primary/10 scale-[1.03]'
                : 'bg-base-100/70 border-base-300/80 text-base-content hover:border-base-300 focus:border-primary focus:bg-base-100 focus:ring-2 focus:ring-primary/20'
            }`}
            autoFocus={index === 0}
          />
        );
      })}
    </div>
  );
}
