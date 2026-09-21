import React from "react";
import { cn } from "./cn";

export const Input = React.forwardRef(function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={cn("vte-input", className)} {...props} />;
});
