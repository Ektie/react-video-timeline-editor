import React, { useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";

export function DropdownMenuTrigger({ children, className }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (event) => {
            if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener("pointerdown", onDoc);
        return () => document.removeEventListener("pointerdown", onDoc);
    }, [open]);

    const nodes = React.Children.toArray(children);
    const trigger = nodes[0];
    const menu = nodes[1];

    return (
        <span ref={rootRef} className={cn("vte-menu", className)}>
            {React.cloneElement(trigger, {
                "aria-haspopup": "menu",
                "aria-expanded": open,
                "aria-controls": menuId,
                onClick: (event) => {
                    trigger.props.onClick?.(event);
                    setOpen((value) => !value);
                },
            })}
            {open && menu
                ? React.cloneElement(menu, {
                    id: menuId,
                    onClose: () => setOpen(false),
                })
                : null}
        </span>
    );
}

export function DropdownMenu({ children, className = "", onClose, id, placement }) {
    return (
        <div id={id} role="menu" className={cn("vte-menu-list", className)} data-placement={placement}>
            {React.Children.map(children, (child) => (
                child ? React.cloneElement(child, { onClose }) : child
            ))}
        </div>
    );
}

export function DropdownMenuItem({
    children,
    className = "",
    onAction,
    onClose,
    textValue,
    ...props
}) {
    return (
        <button
            type="button"
            role="menuitem"
            className={cn("vte-menu-item", className)}
            onClick={() => {
                onAction?.();
                onClose?.();
            }}
            {...props}
        >
            {children}
        </button>
    );
}
