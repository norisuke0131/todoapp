// shadcn/ui の Button を KURA のトークンに合わせて上書き
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded font-bold transition-colors duration-80 disabled:cursor-not-allowed disabled:opacity-100 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-d disabled:bg-line disabled:text-ink-500',
        secondary: 'border border-line-hi bg-panel text-ink-900 hover:bg-panel-alt disabled:text-ink-400',
        ghost: 'text-ink-600 hover:bg-panel-alt hover:text-ink-900 disabled:text-ink-400',
        danger: 'bg-st-stockout text-white hover:brightness-90',
      },
      size: {
        sm: 'h-7 px-2.5 text-[12px]',
        md: 'h-9 px-3.5 text-body',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  },
)
Button.displayName = 'Button'

export { buttonVariants }
