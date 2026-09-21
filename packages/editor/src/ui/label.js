import React from "react";
import { cn } from "./cn";

export function Label({ className = "", children, ...props }) {
    return <label className={cn("vte-label", className)} {...props}>{children}</label>;
}
