import React from "react";
import { cn } from "./cn";

export function Separator({ orientation = "horizontal", className = "" }) {
    return (
        <span
            role="separator"
            aria-orientation={orientation}
            className={cn("vte-sep", orientation === "vertical" && "is-vertical", className)}
        />
    );
}
