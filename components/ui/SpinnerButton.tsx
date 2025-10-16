"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type SpinnerButtonProps = React.ComponentProps<typeof Button> & {
  loading?: boolean;
  loadingText?: string;
  spinnerPlacement?: "left" | "right";
};

export function SpinnerButton({
  loading = false,
  loadingText = "Loading…",
  spinnerPlacement = "left",
  disabled,
  children,
  className,
  ...props
}: SpinnerButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Button
      aria-busy={loading || undefined}
      disabled={isDisabled}
      className={className}
      {...props}
    >
      {loading ? (
        spinnerPlacement === "left" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {loadingText}
          </>
        ) : (
          <>
            {loadingText}
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          </>
        )
      ) : (
        children
      )}
    </Button>
  );
}

export default SpinnerButton;
