import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "trapezio bg-primary text-primary-foreground font-label uppercase tracking-[0.14em] text-xs font-bold hover:bg-primary-hot shadow-glow",
        corp: "trapezio bg-primary text-primary-foreground font-label uppercase tracking-[0.14em] text-xs font-bold hover:bg-primary-hot shadow-glow",
        corpOutline:
          "trapezio border border-primary/40 bg-transparent text-primary font-label uppercase tracking-[0.14em] text-xs font-bold hover:border-primary hover:bg-primary/10",
        destructive:
          "trapezio bg-destructive text-destructive-foreground font-label uppercase tracking-[0.14em] text-xs font-bold hover:bg-destructive/85",
        outline:
          "border border-border bg-surface text-body hover:border-primary/50 hover:text-foreground",
        secondary: "bg-surface text-foreground border border-border hover:border-primary/40",
        ghost: "text-muted-foreground hover:text-primary hover:bg-primary/5",
        ghostCorp:
          "text-muted-foreground font-label uppercase tracking-[0.14em] text-xs hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
