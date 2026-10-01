export function hasArg(flag) {
    return process.argv.includes(flag);
}
export function isDryRunEnabled() {
    return hasArg("--dry-run");
}
export function isNonInteractiveMode() {
    return hasArg("--no-interactive") || !process.stdin.isTTY || !process.stdout.isTTY;
}
export function isCompactMode() {
    return hasArg("--compact");
}
export function wantsJson(opts) {
    return Boolean(opts?.json) || isCompactMode();
}
//# sourceMappingURL=runtime.js.map