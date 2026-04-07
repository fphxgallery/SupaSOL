import { ReactNode } from 'react';

type BadgeVariant = 'green' | 'red' | 'orange' | 'blue' | 'purple' | 'muted';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

const variantClass: Record<BadgeVariant, string> = {
  green: 'bg-green/10 text-green border-green/20',
  red: 'bg-red/10 text-red border-red/20',
  orange: 'bg-orange/10 text-orange border-orange/20',
  blue: 'bg-blue/10 text-blue border-blue/20',
  purple: 'bg-purple/10 text-purple border-purple/20',
  muted: 'bg-surface-2 text-text-dim border-border',
};

export function Badge({ children, variant = 'muted' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${variantClass[variant]}`}>
      {children}
    </span>
  );
}
