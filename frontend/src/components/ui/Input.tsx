import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  suffix?: ReactNode;
  prefix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, suffix, prefix, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-text-dim font-medium">{label}</label>}
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-text-dim text-sm">{prefix}</span>}
        <input
          ref={ref}
          className={`w-full bg-surface-2 border ${error ? 'border-red' : 'border-border'} rounded-lg text-sm text-text placeholder-muted focus:outline-none focus:border-blue transition-colors ${prefix ? 'pl-8' : 'pl-3'} ${suffix ? 'pr-16' : 'pr-3'} py-2 ${className}`}
          {...props}
        />
        {suffix && <span className="absolute right-3 text-text-dim text-xs">{suffix}</span>}
      </div>
      {error && <span className="text-xs text-red">{error}</span>}
    </div>
  )
);

Input.displayName = 'Input';
