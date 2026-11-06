// A locked desktop can report a visible DOM while suspending its frames.
// Read metadata only; never unlock, activate or capture the screen.
import AppKit
import Foundation
let front = NSWorkspace.shared.frontmostApplication
if front == nil || front?.bundleIdentifier == "com.apple.loginwindow" {
    fputs("Native typing benchmark requires an unlocked, active macOS desktop.\n", stderr)
    exit(1)
}
print("Native display preflight passed.")
