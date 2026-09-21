import React from "react";
import { cn } from "./cn";

export default function Button({
    variant = "default",
    size = "md",
    className = "",
    children,
    disabled,
    type = "button",
    onClick,
    onPress,
    ...props
}) {
    return (
        <button
            type={type}
            className={cn("vte-btn", `vte-btn-${variant}`, `vte-btn-${size}`, className)}
            disabled={disabled}
            onClick={onClick || onPress}
            {...props}
        >
            {children}
        </button>
    );
}
