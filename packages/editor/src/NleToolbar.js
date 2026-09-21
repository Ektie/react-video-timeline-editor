import React from "react";
import { Button, Icon, Tooltip } from "./ui";
import { Toggle } from "./ui";
import { Separator } from "./ui";
import { cn } from "./ui";

const ICON = "shrink-0 rounded-md";
const LABELED = "h-7 shrink-0 rounded-md px-2.5";

/**
 * Timeline chrome. Icon-only controls are outline buttons with a tooltip that
 * says what the control does — never a ghost circle, never a disabled-reason.
 */
export function ToolButton({
    tooltip,
    label = null,
    className,
    children,
    ...props
}) {
    return (
        <Tooltip text={tooltip}>
            <Button
                type="button"
                variant="outline"
                size={label ? "sm" : "icon-sm"}
                className={cn(label ? LABELED : ICON, className)}
                {...props}
                aria-label={props["aria-label"] || tooltip}
            >
                {children}
                {label}
            </Button>
        </Tooltip>
    );
}

export function ToolToggle({
    tooltip,
    label = null,
    isSelected = false,
    className,
    children,
    ...props
}) {
    return (
        <Tooltip text={tooltip}>
            <Toggle
                variant="outline"
                size="sm"
                isSelected={isSelected}
                className={cn(
                    "rounded-md",
                    label ? LABELED : "size-7 px-0",
                    isSelected && "border-human/40 bg-human/10 text-human hover:bg-human/15 hover:text-human",
                    className
                )}
                {...props}
                aria-label={props["aria-label"] || tooltip}
            >
                {children}
                {label}
            </Toggle>
        </Tooltip>
    );
}

export function ToolSep() {
    return <Separator orientation="vertical" className="mx-1.5 h-5" />;
}

export function TrackToolButton({ tooltip, isOn = false, danger = false, className, children, ...props }) {
    return (
        <Tooltip text={tooltip}>
            <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className={cn(
                    "rounded-md",
                    isOn && "border-human/50 bg-human/25 text-human-foreground hover:bg-human/30",
                    danger && "hover:border-destructive/50 hover:bg-destructive/20",
                    className
                )}
                {...props}
                aria-label={props["aria-label"] || tooltip}
            >
                {children}
            </Button>
        </Tooltip>
    );
}

export function CtxItem({ shortcut, isActive = false, className, children, ...props }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            role="menuitem"
            className={cn(
                "h-auto w-full justify-between rounded-md px-2.5 py-1.5 font-normal",
                isActive && "bg-human/10 font-semibold text-human",
                className
            )}
            {...props}
        >
            <span>{children}</span>
            {shortcut ? <kbd>{shortcut}</kbd> : null}
        </Button>
    );
}

export { ICON, LABELED, Icon };
