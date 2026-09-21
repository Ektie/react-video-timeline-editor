"use client";

import dynamic from "next/dynamic";

const EditorDemo = dynamic(() => import("./EditorDemo"), {
    ssr: false,
    loading: () => <p className="demo-lead">Loading editor…</p>,
});

export default function EditorHost() {
    return <EditorDemo />;
}
