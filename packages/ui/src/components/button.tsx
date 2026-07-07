import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { buttonVariants, type ButtonVariantProps } from "@voya/ui/components/button-variants";
import { cn } from "@voya/ui/lib/utils";

export type ButtonProps = React.ComponentPropsWithRef<"button"> &
  ButtonVariantProps & {
  asChild?: boolean;
};

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button };
