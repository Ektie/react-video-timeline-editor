import React, { createContext, useContext, useMemo } from "react";
import { cn } from "./cn";

const SelectCtx = createContext(null);

export function Select({
    selectedKey,
    onSelectionChange,
    children,
    className = "",
    "aria-label": ariaLabel,
}) {
    const items = [];
    const collect = (node) => {
        React.Children.forEach(node, (child) => {
            if (!child) return;
            if (child.type === SelectItem) {
                items.push({ id: String(child.props.id), label: child.props.children });
            } else if (child.props?.children) {
                collect(child.props.children);
            }
        });
    };
    collect(children);

    const value = useMemo(
        () => ({ selectedKey: selectedKey == null ? "" : String(selectedKey), items }),
        [selectedKey, items.map((item) => item.id).join(",")]
    );

    return (
        <SelectCtx.Provider value={value}>
            <label className={cn("vte-select", className)}>
                <select
                    aria-label={ariaLabel}
                    value={value.selectedKey}
                    onChange={(event) => onSelectionChange?.(event.target.value)}
                >
                    {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                </select>
                <span className="vte-select-hidden">{children}</span>
            </label>
        </SelectCtx.Provider>
    );
}

export function SelectTrigger({ className, children }) {
    return <span className={className}>{children}</span>;
}

export function SelectValue() {
    const ctx = useContext(SelectCtx);
    const current = ctx?.items.find((item) => item.id === ctx.selectedKey);
    return <span>{current?.label || ctx?.selectedKey || ""}</span>;
}

export function SelectContent({ children }) {
    return <>{children}</>;
}

export function SelectItem({ children }) {
    return <>{children}</>;
}
