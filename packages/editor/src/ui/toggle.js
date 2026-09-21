import React from "react";
import { cn } from "./cn";

export function Toggle({
    isSelected = false,
    onChange,
    className = "",
    children,
    variant = "outline",
    size = "sm",
    ...props
}) {
    return (
        <button
            type="button"
            aria-pressed={isSelected}
            className={cn("vte-toggle", isSelected && "is-on", className)}
            onClick={() => onChange?.(!isSelected)}
            {...props}
        >
            {children}
        </button>
    );
}
