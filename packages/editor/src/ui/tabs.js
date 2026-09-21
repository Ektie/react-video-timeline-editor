import React, { createContext, useContext } from "react";
import { cn } from "./cn";

const TabsCtx = createContext({ selectedKey: null, onSelectionChange: () => {} });

export function Tabs({ selectedKey, onSelectionChange, children, className = "" }) {
    return (
        <TabsCtx.Provider value={{ selectedKey, onSelectionChange }}>
            <div className={cn("vte-tabs", className)}>{children}</div>
        </TabsCtx.Provider>
    );
}

export function TabsList({ children, className = "" }) {
    return <div className={cn("vte-tabs-list", className)} role="tablist">{children}</div>;
}

export function TabsTrigger({ id, children, className = "" }) {
    const { selectedKey, onSelectionChange } = useContext(TabsCtx);
    const selected = String(selectedKey) === String(id);
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn("vte-tab", selected && "is-selected", className)}
            onClick={() => onSelectionChange?.(id)}
        >
            {children}
        </button>
    );
}
