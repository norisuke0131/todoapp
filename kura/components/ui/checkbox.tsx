'use client'
// shadcn/ui の Checkbox（Radix 基盤）。一部選択（indeterminate）にも対応
import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'grid size-4 shrink-0 place-items-center rounded-sm border border-ink-400 bg-panel transition-colors duration-80',
      'data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-white">
      {props.checked === 'indeterminate' ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : (
        <Check className="size-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = 'Checkbox'
