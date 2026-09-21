import React from "react";
import { cn } from "./cn";

export function Switch({
    checked = false,
    onCheckedChange,
    className = "",
    isSelected,
    onChange,
    ...props
}) {
    const on = checked === true || isSelected === true;
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            className={cn("vte-switch", on && "is-on", className)}
            onClick={() => {
                onCheckedChange?.(!on);
                onChange?.(!on);
            }}
            {...props}
        />
    );
}
