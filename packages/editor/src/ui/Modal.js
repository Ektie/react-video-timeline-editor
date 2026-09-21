import React, { useEffect } from "react";
import { cn } from "./cn";
import Icon from "./Icon";
import Button from "./Button";

export default function Modal({
    open,
    onClose,
    title,
    children,
    footer,
    size = "md",
    showCloseButton = true,
    headerActions = null,
    bodyClassName = "",
}) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
            if (event.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="vte-modal-backdrop" onClick={() => onClose?.()} role="presentation">
            <div
                className={cn("vte-modal", `vte-modal-${size}`)}
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
            >
                {(title || headerActions || showCloseButton) && (
                    <header className="vte-modal-header">
                        {title ? <h2 className="vte-modal-title">{title}</h2> : <span />}
                        <span className="vte-modal-header-actions">
                            {headerActions}
                            {showCloseButton && (
                                <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
                                    <Icon name="x" size={14} />
                                </Button>
                            )}
                        </span>
                    </header>
                )}
                <div className={cn("vte-modal-body", bodyClassName)}>{children}</div>
                {footer ? <footer className="vte-modal-footer">{footer}</footer> : null}
            </div>
        </div>
    );
}
