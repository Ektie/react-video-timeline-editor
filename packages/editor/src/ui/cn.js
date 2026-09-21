export function cn(...parts) {
    return parts.flat(Infinity).filter(Boolean).join(" ");
}
